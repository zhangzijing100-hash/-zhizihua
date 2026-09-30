import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const idSet = new Set(wb.fateWheels.map((w) => w.gameEntryId).filter((x) => x > 0));
const dbInfo = new Map();
for (const w of wb.fateWheels) {
  const g = w.perStarGains.find((x) => x.sourceAttributeId === "source.fate-value");
  if (g && w.gameEntryId > 0) dbInfo.set(w.gameEntryId, { value: g.value, name: w.name, n: w.members.length, maxStar: w.maxStar });
}

const big = fs.readFileSync(path.join(dir, "bny-raw", "drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny"));
const starts = [];
for (let o = 0; o + 4 <= big.length; o += 4) { const v = big.readInt32BE(o); if (idSet.has(v)) starts.push({ o, id: v }); }
starts.push({ o: big.length, id: -1 });

/**
 * 规则：[阶][星][星][阶][星][命轮值][u8 属性对数][对...]
 * 即 X-20/X-8 相等（阶），X-16/X-12/X-4 相等（星）
 */
function officialValues(from, to) {
  const byKey = new Map();          // (阶,星) -> 命轮值
  for (let x = from + 20; x + 5 <= to; x++) {
    const a1 = big.readInt32BE(x - 20), b1 = big.readInt32BE(x - 16), b2 = big.readInt32BE(x - 12);
    const a2 = big.readInt32BE(x - 8), b3 = big.readInt32BE(x - 4);
    if (a1 !== a2 || b1 !== b2 || b1 !== b3) continue;
    if (a1 < 0 || a1 > 20) continue;
    if (b1 < 1 || b1 > 10) continue;
    const v = big.readInt32BE(x);
    if (v <= 0 || v > 100000) continue;
    const cnt = big[x + 4];
    if (cnt < 1 || cnt > 32) continue;
    if (x + 5 + cnt * 8 > to) continue;
    byKey.set(`${a1}_${b1}`, v);
  }
  return byKey;
}

const rows = [];
for (let i = 0; i < starts.length - 1; i++) {
  const r = { id: starts[i].id, from: starts[i].o, to: starts[i + 1].o };
  const byKey = officialValues(r.from, r.to);
  const vals = [...byKey.values()];
  const uniq = [...new Set(vals)];
  const info = dbInfo.get(r.id);
  rows.push({ ...r, byKey, uniq, official: uniq.length === 1 ? uniq[0] : null, db: info?.value, name: info?.name, cells: byKey.size });
}

const withCells = rows.filter((r) => r.cells > 0);
console.log(`记录 ${rows.length}；提取到 (阶,星) 单元的 ${withCells.length}`);
const single = rows.filter((r) => r.uniq.length === 1);
console.log(`命轮值在所有 (阶,星) 上唯一的记录: ${single.length}`);
const multi = rows.filter((r) => r.uniq.length > 1);
console.log(`命轮值随 (阶,星) 变化的记录: ${multi.length}`);
for (const r of multi.slice(0, 5)) console.log(`   ${r.name} 各单元值: ${[...r.byKey.entries()].map(([k, v]) => `${k}=${v}`).slice(0, 20).join(" ")}`);

// 与数据库对照（用第 1 个单元的值）
let match = 0, mismatch = 0;
const bad = [];
for (const r of rows) {
  const first = r.byKey.values().next().value;
  if (first === undefined || r.db === undefined) continue;
  if (first === r.db) match++; else { mismatch++; bad.push(r); }
}
console.log(`\n=== 官方值 vs 数据库 ===`);
console.log(`  一致 ${match}   不一致 ${mismatch}`);
for (const r of bad.slice(0, 30)) console.log(`   ${String(r.name).padEnd(12)} DB=${String(r.db).padStart(4)}  官方=${r.uniq.join("/")}`);

fs.writeFileSync(path.join(dir, "official-wheelvalues.json"), JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, db: r.db, units: Object.fromEntries(r.byKey) })), null, 1), "utf8");
console.log("\n已写出 official-wheelvalues.json");
