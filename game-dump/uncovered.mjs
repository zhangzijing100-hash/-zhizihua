import fs from "node:fs";
import path from "node:path";

const ROOT = "C:/Users/Ricairo/Desktop/栀子花";
const dir = path.join(ROOT, "game-dump");
const wb = JSON.parse(fs.readFileSync(`${ROOT}/minglun-mobile/src/data/workbench.json`, "utf8"));
const official = JSON.parse(fs.readFileSync(path.join(dir, "official-wheelvalues.json"), "utf8"));
const officialIds = new Set(official.map((r) => r.id));
const charById = new Map(wb.characters.map((c) => [c.id, c]));
const BASE = { UR: 100, SSR: 30, SSR_LIMITED: 30, SR: 20, R: 10 };
const M = { 1: 1, 2: 5 / 4, 3: 4 / 3, 4: 17 / 12, 5: 3 / 2 };
const catName = Object.fromEntries(wb.wheelCategories.map((c) => [c.id, c.name]));
const banker5 = (x) => { const r = x / 5, f = Math.floor(r), d = r - f; const n = Math.abs(d - 0.5) < 1e-9 ? (f % 2 === 0 ? f : f + 1) : Math.round(r); return n * 5; };

const uncovered = [];
for (const w of wb.fateWheels) {
  const covered = w.gameEntryId && officialIds.has(w.gameEntryId);
  if (covered) continue;
  const rar = w.members.map((m) => {
    const c = charById.get(m.characterId);
    return c ? (c.rarity === "SSR" && c.isLimited ? "SSR_LIMITED" : c.rarity) : "?";
  });
  const sumBase = rar.reduce((a, r) => a + (BASE[r] ?? 0), 0);
  const calc = M[rar.length] ? banker5(sumBase * M[rar.length]) : null;
  const g = w.perStarGains.find((x) => x.sourceAttributeId === "source.fate-value");
  uncovered.push({
    name: w.name, id: w.id, gameEntryId: w.gameEntryId, order: w.order,
    cat: catName[w.wheelCategoryId], n: rar.length,
    rar: [...rar].sort().join("+"), sumBase, stored: g?.value ?? null, formula: calc,
    members: w.members.map((m) => charById.get(m.characterId)?.name ?? m.characterId),
    maxStar: w.maxStar, isCustom: /custom/.test(w.id),
  });
}

console.log(`数据库共 ${wb.fateWheels.length} 个盘`);
console.log(`官方收录 ${officialIds.size} 个（其中与库内匹配 475 个）`);
console.log(`未被官方收录 ${uncovered.length} 个\n`);

console.log("=".repeat(96));
for (const u of uncovered) {
  console.log(`${u.name}  [${u.cat}]`);
  console.log(`   id=${u.id}`);
  console.log(`   gameEntryId=${u.gameEntryId}   order=${u.order}   maxStar=${u.maxStar}   ${u.isCustom ? "★手工新增" : "有 entryId"}`);
  console.log(`   成员(${u.n}) ${u.rar}  Σbase=${u.sumBase}   成员名: ${u.members.join(" / ")}`);
  console.log(`   库内命轮值=${u.stored}   公式=${u.formula}   ${u.stored === u.formula ? "（等于公式值）" : "（不等于公式值）"}`);
  console.log("");
}

// 这些 entryId 是否出现在任意一张 .bny 表里
const rawDir = path.join(dir, "bny-raw");
const files = fs.readdirSync(rawDir);
console.log("=".repeat(96));
console.log("在全部 " + files.length + " 张 .bny 表中搜索这些 entryId：");
const idsToSearch = uncovered.filter((u) => u.gameEntryId).map((u) => u.gameEntryId);
for (const id of idsToSearch) {
  const be = Buffer.alloc(4); be.writeInt32BE(id);
  const le = Buffer.alloc(4); le.writeInt32LE(id);
  const hits = [];
  for (const f of files) {
    const b = fs.readFileSync(path.join(rawDir, f));
    if (b.indexOf(be) >= 0) hits.push(`${f}(BE)`);
    if (b.indexOf(le) >= 0) hits.push(`${f}(LE)`);
  }
  console.log(`  ${id} : ${hits.length ? hits.slice(0, 5).join(", ") : "任何表中都不存在"}`);
}
