// 极简 PNG 解码器 —— 只依赖 node:zlib，用来处理 adb screencap 出来的图。
// 支持 8 位深、颜色类型 0/2/4/6（灰/真彩/灰+alpha/真彩+alpha），无隔行。
// 输出统一为 RGBA Buffer。
import fs from "node:fs";
import zlib from "node:zlib";

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export function readPng(file) {
  const buf = fs.readFileSync(file);
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error("不是 PNG");
  let off = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString("latin1", off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    off += 12 + len;
    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
  }
  if (bitDepth !== 8) throw new Error(`只支持 8 位深，实际 ${bitDepth}`);
  if (interlace !== 0) throw new Error("不支持隔行 PNG");
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : colorType === 0 ? 1 : 0;
  if (!channels) throw new Error(`不支持的颜色类型 ${colorType}`);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(width * height * 4);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    if (filter === 1) {
      for (let i = channels; i < stride; i++) line[i] = (line[i] + line[i - channels]) & 0xff;
    } else if (filter === 2) {
      for (let i = 0; i < stride; i++) line[i] = (line[i] + prev[i]) & 0xff;
    } else if (filter === 3) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? line[i - channels] : 0;
        line[i] = (line[i] + ((a + prev[i]) >> 1)) & 0xff;
      }
    } else if (filter === 4) {
      for (let i = 0; i < stride; i++) {
        const a = i >= channels ? line[i - channels] : 0;
        const c = i >= channels ? prev[i - channels] : 0;
        line[i] = (line[i] + paeth(a, prev[i], c)) & 0xff;
      }
    } else if (filter !== 0) throw new Error(`未知过滤器 ${filter}`);
    prev = line;
    const rowBase = y * width * 4;
    for (let x = 0; x < width; x++) {
      const s = x * channels, d = rowBase + x * 4;
      if (channels === 4) { out[d] = line[s]; out[d+1] = line[s+1]; out[d+2] = line[s+2]; out[d+3] = line[s+3]; }
      else if (channels === 3) { out[d] = line[s]; out[d+1] = line[s+1]; out[d+2] = line[s+2]; out[d+3] = 255; }
      else if (channels === 2) { out[d] = out[d+1] = out[d+2] = line[s]; out[d+3] = line[s+1]; }
      else { out[d] = out[d+1] = out[d+2] = line[s]; out[d+3] = 255; }
    }
  }
  return { width, height, channels, data: out };
}

/** 最近邻放大 k 倍 */
export function upscale(img, k) {
  const w = img.width * k, h = img.height * k;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
    img.data.copy(out, (y * w + x) * 4, s, s + 4);
  }
  return { width: w, height: h, data: out };
}

/** 灰度值（0-255） */
export function gray(img, x, y) {
  const i = (y * img.width + x) * 4;
  const d = img.data;
  return (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
}

/** 裁一块出来，返回新的 {width,height,data} */
export function crop(img, x0, y0, w, h) {
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    const src = ((y0 + y) * img.width + x0) * 4;
    img.data.copy(out, y * w * 4, src, src + w * 4);
  }
  return { width: w, height: h, data: out };
}

/** 存成 PNG（只写 RGBA、无过滤、单 IDAT），方便人工看裁剪结果 */
export function writePng(file, img) {
  const { width, height, data } = img;
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    data.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }
  const chunks = [];
  const chunk = (type, payload) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(payload.length);
    const t = Buffer.from(type, "latin1");
    const crcBuf = Buffer.concat([t, payload]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(crcBuf) >>> 0);
    chunks.push(len, t, payload, crc);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  chunk("IHDR", ihdr);
  chunk("IDAT", zlib.deflateSync(raw));
  chunk("IEND", Buffer.alloc(0));
  fs.writeFileSync(file, Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), ...chunks]));
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ 0xffffffff;
}


/** 双线性缩放到指定尺寸（把不同分辨率的面板归一化到基准尺寸，模板才能复用） */
export function resize(img, w, h) {
  const out = Buffer.alloc(w * h * 4);
  const sx = img.width / w, sy = img.height / h;
  for (let y = 0; y < h; y++) {
    const fy = Math.min(img.height - 1, (y + 0.5) * sy - 0.5);
    const y0 = Math.max(0, Math.floor(fy)), y1 = Math.min(img.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < w; x++) {
      const fx = Math.min(img.width - 1, (x + 0.5) * sx - 0.5);
      const x0 = Math.max(0, Math.floor(fx)), x1 = Math.min(img.width - 1, x0 + 1);
      const wx = fx - x0;
      for (let c = 0; c < 4; c++) {
        const p00 = img.data[(y0 * img.width + x0) * 4 + c];
        const p01 = img.data[(y0 * img.width + x1) * 4 + c];
        const p10 = img.data[(y1 * img.width + x0) * 4 + c];
        const p11 = img.data[(y1 * img.width + x1) * 4 + c];
        const top = p00 + (p01 - p00) * wx;
        const bot = p10 + (p11 - p10) * wx;
        out[(y * w + x) * 4 + c] = Math.round(top + (bot - top) * wy);
      }
    }
  }
  return { width: w, height: h, data: out };
}
