import fs from "node:fs";

const d = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };
const M = { 1: 1, 2: 5 / 4, 3: 4 / 3, 4: 17 / 12, 5: 3 / 2 };
const round5 = (x) => Math.round(x / 5) * 5;

function fateVal(arr) {
  const g = arr?.find((x) => x.sourceAttributeId === "source.fate-value");
  return g ? g.value : null;
}

const rows = [];
for (const w of d.fateWheels) {
  const rar = w.members.map((m) => charById.get(m.characterId)?.rarity ?? "?");
  const sumBase = rar.reduce((a, r) => a + (BASE[r] ?? 0), 0);
  const n = rar.length;
  const v = fateVal(w.perStarGains);
  rows.push({
    name: w.name, cat: w.wheelCategoryId, maxStar: w.maxStar, n, rar: rar.join("+"), sumBase,
    v, ruleRaw: sumBase * (M[n] ?? 0), rule5: round5(sumBase * (M[n] ?? 0)),
    tags: w.tagIds.join(","),
  });
}

console.log("=== 低分支(符合 m(n) 规则) vs 高分支 的区分因素 ===");
const catStat = {};
for (const r of rows) {
  const ok = r.v === r.rule5;
  const key = r.cat;
  catStat[key] ??= { match: 0, miss: 0, missVals: new Set(), names: [] };
  if (ok) catStat[key].match++; else { catStat[key].miss++; catStat[key].missVals.add(r.v); catStat[key].names.push(r.name); }
}
for (const [k, v] of Object.entries(catStat)) {
  console.log(`  ${k}: 符合 ${v.match} / 不符 ${v.miss}  不等值=${[...v.missVals].slice(0, 8).join(",")}`);
  console.log(`     例: ${v.names.slice(0, 5).join(" ")}`);
}

console.log("\n=== maxStar 分布 ===");
const ms = {};
for (const r of rows) { const ok = r.v === r.rule5; ms[`maxStar=${r.maxStar} ${ok ? "符合" : "不符"}`] = (ms[`maxStar=${r.maxStar} ${ok ? "符合" : "不符"}`] || 0) + 1; }
console.log(JSON.stringify(ms, null, 1));

console.log("\n=== 不符合的盘 (前 25) ===");
for (const r of rows.filter((x) => x.v !== x.rule5).slice(0, 25)) {
  console.log(`  ${r.name.padEnd(12)} n=${r.n} Σ=${String(r.sumBase).padStart(3)} Σm=${r.ruleRaw.toFixed(2).padStart(7)} 规则=${String(r.rule5).padStart(3)} 实际=${String(r.v).padStart(3)}  ratio=${(r.v / r.sumBase).toFixed(4)}  ${r.rar}`);
}
const mism = rows.filter((x) => x.v !== x.rule5);
console.log(`\n总计: ${rows.length} 个盘, 符合 ${rows.length - mism.length}, 不符 ${mism.length}`);

console.log("\n=== 不符盘的 ratio (v/Σbase) 汇总 ===");
const rr = {};
for (const r of mism) { const k = `${r.n}:${(r.v / r.sumBase).toFixed(4)}`; rr[k] = (rr[k] || 0) + 1; }
for (const [k, v] of Object.entries(rr).sort()) console.log(`   n:ratio=${k}  ×${v}`);
