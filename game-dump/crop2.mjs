import { readPng, crop, writePng } from "./png.mjs";
function upscale(img, k) {
  const w = img.width*k, h = img.height*k, out = Buffer.alloc(w*h*4);
  for (let y=0;y<h;y++) for (let x=0;x<w;x++) { const s=(Math.floor(y/k)*img.width+Math.floor(x/k))*4; img.data.copy(out,(y*w+x)*4,s,s+4); }
  return { width:w, height:h, data:out };
}
const img = readPng("device/minglun-shots/p00.png");
// 第 1 列（4 个格子，纵向），放大 2.5 倍 -> 看四行的边框差异
const col = crop(img, 950+20, 330+20, 175, 620);
writePng("device/col1-2x.png", upscale(col, 2));
console.log("device/col1-2x.png 已写出（第一列 4 格）");
// 第一行 5 格，放大 2 倍 -> 看横向
const row = crop(img, 950+20, 330+20, 900, 175);
writePng("device/row1-2x.png", upscale(row, 2));
console.log("device/row1-2x.png 已写出（第一行 5 格）");
