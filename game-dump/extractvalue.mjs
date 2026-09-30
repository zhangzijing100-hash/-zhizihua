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
const starts = [];
for (let o = 0; o + 4 <= big.length; o += 4) { const v = big.readInt32BE(o); if (idSet.has(v)) starts.push({ o, id: v }); }
starts.push({ o: big.length, id: -1 });
const recs = starts.slice(0, -1).map((s, i) => ({ id: s.id, from: s.o, to: starts[i + 1].o, want: valOf.get(s.id) }));
console.log(`记录 ${recs.length} 条`);

/**
 * 在记录内找形如  [u32 BE value][u8 count=1..32][count × (u32 key, u32 value)]  的位置。
 * count 后的 count*8 字节必须不越界，且 key 都 >= 1。
 */
function candidates(rec) {
  const out = [];
  const seg = big.subarray(rec.from, rec.to);
  for (let x = 0; x + 5 <= seg.length; x++) {
    const v = seg.readInt32BE(x);
    if (v <= 0 || v > 100000) continue;
    const cnt = seg[x + 4];
    if (cnt < 1 || cnt > 32) continue;
    const need = x + 5 + cnt * 8;
    if (need > seg.length) continue;
    let ok = true;
    for (let k = 0; k < cnt; k++) {
      const key = seg.readInt32BE(x + 5 + k * 8);
      if (key <= 0 || key > 1_000_000) { ok = false; break; }
    }
    if (ok) out.push({ x, v, cnt });
  }
  return out;
}

let bothMatch = 0, dbAmong = 0, noCand = 0;
const results = [];
for (const r of recs) {
  const cands = candidates(r);
  if (!cands.length) { noCand++; results.push({ ...r, cands: [], hit: false }); continue; }
  const hit = cands.find((c) => c.v === r.want);
  if (hit) bothMatch++;
  else dbAmong++;   // 有候选但都不是 DB 值
  results.push({ ...r, cands, hit: !!hit });
}
console.log(`\n有候选的 ${recs.length - noCand} 条；其中含 DB 值的 ${bothMatch} 条；不含 DB 值的 ${dbAmong} 条；无候选 ${noCand} 条`);
console.log(`⇒ 命中率 ${(bothMatch / recs.length * 100).toFixed(2)}%`);

console.log("\n=== 前 12 条：候选值 vs DB 值 ===");
for (const r of results.slice(0, 12)) {
  const vals = [...new Set(r.cands.map((c) => c.v))];
  console.log(`  ${String(r.id).padStart(9)} DB=${String(r.want).padStart(4)}  候选[${vals.slice(0, 10).join(",")}]${vals.length > 10 ? "…" : ""}  个数=${r.cands.length}`);
}

// 不匹配的明细
const bad = results.filter((r) => !r.hit);
console.log(`\n=== 不匹配 ${bad.length} 条 ===`);
for (const r of bad.slice(0, 25)) {
  const vals = [...new Set(r.cands.map((c) => c.v))];
  console.log(`  ${String(r.id).padStart(9)} ${String(nameOf.get(r.id)).padEnd(12)} DB=${String(r.want).padStart(4)}  候选[${vals.slice(0, 12).join(",")}]`);
}
