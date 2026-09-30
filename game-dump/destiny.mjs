import fs from "node:fs";

const d = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };
const fateVal = (a) => a?.find((x) => x.sourceAttributeId === "source.fate-value")?.value ?? null;

const des = [];
for (const w of d.fateWheels) {
  if (w.wheelCategoryId !== "wheel-category.destiny") continue;
  const rar = w.members.map((m) => charById.get(m.characterId)?.rarity ?? "?");
  const lim = w.members.map((m) => (charById.get(m.characterId)?.isLimited ? "L" : ""));
  des.push({ name: w.name, n: rar.length, rar: [...rar].sort().join("+"), detail: rar.map((r, i) => r + lim[i]).join("+"), sumBase: rar.reduce((a, r) => a + BASE[r], 0), v: fateVal(w.perStarGains), maxStar: w.maxStar });
}

console.log("=== 宿命之轮：按成员组合分组 (组合 → 命轮值) ===");
const g = {};
for (const r of des) (g[`n=${r.n} ${r.rar} Σ=${r.sumBase}`] ??= []).push(r);
for (const [k, v] of Object.entries(g).sort()) {
  const u = {};
  for (const x of v) (u[x.v] ??= []).push(x.name);
  const parts = Object.entries(u).map(([val, names]) => `${val}(${names.length})`);
  console.log(`  ${k.padEnd(34)} → ${parts.join("  ")}`);
}

console.log("\n=== 每个盘的原始成员构成 (前 40) ===");
for (const r of des.slice(0, 40)) console.log(`  ${r.name.padEnd(12)} n=${r.n} Σ=${String(r.sumBase).padStart(3)} maxStar=${r.maxStar} v=${String(r.v).padStart(3)}  ${r.detail}`);

console.log("\n=== 检验: v / 13, /14, /15 是否整数 ===");
let ok13 = 0, ok14 = 0, ok15 = 0, other = 0;
const rem = {};
for (const r of des) {
  if (r.v % 13 === 0) ok13++; else if (r.v % 14 === 0) ok14++; else if (r.v % 15 === 0) ok15++; else { other++; rem[r.v] = (rem[r.v] || 0) + 1; }
}
console.log(`  13的倍数: ${ok13}  14的倍数: ${ok14}  15的倍数: ${ok15}  都不是: ${other}`);
console.log(`  非13/14/15倍数: ${JSON.stringify(rem)}`);

console.log("\n=== 用 Σbase 求 k = v/Σbase ===");
const kk = {};
for (const r of des) { const k = (r.v / r.sumBase); const s = k.toFixed(4); (kk[s] ??= []).push(r); }
for (const [k, v] of Object.entries(kk).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  v/Σ=${k}  (${v.length})  例: ${v.slice(0, 2).map((x) => `${x.name}[${x.rar}]=${x.v}`).join("  ")}`);
}
