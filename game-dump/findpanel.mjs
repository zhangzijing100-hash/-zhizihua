import { readPng, gray } from "./png.mjs";
const img = readPng("device/minglun-shots/p00.png");
console.log(`尺寸 ${img.width}x${img.height}  通道=${img.channels}`);
// 找面板：中间区域亮色块。逐行统计「亮像素(>150)」占比
const rows = [], cols = new Array(img.width).fill(0);
for (let y = 0; y < img.height; y++) {
  let n = 0;
  for (let x = 0; x < img.width; x++) if (gray(img, x, y) > 150) { n++; cols[x]++; }
  rows.push(n);
}
const bright = rows.map((v, i) => ({ y: i, v })).filter((r) => r.v > 200);
console.log(`亮行范围: ${bright.length ? bright[0].y : "-"} .. ${bright.length ? bright[bright.length-1].y : "-"}  （共 ${bright.length} 行）`);
const brightCols = cols.map((v, i) => ({ x: i, v })).filter((c) => c.v > 100);
console.log(`亮列范围: ${brightCols.length ? brightCols[0].x : "-"} .. ${brightCols.length ? brightCols[brightCols.length-1].x : "-"}  （共 ${brightCols.length} 列）`);
// 打印面板区几行的亮度剖面，定位网格
const y0 = bright.length ? bright[0].y : 0;
const y1 = bright.length ? bright[bright.length-1].y : img.height-1;
console.log(`\n在 y=${y0}..${y1} 之间，每 20 行打印一次亮像素数：`);
for (let y = y0; y <= y1; y += 20) console.log(`  y=${y}  ${rows[y]}`);
