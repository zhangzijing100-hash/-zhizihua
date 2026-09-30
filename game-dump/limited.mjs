import fs from "node:fs";
const d = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };
const M = { 1: 1, 2: 5 / 4, 3: 4 / 3, 4: 17 / 12, 5: 3 / 2 };
const round5 = (x) => Math.round(x / 5) * 5;
const floor5 = (x) => Math.floor(x / 5 + 1e-9) * 5;
const fateVal = (a) => a?.find((x) => x.sourceAttributeId === "source.fate-value")?.value ?? null;

console.log("=== 角色的 isLimited 分布 ===");
const cnt = {};
for (const c of d.characters) { const k = `${c.rarity}${c.isLimited ? "-限定" : ""}`; cnt[k] = (cnt[k] || 0) + 1; }
console.log(JSON.stringify(cnt));

const rows = [];
for (const w of d.fateWheels) {
  if (w.wheelCategoryId === "wheel-category.destiny") continue;
  const rar = w.members.map((m) => {
    const c = charById.get(m.characterId);
    return (c?.rarity ?? "?") + (c?.isLimited ? "L" : "");
  });
  const n = rar.length;
  const sumBase = rar.reduce((a, r) => a + (BASE[r.replace("L", "")] ?? 0), 0);
  rows.push({ name: w.name, n, key: [...rar].sort().join("+"), sumBase, v: fateVal(w.perStarGains) });
}

console.log("\n=== 按 (n, 含限定标记的组合) 分组 → 实际命轮值 ===");
const g = {};
for (const r of rows) (g[`n=${r.n} ${r.key} Σ=${r.sumBase}`] ??= []).push(r.v);
for (const [k, v] of Object.entries(g).sort()) {
  const u = [...new Set(v)];
  console.log(`  ${k.padEnd(38)} → ${u.join(",")}   (${v.length})`);
}

console.log("\n=== 求解：每个成员的贡献 (假设 = base×m(n) 后 floor5 / round5) ===");
for (const n of [2, 3, 4, 5]) {
  const m = M[n];
  console.log(` n=${n}  m=${m}  (${(m * 100).toFixed(2)}%)`);
  for (const [r, b] of Object.entries(BASE)) {
    const raw = b * m;
    console.log(`    ${r.padEnd(4)} base=${String(b).padStart(3)}  raw=${raw.toFixed(3).padStart(7)}  floor5=${String(floor5(raw)).padStart(3)}  round5=${String(round5(raw)).padStart(3)}`);
  }
}
