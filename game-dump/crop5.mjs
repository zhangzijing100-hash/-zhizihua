import { readPng, crop, writePng } from "./png.mjs";
import { PANEL } from "./ocr-core.mjs";
const img = readPng("device/shots2/t03.png");
writePng("device/shots2/panel-t03.png", crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h));
console.log("ok");
