import fs from "node:fs";

const d = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };
const fateVal = (a) => a?.find((x) => x.sourceAttributeId === "source.fate-value")?.value ?? null;
const M = { 1: 10, 2: 12, 3: 13, 4: 14, 5: 15 };

const rows = [];
for (const w of d.fateWheels) {
  const rar = w.members.map((m) => charById.get(m.characterId)?.rarity ?? "?");
  const n = rar.length;
  const sumBase = rar.reduce((a, r) => a + BASE[r], 0);
  rows.push({ name: w.name, cat: w.wheelCategoryId, n, rar, sumBase, v: fateVal(w.perStarGains) });
}

const des = rows.filter((r) => r.cat === "wheel-category.destiny");
const ok = des.filter((r) => r.v % M[r.n] === 0);
console.log(`宿命之轮 ${des.length} 个盘：v 能被 M(n) 整除的 = ${ok.length} (${(ok.length / des.length * 100).toFixed(1)}%)`);
for (const r of des.filter((x) => x.v % M[x.n] !== 0)) console.log(`  例外: ${r.name} n=${r.n} v=${r.v} M=${M[r.n]}`);

console.log("\n=== 每个盘的 t = v/M(n) - Σbase/10 ===");
const byT = {};
for (const r of des) {
  const t = r.v / M[r.n] - r.sumBase / 10;
  const key = `n=${r.n} Σ=${r.sumBase}`;
  (byT[key] ??= []).push({ t, name: r.name, rar: [...r.rar].sort().join("+") });
}
for (const [k, v] of Object.entries(byT).sort()) {
  const ts = [...new Set(v.map((x) => x.t))].sort((a, b) => a - b);
  console.log(`  ${k.padEnd(14)} t=${ts.join(",")}   ${v.slice(0, 2).map((x) => `${x.name}[${x.rar}]`).join("  ")}`);
}

console.log("\n=== t 与 SSR 数的关系 ===");
const tSsr = {};
for (const r of des) {
  const t = r.v / M[r.n] - r.sumBase / 10;
  const nSsr = r.rar.filter((x) => x === "SSR").length;
  const nSr = r.rar.filter((x) => x === "SR").length;
  const nR = r.rar.filter((x) => x === "R").length;
  const nUr = r.rar.filter((x) => x === "UR").length;
  const key = `n=${r.n} t=${t}`;
  (tSsr[key] ??= new Set()).add(`UR${nUr}/SSR${nSsr}/SR${nSr}/R${nR}`);
}
for (const [k, v] of Object.entries(tSsr).sort()) console.log(`  ${k.padEnd(12)} 组合: ${[...v].join("  ")}`);
