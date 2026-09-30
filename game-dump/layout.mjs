import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const idSet = new Set(wb.fateWheels.map((w) => w.gameEntryId).filter((x) => x > 0));
const valOf = new Map(), nameOf = new Map();
for (const w of wb.fateWheels) {
  const g = w.perStarGains.find((x) => x.sourceAttributeId === "source.fate-value");
  if (g && w.gameEntryId > 0) { valOf.set(w.gameEntryId, g.value); nameOf.set(w.gameEntryId, w.name); }
}
const big = fs.readFileSync(path.join(dir, "bny-raw", "drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny"));

function candidates(from, to) {
  const out = [];
  for (let x = from; x + 5 <= to; x++) {
    const v = big.readInt32BE(x);
    if (v <= 0 || v > 100000) continue;
    const cnt = big[x + 4];
    if (cnt < 1 || cnt > 32) continue;
    const need = x + 5 + cnt * 8;
    if (need > to) continue;
    let ok = true;
    for (let k = 0; k < cnt; k++) { const key = big.readInt32BE(x + 5 + k * 8); if (key <= 0 || key > 1_000_000) { ok = false; break; } }
    if (ok) out.push({ x, v, cnt });
  }
  return out;
}

// 记录 0 的全部候选
const rec0to = 6920;
const c0 = candidates(0, rec0to);
console.log(`记录 422310185 候选 ${c0.length} 个（DB 命轮值 330）`);
console.log("off   value  cnt   前 20 字节(BE u32 @ off-20..off-4)");
for (const c of c0.slice(0, 44)) {
  const prev = [];
  for (let k = 5; k >= 1; k--) { const o = c.x - k * 4; if (o >= 0) prev.push(big.readInt32BE(o)); else prev.push(null); }
  console.log(`${String(c.x).padStart(5)} ${String(c.v).padStart(6)} ${String(c.cnt).padStart(4)}   ${prev.map((p) => (p === null ? "-" : p)).join(", ")}${c.v === 330 ? "   ★" : ""}`);
}

// 统计：DB 值出现时，cnt 分布 / 相对位置特征
const startRec = [];
for (let o = 0; o + 4 <= big.length; o += 4) { const v = big.readInt32BE(o); if (idSet.has(v)) startRec.push({ o, id: v }); }
startRec.push({ o: big.length, id: -1 });
const recs = startRec.slice(0, -1).map((s, i) => ({ id: s.id, from: s.o, to: startRec[i + 1].o, want: valOf.get(s.id) }));

const cntHist = {};
let firstHitPos = {};
for (const r of recs) {
  const cs = candidates(r.from, r.to);
  const hits = cs.filter((c) => c.v === r.want);
  for (const h of hits) cntHist[h.cnt] = (cntHist[h.cnt] || 0) + 1;
  if (hits.length) { const k = hits[0].x - r.from; firstHitPos[k] = (firstHitPos[k] || 0) + 1; }
}
console.log("\nDB 值出现时的 cnt 分布:", JSON.stringify(cntHist));
console.log("DB 值首次出现的记录内偏移 top10:", Object.entries(firstHitPos).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => `${k}×${v}`).join("  "));
