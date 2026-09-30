// 品质色判定：对每格统计「高饱和像素」的色相众数（边框才是品质色，内部是压暗的底纹）
import { readPng } from "./png.mjs";
import { PANEL, TILE, COLS, ROWS } from "./ocr.mjs";

function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60; if (h < 0) h += 360;
  }
  return { h, s: max ? d / max : 0, v: max };
}

const img = readPng(process.argv[2] ?? "device/minglun-shots/p00.png");
const rowsOut = [];
for (let row = 0; row < ROWS; row++) {
  const line = [];
  for (let col = 0; col < COLS; col++) {
    const x0 = Math.round(PANEL.x + TILE.left + col * TILE.pitchX);
    const y0 = Math.round(PANEL.y + TILE.top + row * TILE.pitchY);
    // 色相直方图（12 个 bin），只统计饱和度 > 0.25 且不太暗的像素
    const bins = new Array(12).fill(0);
    let satCount = 0, total = 0;
    for (let y = y0; y < y0 + TILE.h; y += 2)
      for (let x = x0; x < x0 + TILE.w; x += 2) {
        const i = (y * img.width + x) * 4;
        const { h, s, v } = rgb2hsv(img.data[i], img.data[i + 1], img.data[i + 2]);
        total++;
        if (s < 0.25 || v < 0.25) continue;
        satCount++;
        bins[Math.min(11, Math.floor(h / 30))]++;
      }
    const best = bins.indexOf(Math.max(...bins));
    const hue = best * 30 + 15;
    let kind;
    if (hue < 60 || hue >= 330) kind = hue >= 330 ? "红/粉" : "金/橙";
    else if (hue < 150) kind = "绿/黄绿";
    else if (hue < 215) kind = "青/蓝";
    else if (hue < 285) kind = "蓝紫";
    else kind = "紫/品红";
    const spread = bins.filter((b) => b > satCount * 0.15).length; // 覆盖多少个色相段 → 彩色=多段
    line.push(`${kind}(h${hue},${spread}段,${(satCount / total * 100).toFixed(0)}%)`);
  }
  rowsOut.push(line);
}
rowsOut.forEach((l, i) => console.log(`行${i + 1}:  ${l.join("   ")}`));
