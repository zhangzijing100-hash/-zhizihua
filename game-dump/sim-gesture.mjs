// 按 debugman.lua 反汇编出来的逻辑，虚拟跑一遍手势脚本的点序列
import { readFileSync } from "node:fs";

const TOL = 30;       // P0 闭包：方向一致性容差
const MINDIST = 64;   // U[6]

const CalcAng = (x1, y1, x2, y2) => (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
const Distance = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2);
const consistent = (a, b) => {
  if (Math.abs(b - a) < TOL) return true;
  const wa = Math.abs(a - (a >= 0 ? 180 : -180));
  const wb = Math.abs(b - (b >= 0 ? 180 : -180));
  return wa + wb < TOL;
};

// 从 gesture.sh 里把 SE x y 的点抽出来
const pts = [];
for (const line of readFileSync(process.argv[2] ?? "gesture.sh", "utf8").split("\n")) {
  const m = line.match(/^SE (\d+) (\d+)/);
  if (m) pts.push([Number(m[1]), Number(m[2])]);
}
// 按下点 + 移动点（脚本里按下的那个 SE 只发一次，之后每个 SE 是移动）
const down = pts[0];
const moves = pts.slice(1);
console.log(`按下点 ${down}  移动点 ${moves.length} 个\n`);

let U0 = { x: down[0], y: down[1] }, U1 = { x: down[0], y: down[1] }, U4 = null;
const collected = [];

for (const [x, y] of moves) {
  if (U0.x === x && U0.y === y) continue;                     // 位置没变
  const ang = CalcAng(U0.x, U0.y, x, y);
  if (U4 === null) { U4 = ang; continue; }                    // 第一次移动：只记方向
  if (consistent(U4, ang)) { U1 = { x, y }; continue; }        // 同向：锚点跟着走
  const d = Distance(U1.x, U1.y, U0.x, U0.y);                  // 换向：结算上一段
  if (d > MINDIST) collected.push(U4);
  U0 = { x, y }; U1 = { x, y }; U4 = null;
}
{ // 抬手
  const d = Distance(U1.x, U1.y, U0.x, U0.y);
  if (d > MINDIST) collected.push(U4);
}

console.log(`收集到 ${collected.length} 段（需要 30）`);
console.log("方向序列: " + collected.map((a) => a.toFixed(1)).join(" "));

// 模式表（来自 t-gesture.mjs 的还原结果，取前 5 个相位即可覆盖）
const CYCLE = [[90, 180], [-90, 0], [135, 180, -180, -135], [0, 90], [-180, -90]];
const inRange = (a, r) => {
  if (r.length === 2) return r[0] <= a && a <= r[1];
  return (r[0] <= a && a <= r[1]) || (r[2] <= a && a <= r[3]);
};
let ok = false;
for (let phase = 0; phase < 5 && !ok; phase++) {
  if (collected.length !== 30) break;
  let all = true;
  for (let i = 0; i < 30; i++) {
    const r = CYCLE[(i + phase) % 5];
    if (!inRange(collected[i], r)) { all = false; break; }
  }
  if (all) { ok = true; console.log(`\n✅ 匹配成功（相位 ${phase}）→ 会打开控制台`); }
}
if (!ok) {
  console.log("\n❌ 未匹配。逐段对照（相位 0）：");
  for (let i = 0; i < Math.max(collected.length, 30); i++) {
    const a = collected[i];
    const r = CYCLE[i % 5];
    const good = a !== undefined && inRange(a, r);
    if (!good) console.log(`  第 ${i + 1} 段: ${a === undefined ? "缺" : a.toFixed(1)}  期望 ${JSON.stringify(r)}  ✗`);
  }
}
