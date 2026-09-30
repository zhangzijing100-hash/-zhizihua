// 按固定几何切出每格的数字窗口，并把窗口渲染成 ASCII 打印出来核对
import { readPng, gray } from "./png.mjs";

const file = process.argv[2] ?? "device/minglun-shots/p00.png";
const PANEL = { x: 950, y: 330 };
// 面板内几何（从 panel.png 量出来的）
const TILE = { left: 32, top: 32, w: 143, h: 140, pitchX: 177.5, pitchY: 147.7 };
const COLS = 5, ROWS = 4;
// 数字窗口：格子右下角
const WIN = { dx0: -64, dx1: -4, dy0: -50, dy1: -4 };

const img = readPng(file);

function cellWindow(row, col) {
  const right = PANEL.x + TILE.left + col * TILE.pitchX + TILE.w;
  const bottom = PANEL.y + TILE.top + row * TILE.pitchY + TILE.h;
  return {
    x0: Math.round(right + WIN.dx0), x1: Math.round(right + WIN.dx1),
    y0: Math.round(bottom + WIN.dy0), y1: Math.round(bottom + WIN.dy1),
  };
}

for (let row = 0; row < ROWS; row++) {
  for (let col = 0; col < COLS; col++) {
    const w = cellWindow(row, col);
    console.log(`\n### 行${row} 列${col}   窗口 x=${w.x0}..${w.x1} y=${w.y0}..${w.y1}`);
    for (let y = w.y0; y <= w.y1; y += 2) {
      let line = "   ";
      for (let x = w.x0; x <= w.x1; x++) {
        const g = gray(img, x, y);
        line += g < 70 ? "#" : g < 130 ? "+" : g < 190 ? "." : " ";
      }
      console.log(line);
    }
  }
}
