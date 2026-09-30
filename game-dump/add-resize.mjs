import fs from "node:fs";
let t = fs.readFileSync("png.mjs","utf8");
if (!t.includes("export function resize")) {
  t += `

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
`;
  fs.writeFileSync("png.mjs", t, "utf8");
  console.log("已给 png.mjs 加上 resize");
} else console.log("resize 已存在");
