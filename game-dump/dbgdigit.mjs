import { readPng, gray } from "./png.mjs";
const img = readPng("device/minglun-shots/p00.png");
console.log(`图 ${img.width}x${img.height}`);
// 在已知的「7」附近采样（估坐标 1087,464）
for (const [cx, cy, label] of [[1087,464,"数字7附近"],[1000,470,"格子中部"],[1700,900,"右下格子"]]) {
  console.log(`\n--- ${label} (${cx},${cy}) ---`);
  for (let y = cy - 14; y <= cy + 14; y += 4) {
    let row = "";
    for (let x = cx - 20; x <= cx + 20; x += 2) {
      const g = gray(img, x, y);
      row += g < 60 ? "#" : g < 100 ? "+" : g < 150 ? "-" : g < 200 ? "." : " ";
    }
    console.log(`  y=${y}  |${row}|`);
  }
}
// 面板内灰度直方图
console.log("\n--- 面板内灰度直方图 (950,330)-(1857,970) ---");
const hist = new Array(16).fill(0);
for (let y = 330; y < 970; y += 2) for (let x = 950; x < 1857; x += 2) hist[Math.min(15, Math.floor(gray(img,x,y)/16))]++;
hist.forEach((n,i)=>console.log(`  ${String(i*16).padStart(3)}-${i*16+15}: ${n}`));
