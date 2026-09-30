import fs from "node:fs";

const d = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };

function fateVal(arr) {
  if (!arr) return null;
  const g = arr.find((x) => x.sourceAttributeId === "source.fate-value");
  return g ? g.value : null;
}

const rows = [];
for (const w of d.fateWheels) {
  const rar = w.members.map((m) => charById.get(m.characterId)?.rarity ?? "?");
  const sumBase = rar.reduce((a, r) => a + (BASE[r] ?? 0), 0);
  rows.push({
    id: w.gameEntryId,
    name: w.name,
    maxStar: w.maxStar,
    rar: rar.join("+"),
    n: rar.length,
    sumBase,
    perStar: fateVal(w.perStarGains),
    perRank: fateVal(w.perRankGains),
  });
}

console.log(`总盘数: ${rows.length}`);
const withStar = rows.filter((r) => r.perStar !== null);
console.log(`有 perStar 命轮值的盘: ${withStar.length}`);
console.log(`perStar === perRank 的盘: ${rows.filter((r) => r.perStar !== null && r.perStar === r.perRank).length}`);

console.log("\n=== 按稀有度组合分组 ===");
const byRar = {};
for (const r of withStar) (byRar[r.rar] ??= []).push(r);
for (const [k, v] of Object.entries(byRar).sort((a, b) => b[1].length - a[1].length)) {
  const vals = [...new Set(v.map((x) => x.perStar))];
  const sb = [...new Set(v.map((x) => x.sumBase))];
  console.log(`  n=${v[0].n}  Σbase=${sb.join("/")}  组合=${k}  →  命轮值/星=${vals.join("/")}  (${v.length} 个盘)`);
}

console.log("\n=== 比值 perStar/Σbase ===");
const ratio = {};
for (const r of withStar) {
  const k = (r.perStar / r.sumBase).toFixed(4);
  (ratio[k] ??= []).push(r);
}
for (const [k, v] of Object.entries(ratio).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ratio=${k}  (${v.length} 个)  例: ${v.slice(0, 3).map((x) => `${x.name}[${x.rar}]=${x.perStar}`).join("  ")}`);
}

fs.writeFileSync("C:/Users/Ricairo/Desktop/栀子花/game-dump/wheel-fatevalue.json", JSON.stringify(rows, null, 1));
console.log("\n已写出 wheel-fatevalue.json");
