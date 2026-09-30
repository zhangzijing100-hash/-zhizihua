// 量每格格子的底色，按色相/饱和度分类品质（彩=UR 金=SSR 紫=SR 蓝=R）
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

function classify(h, s, v) {
  if (s < 0.12) return "灰(无彩)";
  if (h >= 15 && h < 65) return "金/橙(SSR?)";
  if (h >= 65 && h < 160) return "绿";
  if (h >= 160 && h < 215) return "青/蓝(R?)";
  if (h >= 215 && h < 275) return "蓝/紫";
  if (h >= 275 && h < 330) return "紫(SR?)";
  return "红/粉";
}

const img = readPng(process.argv[2] ?? "device/minglun-shots/p00.png");
console.log("格  平均RGB            色相   饱和   明度   分类");
const grid = [];
for (let row = 0; row < ROWS; row++) {
  const line = [];
  for (let col = 0; col < COLS; col++) {
    const x0 = Math.round(PANEL.x + TILE.left + col * TILE.pitchX);
    const y0 = Math.round(PANEL.y + TILE.top + row * TILE.pitchY);
    // 采样格子左上角一块（那里通常没有图标和数字，最能代表底色）
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = y0 + 6; y < y0 + 40; y += 2)
      for (let x = x0 + 6; x < x0 + 46; x += 2) {
        const i = (y * img.width + x) * 4;
        r += img.data[i]; g += img.data[i + 1]; b += img.data[i + 2]; n++;
      }
    r /= n; g /= n; b /= n;
    const { h, s, v } = rgb2hsv(r, g, b);
    console.log(`行${row + 1}列${col + 1}  (${r.toFixed(0).padStart(3)},${g.toFixed(0).padStart(3)},${b.toFixed(0).padStart(3)})   ${h.toFixed(0).padStart(3)}°  ${s.toFixed(2)}  ${v.toFixed(2)}   ${classify(h, s, v)}`);
    line.push(classify(h, s, v));
  }
  grid.push(line);
}
console.log("\n分类矩阵：");
grid.forEach((l, i) => console.log(`  行${i + 1}: ${l.join("  ")}`));
