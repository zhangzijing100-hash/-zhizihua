import fs from "node:fs";

const d = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };
const M = { 1: 1, 2: 5 / 4, 3: 4 / 3, 4: 17 / 12, 5: 3 / 2 };
const floor5 = (x) => Math.floor(x / 5 + 1e-9) * 5;
const round5 = (x) => Math.round(x / 5) * 5;

const fateVal = (a) => a?.find((x) => x.sourceAttributeId === "source.fate-value")?.value ?? null;

const rows = [];
for (const w of d.fateWheels) {
  const rar = w.members.map((m) => charById.get(m.characterId)?.rarity ?? "?");
  const n = rar.length;
  const sumBase = rar.reduce((a, r) => a + (BASE[r] ?? 0), 0);
  const raw = sumBase * (M[n] ?? 0);
  rows.push({ name: w.name, cat: w.wheelCategoryId, maxStar: w.maxStar, n, rar: rar.join("+"), sumBase, raw, v: fateVal(w.perStarGains), f: floor5(raw), r: round5(raw) });
}

for (const [label, key] of [["向下取整 floor5", "f"], ["四舍五入 round5", "r"]]) {
  const all = rows.filter((x) => x.v === x[key]).length;
  const nd = rows.filter((x) => x.cat !== "wheel-category.destiny");
  const ndOk = nd.filter((x) => x.v === x[key]).length;
  console.log(`${label.padEnd(18)} 全部 ${all}/${rows.length}   非宿命 ${ndOk}/${nd.length} (${(ndOk / nd.length * 100).toFixed(2)}%)`);
}

const nd = rows.filter((x) => x.cat !== "wheel-category.destiny");
const bad = nd.filter((x) => x.v !== x.f);
console.log(`\n=== 315 个非宿命盘中，floor5 规则仍不符的 ${bad.length} 个 ===`);
for (const r of bad) {
  const per = r.raw / r.n;
  console.log(`  ${r.name.padEnd(12)} ${r.cat.replace("wheel-category.", "").padEnd(10)} n=${r.n} Σ=${String(r.sumBase).padStart(3)} raw=${r.raw.toFixed(2).padStart(7)} 预测=${String(r.f).padStart(3)} 实际=${String(r.v).padStart(3)} 差=${String(r.v - r.f).padStart(4)}  ${r.rar}`);
}

console.log("\n=== 宿命之轮 (170 个) 规律探查 ===");
const des = rows.filter((x) => x.cat === "wheel-category.destiny");
const byKey = {};
for (const r of des) (byKey[`n=${r.n} Σ=${r.sumBase} maxStar=${r.maxStar}`] ??= []).push(r);
for (const [k, v] of Object.entries(byKey).sort()) {
  const u = [...new Set(v.map((x) => x.v))];
  console.log(`  ${k.padEnd(26)} 命轮值=${u.slice(0, 8).join(",")}${u.length > 8 ? "…" : ""}  (${v.length})`);
}
console.log("\n宿命之轮 sample:");
for (const r of des.slice(0, 8)) console.log(`  ${r.name.padEnd(12)} n=${r.n} Σ=${r.sumBase} maxStar=${r.maxStar} 实际=${r.v} ${r.rar}`);
