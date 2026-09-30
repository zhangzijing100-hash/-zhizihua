// 用 `input motionevent` 合成手势（逻辑坐标 1920x1080，跟截图同一套）
import { writeFileSync } from "node:fs";

const DIRS = (process.env.DIRS ? process.env.DIRS.split(",").map(Number) : [135, -45, 175, 45, -135]);
const SEGMENTS = 30;
const OUT1 = 80, OUT2 = 140, TURN = 100;
const W = 1920, H = 1080, M = 40;

const u = (deg) => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const dirs = Array.from({ length: SEGMENTS }, (_, i) => DIRS[i % 5]);

const pts = [[0, 0]];
let O = [0, 0];
for (let i = 0; i < SEGMENTS; i++) {
  const [ux, uy] = u(dirs[i]);
  pts.push([O[0] + OUT1 * ux, O[1] + OUT1 * uy], [O[0] + OUT2 * ux, O[1] + OUT2 * uy]);
  if (i < SEGMENTS - 1) {
    const [vx, vy] = u(dirs[i + 1]);
    O = [O[0] + TURN * vx, O[1] + TURN * vy];
    pts.push(O);
  }
}
const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
const dx = (W - (Math.max(...xs) - Math.min(...xs))) / 2 - Math.min(...xs);
const dy = (H - (Math.max(...ys) - Math.min(...ys))) / 2 - Math.min(...ys);
const P = pts.map((p) => [Math.round(p[0] + dx), Math.round(p[1] + dy)]);

// 检查每个点都在屏内
const bad = P.filter((p) => p[0] < 0 || p[0] > W || p[1] < 0 || p[1] > H);
if (bad.length) console.log(`⚠️ ${bad.length} 个点出界: ${JSON.stringify(bad.slice(0, 5))}`);

console.log(`按下点 ${P[0]}  共 ${P.length} 个点  包围盒 x[${Math.min(...xs) + dx},${Math.max(...xs) + dx}] y[${Math.min(...ys) + dy},${Math.max(...ys) + dy}]`);

const lines = ["#!/system/bin/sh", "# slow version: separate MotionEvent per point", `input motionevent DOWN ${P[0][0]} ${P[0][1]}`, "sleep 0.25"];
const GAP = process.env.GAP ?? "0.10";
P.slice(1).forEach((p, i) => {
  lines.push(`input motionevent MOVE ${p[0]} ${p[1]}   # seg ${Math.floor(i / 3) + 1}`);
  lines.push(`sleep ${GAP}`);
});
lines.push(`input motionevent UP ${P[P.length - 1][0]} ${P[P.length - 1][1]}`, "");

const out = process.argv[2] ?? "gesture-mv.sh";
writeFileSync(out, lines.join("\n"), "utf8");
console.log(`写了 ${out}：${P.length} 个点，约 ${(P.length * 0.06).toFixed(1)} 秒`);
