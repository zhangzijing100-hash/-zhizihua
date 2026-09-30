import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const idSet = new Set(wb.fateWheels.map((w) => w.gameEntryId).filter((x) => x > 0));
const valOf = new Map();
for (const w of wb.fateWheels) {
  const g = w.perStarGains.find((x) => x.sourceAttributeId === "source.fate-value");
  if (g && w.gameEntryId > 0) valOf.set(w.gameEntryId, g.value);
}

const big = fs.readFileSync(path.join(dir, "bny-raw", "drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny"));
console.log(`大表 ${big.length} bytes`);

// 找所有 4 字节对齐、BE 值属于 entryId 集合的位置
const starts = [];
for (let o = 0; o + 4 <= big.length; o += 4) {
  const v = big.readInt32BE(o);
  if (idSet.has(v)) starts.push({ o, id: v });
}
console.log(`记录起点（4 对齐 BE = entryId）: ${starts.length} 个`);
console.log("前 6 个:", starts.slice(0, 6).map((s) => `${s.id}@${s.o}`).join("  "));
console.log("间距:", starts.slice(0, 12).map((s, i, a) => (i ? s.o - a[i - 1].o : 0)).slice(1).join(", "));

console.log("\n=== 前 4 条记录的前 24 个 4 字节字段（BE / LE 双列）===");
for (const s of starts.slice(0, 4)) {
  console.log(`\n--- entryId ${s.id} (期望命轮值 ${valOf.get(s.id)}) @${s.o} ---`);
  for (let k = 0; k < 24; k++) {
    const o = s.o + k * 4;
    if (o + 4 > big.length) break;
    const be = big.readInt32BE(o), le = big.readInt32LE(o);
    const markBE = be === valOf.get(s.id) ? "  ← 命中命轮值(BE)" : "";
    const markLE = le === valOf.get(s.id) ? "  ← 命中命轮值(LE)" : "";
    console.log(`   +${String(k * 4).padStart(3)}  BE=${String(be).padStart(12)}  LE=${String(le).padStart(12)}${markBE}${markLE}`);
  }
}

console.log("\n=== 全表：已知命轮值按 BE / LE int32 的 4 对齐命中数 ===");
const vals = [...new Set(valOf.values())].sort((a, b) => a - b);
for (const v of vals) {
  let cb = 0, cl = 0;
  for (let o = 0; o + 4 <= big.length; o += 4) { if (big.readInt32BE(o) === v) cb++; if (big.readInt32LE(o) === v) cl++; }
  if (cb || cl) console.log(`   ${String(v).padStart(5)} : BE ${String(cb).padStart(5)}   LE ${String(cl).padStart(5)}`);
}
