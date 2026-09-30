import fs from "node:fs";
import { readPng, crop, writePng } from "./png.mjs";
import { PANEL } from "./ocr-core.mjs";
for (const i of ["00","01","02","03"]) {
  const f = `device/shots2/t${i}.png`;
  if (!fs.existsSync(f)) continue;
  const img = readPng(f);
  writePng(`device/shots2/panel-t${i}.png`, crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h));
  console.log(`panel-t${i}.png 已导出`);
}
