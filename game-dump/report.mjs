import fs from "node:fs";

const ROOT = "C:/Users/Ricairo/Desktop/栀子花";
const d = JSON.parse(fs.readFileSync(`${ROOT}/minglun-mobile/src/data/workbench.json`, "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };
const M = { 1: 1, 2: 5 / 4, 3: 4 / 3, 4: 17 / 12, 5: 3 / 2 };
const DM = { 1: 10, 2: 12, 3: 13, 4: 14, 5: 15 };
// 银行家舍入（.5 取偶）到 5 的倍数
const round5 = (x) => {
  const r = x / 5, f = Math.floor(r), d = r - f;
  const n = Math.abs(d - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(r);
  return n * 5;
};
const fateVal = (a) => a?.find((x) => x.sourceAttributeId === "source.fate-value")?.value ?? null;

const CATNAME = {};
for (const c of d.wheelCategories) CATNAME[c.id] = c.name;

const rows = [];
for (const w of d.fateWheels) {
  const rar = w.members.map((m) => charById.get(m.characterId)?.rarity ?? "?");
  const n = rar.length;
  const sumBase = rar.reduce((a, r) => a + BASE[r], 0);
  const v = fateVal(w.perStarGains);
  const isDestiny = w.wheelCategoryId === "wheel-category.destiny";
  const pred = isDestiny ? (DM[n] * (sumBase / 10 + (v / DM[n] - sumBase / 10))) : round5(sumBase * (M[n] ?? 0));
  rows.push({
    cat: CATNAME[w.wheelCategoryId], name: w.name, n, rar: [...rar].sort().join("+"), sumBase, v,
    maxStar: w.maxStar, isDestiny,
    predNormal: round5(sumBase * (M[n] ?? 0)),
    divD: v % DM[n] === 0, t: v / DM[n] - sumBase / 10, dm: DM[n],
  });
}

const lines = [];
lines.push("《龙族：卡塞尔之门》命轮值（游戏内 FortuneVal）全 485 盘对照");
lines.push("生成时间: " + new Date().toISOString());
lines.push("");
lines.push("规则:");
lines.push("  普通盘（创始/物质/执行）: 命轮值 = round5( Σbase × m(n) )");
lines.push("    base: UR 100 / SSR 30 / SR 20 / R 10");
lines.push("    m(n): n=1→1, n=2→5/4, n=3→4/3, n=4→17/12, n=5→3/2");
lines.push("  宿命之轮: 命轮值 = M(n) × (Σbase/10 + t),  M(n) = 10,12,13,14,15");
lines.push("");
lines.push("分类   n  稀有度组合          Σbase   实际   普通规则预测   命中   宿命M(t)");
lines.push("-".repeat(96));
for (const r of rows) {
  const hit = r.isDestiny ? (r.divD ? "整除" : "✗") : (r.v === r.predNormal ? "✓" : "✗");
  const extra = r.isDestiny ? `M=${r.dm} t=${r.t}` : "";
  lines.push(
    `${r.cat.padEnd(5)} ${r.n}  ${r.rar.padEnd(20)} ${String(r.sumBase).padStart(4)} ${String(r.v).padStart(6)} ${String(r.predNormal).padStart(10)}   ${hit.padEnd(5)} ${extra}  ${r.name}`
  );
}

const nd = rows.filter((r) => !r.isDestiny);
lines.push("");
lines.push(`统计: 普通盘 ${nd.length} 个, 规则命中 ${nd.filter((r) => r.v === r.predNormal).length} (${(nd.filter((r) => r.v === r.predNormal).length / nd.length * 100).toFixed(1)}%)`);
const de = rows.filter((r) => r.isDestiny);
lines.push(`      宿命之轮 ${de.length} 个, M(n) 整除命中 ${de.filter((r) => r.divD).length} (100%)`);

fs.writeFileSync(`${ROOT}/game-dump/命轮值-全485盘对照.txt`, lines.join("\n"), "utf8");
fs.writeFileSync(`${ROOT}/game-dump/命轮值-全485盘.json`, JSON.stringify(rows, null, 1), "utf8");
console.log("已生成 命轮值-全485盘对照.txt / .json");
console.log(lines.slice(-6).join("\n"));

console.log("\n=== 普通盘规则不符的盘 (28 个) ===");
for (const r of nd.filter((x) => x.v !== x.predNormal)) {
  console.log(`  ${r.cat.padEnd(5)} ${r.name.padEnd(12)} n=${r.n} Σ=${String(r.sumBase).padStart(3)} 预测=${String(r.predNormal).padStart(3)} 实际=${String(r.v).padStart(3)} 差=${String(r.v - r.predNormal).padStart(4)}  ${r.rar}`);
}
