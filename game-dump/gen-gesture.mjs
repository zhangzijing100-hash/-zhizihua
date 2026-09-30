// 生成打开调试控制台的触摸脚本。
import { writeFileSync } from "node:fs";
//
// 依据 debugman.lua 反汇编：
//   · CalcAng(x1,y1,x2,y2) = atan2(y2-y1, x2-x1)  → 角度基于「从锚点到当前点」的方位
//   · 每段方向必须 >64px 才被记录，方向变化 >30° 才算一段（P0 闭包，容差 30）
//   · 需要 30 段，方向循环必须是：
//       [90,180] → [-90,0] → [±180] → [0,90] → [-180,-90] → 循环 6 次
//   · 触碰台：ABS_MT_POSITION_X 0..1080, Y 0..1920
//
// 每段发 3 个点（从当前锚点 O 量）：
//   S1 = O + 80*u(d)     → 确立本段方向（U[4] = d）
//   S2 = O + 140*u(d)    → 把 U[1] 推远，保证 dist>64 能被记录
//   T  = O + 100*u(d')   → 方位变成下一段方向 → 触发换段，锚点移到 T

const DIRS = [135, -45, 175, 45, -135];   // 一个循环；175 代替 180 避开浮点边界
const SEGMENTS = 30;                      // 6 个循环
const OUT1 = 80, OUT2 = 140, TURN = 100;

const u = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

const dirs = [];
for (let i = 0; i < SEGMENTS; i++) dirs.push(DIRS[i % 5]);

// 先按原点 (0,0) 铺一遍，算包围盒，再平移进屏幕
const pts = [[0, 0]];          // [0] = 按下点 = 第一个锚点 O1
let O = [0, 0];
for (let i = 0; i < SEGMENTS; i++) {
  const [ux, uy] = u(dirs[i]);
  const s1 = [O[0] + OUT1 * ux, O[1] + OUT1 * uy];
  const s2 = [O[0] + OUT2 * ux, O[1] + OUT2 * uy];
  pts.push(s1, s2);
  if (i < SEGMENTS - 1) {
    const [vx, vy] = u(dirs[i + 1]);
    const t = [O[0] + TURN * vx, O[1] + TURN * vy];
    pts.push(t);
    O = t;
  }
}
const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
const W = 1080, H = 1920, M = 20;
console.log(`原始包围盒 x[${minX.toFixed(0)},${maxX.toFixed(0)}] y[${minY.toFixed(0)},${maxY.toFixed(0)}]  宽=${(maxX - minX).toFixed(0)} 高=${(maxY - minY).toFixed(0)}`);
const dx = (W - (maxX - minX)) / 2 - minX;
const dy = (H - (maxY - minY)) / 2 - minY;
const final = pts.map((p) => [Math.round(p[0] + dx), Math.round(p[1] + dy)]);
console.log(`平移 (${dx.toFixed(0)}, ${dy.toFixed(0)}) → 最后一个点 ${final[final.length - 1]}`);

const D = "/dev/input/event4";
const lines = ["#!/system/bin/sh", `D=${D}`, "SE() { sendevent $D 3 53 $1; sendevent $D 3 54 $2; sendevent $D 0 0 0; }",
  "# ---- TOUCH DOWN ----",
  "sendevent $D 3 47 0", "sendevent $D 3 57 777", `SE ${final[0][0]} ${final[0][1]}`, "sleep 0.15"];
final.slice(1).forEach((p, i) => {
  lines.push(`SE ${p[0]} ${p[1]}   # seg ${Math.floor(i / 3) + 1}`);
  lines.push("sleep 0.045");
});
lines.push("# ---- TOUCH UP ----", "sendevent $D 3 57 -1", "sendevent $D 0 0 0", "");

const out = process.argv[2] ?? "gesture.sh";
writeFileSync(out, lines.join("\n"), "utf8");
console.log(`写了 ${out}：${final.length} 个点，约 ${(final.length * 0.045 + 0.15).toFixed(1)} 秒`);
