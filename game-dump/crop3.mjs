import { readPng, crop, writePng } from "./png.mjs";
import { PANEL } from "./ocr-core.mjs";
for (const p of ["p00","p01","p02"]) {
  const img = readPng(`device/minglun-shots/${p}.png`);
  writePng(`device/panel-${p}.png`, crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h));
}
console.log("已导出 panel-p00/p01/p02.png");
