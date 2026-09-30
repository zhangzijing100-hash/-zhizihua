// 在面板区域里直接找「数字标签」：白色字形 + 黑色描边。
// 思路：暗掩膜连通域 → 过滤出「有亮色内部的、尺寸像数字的」→ 按行列聚成网格。
import fs from "node:fs";
import { readPng, gray, crop, writePng } from "./png.mjs";

const file = process.argv[2] ?? "device/minglun-shots/p00.png";
const PANEL = { x: 950, y: 330, w: 907, h: 640 };

const img = readPng(file);
const { x: px, y: py, w: pw, h: ph } = PANEL;

// 1) 暗掩膜 + 亮掩膜
const N = pw * ph;
const dark = new Uint8Array(N);
const light = new Uint8Array(N);
for (let y = 0; y < ph; y++) {
  for (let x = 0; x < pw; x++) {
    const g = gray(img, px + x, py + y);
    const i = y * pw + x;
    if (g < 70) dark[i] = 1;
    if (g > 195) light[i] = 1;
  }
}

// 2) 连通域（4 邻接、迭代栈）
const comp = new Int32Array(N).fill(-1);
const boxes = [];
const stack = new Int32Array(N);
for (let i = 0; i < N; i++) {
  if (!dark[i] || comp[i] >= 0) continue;
  const id = boxes.length;
  let sp = 0; stack[sp++] = i; comp[i] = id;
  let minX = 1e9, maxX = -1, minY = 1e9, maxY = -1, count = 0, lightIn = 0;
  while (sp > 0) {
    const p = stack[--sp];
    const x = p % pw, y = (p - x) / pw;
    count++;
    if (light[p]) lightIn++;
    if (x < minX) minX = x; if (x > maxX) maxX = x;
    if (y < minY) minY = y; if (y > maxY) maxY = y;
    if (x > 0 && dark[p - 1] && comp[p - 1] < 0) { comp[p - 1] = id; stack[sp++] = p - 1; }
    if (x < pw - 1 && dark[p + 1] && comp[p + 1] < 0) { comp[p + 1] = id; stack[sp++] = p + 1; }
    if (y > 0 && dark[p - pw] && comp[p - pw] < 0) { comp[p - pw] = id; stack[sp++] = p - pw; }
    if (y < ph - 1 && dark[p + pw] && comp[p + pw] < 0) { comp[p + pw] = id; stack[sp++] = p + pw; }
  }
  boxes.push({ id, minX, maxX, minY, maxY, w: maxX - minX + 1, h: maxY - minY + 1, count, lightIn });
}

// 2b) 亮像素的积分图，用来快速统计任意矩形里有多少亮像素
const integral = new Int32Array((pw + 1) * (ph + 1));
for (let y = 0; y < ph; y++) {
  let rowSum = 0;
  for (let x = 0; x < pw; x++) {
    rowSum += light[y * pw + x];
    integral[(y + 1) * (pw + 1) + (x + 1)] = integral[y * (pw + 1) + (x + 1)] + rowSum;
  }
}
function lightInRect(x0, y0, x1, y1) {
  return integral[(y1 + 1) * (pw + 1) + (x1 + 1)]
    - integral[y0 * (pw + 1) + (x1 + 1)]
    - integral[(y1 + 1) * (pw + 1) + x0]
    + integral[y0 * (pw + 1) + x0];
}

// 3) 数字组：跳过标题栏(y<45)，高度像数字，外接框里有足够的白色（白字黑边）
const cand = boxes
  .map((b) => ({ ...b, boxLight: lightInRect(b.minX, b.minY, b.maxX, b.maxY) }))
  .filter((b) => b.minY > 40 && b.h >= 16 && b.h <= 50 && b.w >= 8 && b.w <= 150
    && b.boxLight > b.w * b.h * 0.12 && b.count < b.w * b.h * 0.8);
console.log(`连通域 ${boxes.length} 个，其中像数字的 ${cand.length} 个`);

// 4) 按 y 聚类成行
cand.sort((a, b) => a.minY - b.minY || a.minX - b.minX);
const rows = [];
for (const b of cand) {
  const row = rows.find((r) => Math.abs(r.y - b.minY) < 25);
  if (row) { row.items.push(b); row.y = Math.min(row.y, b.minY); }
  else rows.push({ y: b.minY, items: [b] });
}
rows.sort((a, b) => a.y - b.y);
console.log(`\n识别出 ${rows.length} 行：`);
rows.forEach((r, i) => {
  r.items.sort((a, b) => a.minX - b.minX);
  const cells = r.items.map((b) => `x${b.minX}-${b.maxX}(w${b.w},h${b.h})`).join("  ");
  console.log(`  行${i}  y=${r.y}..${r.y + 40}  ${r.items.length} 个: ${cells}`);
});

// 5) 把候选全裁出来拼成一张联系表，方便人工核对
const CW = 150, CH = 60, COLS = 5;
const list = rows.flatMap((r) => r.items);
const sheetRows = Math.ceil(list.length / COLS);
const sheet = { width: CW * COLS, height: CH * sheetRows, data: Buffer.alloc(CW * COLS * CH * sheetRows * 4, 0x20) };
list.forEach((b, i) => {
  const cx = b.minX - 6, cy = b.minY - 8, cw = Math.min(CW, b.w + 12), chh = Math.min(CH, b.h + 16);
  const sub = crop(img, px + Math.max(0, cx), py + Math.max(0, cy), cw, chh);
  const col = i % COLS, row = Math.floor(i / COLS);
  for (let y = 0; y < chh; y++) for (let x = 0; x < cw; x++) {
    const s = (y * sub.width + x) * 4;
    const d = ((row * CH + y) * sheet.width + col * CW + x) * 4;
    sub.data.copy(sheet.data, d, s, s + 4);
  }
});
writePng("device/digits-sheet.png", sheet);
console.log(`\n联系表已写出：device/digits-sheet.png  ${sheet.width}x${sheet.height}（${list.length} 个候选）`);
