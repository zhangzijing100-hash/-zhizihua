import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const big = fs.readFileSync(path.join(dir, "bny-raw", "drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny"));

// 大端扫描出所有"记录起点"：4 字节对齐、形如 [u32 id][u32 ?] 且 id 落在 4.2e8 区间
const allIds = [];
for (let o = 0; o + 8 <= big.length; o += 4) {
  const v = big.readInt32BE(o);
  if (v > 420000000 && v < 430000000) allIds.push({ o, id: v });
}
console.log(`大表中疑似记录起点 ${allIds.length} 个`);

const dbIds = new Set(wb.fateWheels.map((w) => w.gameEntryId).filter((x) => x > 0));
console.log(`数据库 gameEntryId ${dbIds.size} 个`);

const inBny = new Set(allIds.map((x) => x.id));
const dbNotInBny = [...dbIds].filter((x) => !inBny.has(x));
const bnyNotInDb = [...inBny].filter((x) => !dbIds.has(x));
console.log(`\n数据库有、大表没有: ${dbNotInBny.length} 个`);
for (const id of dbNotInBny) {
  const w = wb.fateWheels.find((x) => x.gameEntryId === id);
  console.log(`   ${id}  ${w?.name}  类别=${w?.wheelCategoryId}`);
}
console.log(`\n大表有、数据库没有: ${bnyNotInDb.length} 个`);
for (const id of bnyNotInDb.slice(0, 20)) console.log(`   ${id}`);
