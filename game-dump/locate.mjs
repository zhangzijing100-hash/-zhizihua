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
const starts = [];
for (let o = 0; o + 4 <= big.length; o += 4) { const v = big.readInt32BE(o); if (idSet.has(v)) starts.push({ o, id: v }); }
starts.push({ o: big.length, id: -1 });

const recs = starts.slice(0, -1).map((s, i) => ({ id: s.id, from: s.o, to: starts[i + 1].o, want: valOf.get(s.id) }));

// 对每条记录找出期望命轮值出现的位置
const hits = [];
for (const r of recs) {
  const seg = big.subarray(r.from, r.to);
  const found = [];
  for (let a = 0; a < 4; a++) {
    for (let o = a; o + 4 <= seg.length; o += 4) {
      const be = seg.readInt32BE(o), le = seg.readInt32LE(o);
      if (be === r.want) found.push({ o, enc: "BE" });
      if (le === r.want) found.push({ o, enc: "LE" });
    }
  }
  hits.push({ ...r, found });
}
const withHit = hits.filter((h) => h.found.length);
console.log(`记录 ${hits.length} 条，其中 ${withHit.length} 条在记录内找到期望命轮值`);
console.log("\n前 15 条的位置:");
for (const h of withHit.slice(0, 15)) {
  console.log(`  entryId ${h.id} want=${h.want} len=${h.to - h.from}  → ${h.found.map((f) => `+${f.o}(${f.enc})`).join(" ")}`);
}

// 用统计：位置是否稳定
const posCount = new Map();
for (const h of withHit) for (const f of h.found) { const k = `+${f.o}:${f.enc}`; posCount.set(k, (posCount.get(k) || 0) + 1); }
console.log("\n位置出现频次 top 15:");
for (const [k, c] of [...posCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) console.log(`   ${k} × ${c}`);

// 反复出现的位置：打印该偏移上下文
const top = [...posCount.entries()].sort((a, b) => b[1] - a[1])[0];
if (top) {
  const off = parseInt(top[0].slice(1).split(":")[0], 10);
  console.log(`\n=== 最高频偏移 ${top[0]} 的上下文（entryId 422310185 记录） ===`);
  const r = recs[0];
  console.log(`记录长度 ${r.to - r.from}, 期望 ${r.want}`);
  for (let o = Math.max(0, off - 64); o < Math.min(r.to - r.from, off + 96); o += 16) {
    const row = big.subarray(r.from + o, r.from + o + 16);
    const be = [];
    for (let k = 0; k < 4; k++) be.push(big.readInt32BE(r.from + o + k * 4));
    console.log(String(o).padStart(6), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48), be.join(", "));
  }
}
