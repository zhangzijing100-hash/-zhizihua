import { readPng, crop, writePng } from "./png.mjs";
function upscale(img, k) {
  const w = img.width * k, h = img.height * k;
  const out = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const s = (Math.floor(y / k) * img.width + Math.floor(x / k)) * 4;
    img.data.copy(out, (y * w + x) * 4, s, s + 4);
  }
  return { width: w, height: h, data: out };
}
const img = readPng("device/minglun-shots/p00.png");
const panel = crop(img, 935, 334, 922, 634);
writePng("device/panel.png", panel);
console.log("panel.png 已写出 922x634");
writePng("device/panel-2x.png", upscale(panel, 2));
console.log("panel-2x.png 已写出");
// 左上角第一格
writePng("device/cell0-6x.png", upscale(crop(img, 935, 374, 185, 158), 6));
console.log("cell0-6x.png 已写出（第一格放大 6 倍）");
