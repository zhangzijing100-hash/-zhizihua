// 解开《龙族》的 *.png 资源包。
//
// 格式（逆向出来的）：
//   0x00  4B  magic  EF 23 CA 4D
//   0x04  4B  解压后总大小
//   0x08  4B  0
//   0x0C  4B  magic  B7 89 A0 56
//   0x10  4B  magic  20 78 2A 7B      （短头就只有这 16 字节，数据紧跟着）
//   0x14  4B  03 00 02 00             （长头才有）
//   ...       版权字符串 "Azure File Package, Loong Co. Ltd. ..."
//              然后是一条条 zlib 流，条目之间夹着文件名等元数据
//
// 所以做法是：从头开始扫 zlib 头（78 01 / 78 9C / 78 DA），
// 用 inflateSync({info:true}) 拿到「消耗了多少输入字节」，一跳一跳走完整个文件。
import fs from "node:fs";
import zlib from "node:zlib";

export function unpackPng(path, opts = {}) {
  const buf = fs.readFileSync(path);
  if (buf.readUInt32BE(0) !== 0xEF23CA4D) throw new Error("magic 不对：" + path);
  const declared = buf.readUInt32LE(4);

  const entries = [];
  let off = 16;
  let guard = 0;
  while (off < buf.length - 2 && guard++ < 200000) {
    // 找下一个 zlib 头
    let start = -1;
    for (let i = off; i < buf.length - 2; i++) {
      if (buf[i] === 0x78 && (buf[i + 1] === 0x01 || buf[i + 1] === 0x9c || buf[i + 1] === 0xda)) { start = i; break; }
    }
    if (start < 0) break;
    let r;
    try {
      r = zlib.inflateSync(buf.subarray(start), { info: true, maxOutputLength: 512 * 1024 * 1024 });
    } catch {
      off = start + 1;
      continue;
    }
    const consumed = r.engine ? r.engine.bytesWritten : 0;
    if (!consumed || !r.buffer || r.buffer.length === 0) { off = start + 1; continue; }
    entries.push({ offset: start, data: r.buffer, meta: buf.subarray(off, start) });
    off = start + consumed;
  }
  return { declared, entries, total: buf.length };
}

/** 从条目前面的元数据里抠出可打印路径（长度前缀字符串） */
export function guessName(meta) {
  const s = meta.toString("latin1");
  const m = s.match(/[\w./\\-]{4,200}\.(lua|bny|uasset|uexp|json|txt|xml|png|dat)/);
  return m ? m[0] : null;
}

if (process.argv[1] && process.argv[1].endsWith("unpackpng.mjs")) {
  const f = process.argv[2];
  const { declared, entries, total } = unpackPng(f);
  console.log(`${f}: 文件 ${total} 字节，声明解压后 ${(declared / 1048576).toFixed(1)} MB，解出 ${entries.length} 条`);
  let sum = 0;
  entries.forEach((e, i) => {
    sum += e.data.length;
    if (i < 25) console.log(`  #${i} @0x${e.offset.toString(16)}  ${e.data.length} B  ${guessName(e.meta) ?? "(名字没认出来)"}`);
  });
  console.log(`  合计解出 ${(sum / 1048576).toFixed(1)} MB`);
}
