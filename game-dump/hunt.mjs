import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const big = path.join(dir, "bny/drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny");
const buf = fs.readFileSync(big);
console.log(`${path.basename(big)}  ${buf.length} bytes`);

// 已知命轮值（来自 485 盘数据库）
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const known = new Set();
for (const w of wb.fateWheels) {
  const g = w.perStarGains.find((x) => x.sourceAttributeId === "source.fate-value");
  if (g) known.add(g.value);
}
const vals = [...known].sort((a, b) => a - b);
console.log(`已知命轮值 ${vals.length} 种: ${vals.join(", ")}`);

console.log("\n=== 在 .bny 中按 int32 (4 种对齐) 搜索 ===");
for (const v of vals) {
  let best = 0, bestAlign = -1, first = -1;
  for (let a = 0; a < 4; a++) {
    let c = 0, f = -1;
    for (let o = a; o + 4 <= buf.length; o += 4) if (buf.readInt32LE(o) === v) { c++; if (f < 0) f = o; }
    if (c > best) { best = c; bestAlign = a; first = f; }
  }
  console.log(`  ${String(v).padStart(5)} : ${String(best).padStart(6)} 次  (align=${bestAlign}${first >= 0 ? `, 首次 @${first}` : ""})`);
}

console.log("\n=== 搜索 u64 (8 字节对齐) ===");
for (const v of [330, 270, 225, 315, 210, 195, 115]) {
  let c = 0, f = -1;
  for (let o = 0; o + 8 <= buf.length; o += 8) if (Number(buf.readBigUInt64LE(o)) === v) { c++; if (f < 0) f = o; }
  console.log(`  ${String(v).padStart(5)} : ${c} 次${f >= 0 ? `, 首次 @${f}` : ""}`);
}

console.log("\n=== .bny 中 int32 值分布 (仅统计 <= 2000 的值) ===");
const freq = new Map();
for (let a = 0; a < 4; a++) {
  for (let o = a; o + 4 <= buf.length; o += 4) {
    const v = buf.readInt32LE(o);
    if (v > 0 && v <= 2000) freq.set(v, (freq.get(v) || 0) + 1);
  }
}
const top = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30);
console.log(top.map(([v, c]) => `${v}×${c}`).join("  "));
console.log("\n命轮值命中情况:");
for (const v of vals) {
  const c = freq.get(v) || 0;
  if (c) console.log(`  ${String(v).padStart(5)} : ${c} 次`);
}
