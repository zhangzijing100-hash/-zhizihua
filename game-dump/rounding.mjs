import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };
const M = { 1: 1, 2: 5 / 4, 3: 4 / 3, 4: 17 / 12, 5: 3 / 2 };
const fateVal = (a) => a?.find((x) => x.sourceAttributeId === "source.fate-value")?.value ?? null;

const modes = {
  "round5 半上": (x) => Math.round(x / 5) * 5,
  "floor5 向下": (x) => Math.floor(x / 5 + 1e-9) * 5,
  "ceil5 向上": (x) => Math.ceil(x / 5 - 1e-9) * 5,
  "半偶(银行家)": (x) => {
    const r = x / 5, f = Math.floor(r), dd = r - f;
    const n = Math.abs(dd - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(r);
    return n * 5;
  },
  "半下": (x) => { const r = x / 5, f = Math.floor(r), dd = r - f; const n = Math.abs(dd - 0.5) < 1e-9 ? f : Math.round(r); return n * 5; },
};

const rows = [];
for (const w of d.fateWheels) {
  if (w.wheelCategoryId === "wheel-category.destiny") continue;
  const rar = w.members.map((m) => charById.get(m.characterId)?.rarity ?? "?");
  const n = rar.length;
  const sumBase = rar.reduce((a, r) => a + BASE[r], 0);
  rows.push({ name: w.name, n, sumBase, v: fateVal(w.perStarGains), raw: sumBase * (M[n] ?? 0), rar: [...rar].sort().join("+") });
}

console.log(`非宿命盘 ${rows.length} 个`);
for (const [label, fn] of Object.entries(modes)) {
  const hit = rows.filter((r) => r.v === fn(r.raw));
  console.log(`  ${label.padEnd(14)} 命中 ${String(hit.length).padStart(3)} (${(hit.length / rows.length * 100).toFixed(2)}%)`);
}

const best = modes["半偶(银行家)"];
const bad = rows.filter((r) => r.v !== best(r.raw));
console.log(`\n=== 银行家舍入下仍不符的 ${bad.length} 个 ===`);
for (const r of bad) console.log(`  ${r.name.padEnd(12)} n=${r.n} Σ=${String(r.sumBase).padStart(3)} raw=${r.raw.toFixed(2).padStart(7)} 预测=${String(best(r.raw)).padStart(3)} 实际=${String(r.v).padStart(3)} 差=${String(r.v - best(r.raw)).padStart(4)}  ${r.rar}`);
