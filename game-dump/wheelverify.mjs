import fs from "node:fs";

const d = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const charById = new Map(d.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SR: 20, R: 10 };
const M = { 1: 1, 2: 5 / 4, 3: 4 / 3, 4: 17 / 12, 5: 3 / 2 };
const floor5 = (x) => Math.floor(x / 5 + 1e-9) * 5;
const round5 = (x) => Math.round(x / 5) * 5;

function fateVal(arr) {
  const g = arr?.find((x) => x.sourceAttributeId === "source.fate-value");
  return g ? g.value : null;
}

console.log("=== 分类 ===");
for (const c of d.wheelCategories) console.log(`  ${c.id}  ${c.name}  order=${c.order}`);

const rows = [];
for (const w of d.fateWheels) {
  const rar = w.members.map((m) => charById.get(m.characterId)?.rarity ?? "?");
  const n = rar.length;
  const perMemberFloor = rar.reduce((a, r) => a + floor5((BASE[r] ?? 0) * (M[n] ?? 0)), 0);
  const sumBase = rar.reduce((a, r) => a + (BASE[r] ?? 0), 0);
  rows.push({
    name: w.name, cat: w.wheelCategoryId, maxStar: w.maxStar, n, rar: rar.join("+"), sumBase,
    v: fateVal(w.perStarGains), perRank: fateVal(w.perRankGains),
    predFloor: perMemberFloor, predRound: round5(sumBase * (M[n] ?? 0)),
  });
}

const perCat = {};
for (const r of rows) {
  const c = (perCat[r.cat] ??= { total: 0, floorOk: 0, roundOk: 0, bad: [] });
  c.total++;
  if (r.v === r.predFloor) c.floorOk++;
  if (r.v === r.predRound) c.roundOk++;
  if (r.v !== r.predFloor) c.bad.push(r);
}
console.log("\n=== 按分类：新规则(逐成员向下取整) vs 旧规则(整体四舍五入) ===");
for (const [k, v] of Object.entries(perCat)) {
  console.log(`  ${k.padEnd(26)} 共 ${String(v.total).padStart(3)}  新规则命中 ${String(v.floorOk).padStart(3)} (${(v.floorOk / v.total * 100).toFixed(1)}%)   旧规则命中 ${v.roundOk}`);
}
const tot = rows.length;
const fOk = rows.filter((r) => r.v === r.predFloor).length;
const rOk = rows.filter((r) => r.v === r.predRound).length;
console.log(`\n  合计 ${tot}   新规则 ${fOk} (${(fOk / tot * 100).toFixed(1)}%)   旧规则 ${rOk} (${(rOk / tot * 100).toFixed(1)}%)`);

const nonDestiny = rows.filter((r) => r.cat !== "wheel-category.destiny");
const ndOk = nonDestiny.filter((r) => r.v === r.predFloor).length;
console.log(`  排除 destiny 类后：${nonDestiny.length} 个盘, 新规则命中 ${ndOk} (${(ndOk / nonDestiny.length * 100).toFixed(2)}%)`);

console.log("\n=== 非 destiny 类仍然不符的盘 (全部) ===");
for (const r of nonDestiny.filter((x) => x.v !== x.predFloor)) {
  console.log(`  ${r.name.padEnd(12)} ${r.cat.replace("wheel-category.", "").padEnd(10)} n=${r.n} Σ=${String(r.sumBase).padStart(3)} 预测=${String(r.predFloor).padStart(3)} 实际=${String(r.v).padStart(3)} ${r.rar}`);
}

console.log("\n=== destiny 类的规律探查 ===");
const des = rows.filter((r) => r.cat === "wheel-category.destiny");
const dg = {};
for (const r of des) {
  const k = `n=${r.n} Σ=${r.sumBase} m=${r.maxStar}`;
  (dg[k] ??= []).push(r.v);
}
for (const [k, v] of Object.entries(dg).sort()) {
  const u = [...new Set(v)];
  console.log(`  ${k.padEnd(22)} → 命轮值 ${u.slice(0, 10).join(",")}${u.length > 10 ? " …" : ""}  (${v.length} 个)`);
}
