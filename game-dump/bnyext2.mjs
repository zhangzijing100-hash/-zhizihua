import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const cat = fs.readFileSync(path.join(dir, "data.bin.full"));   // 含 .bny 目录
const raw = fs.readFileSync(path.join(dir, "data.bin"));        // 原始容器

// 解析目录
const re = /bny\\[A-Za-z0-9_.]+\.bny\0/g;
const recs = [];
const s = cat.toString("latin1");
let m;
while ((m = re.exec(s)) !== null) {
  const meta = m.index + 256;
  recs.push({
    name: m[0].replace(/\0$/, ""),
    a: cat.readUInt32LE(meta),
    b: cat.readUInt32LE(meta + 4),
    c: cat.readUInt32LE(meta + 8),
    d: cat.readUInt32LE(meta + 12),
    e: cat.readUInt32LE(meta + 16),
  });
}
console.log(`目录 ${recs.length} 条`);
console.log("前 3 条:", recs.slice(0, 3).map((r) => `${r.name} a=${r.a} b=${r.b} c=${r.c} d=${r.d} e=${r.e}`).join("\n         "));

// 用大端 int32 验证：数据库 entryId 是否落在某条记录的 [b, b+d) 区间（raw 坐标）
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const ids = wb.fateWheels.map((w) => w.gameEntryId).filter((x) => x > 0);
const idPat = Buffer.alloc(4); idPat.writeInt32BE(ids[0]);
const idPos = raw.indexOf(idPat);
console.log(`\nentryId ${ids[0]} 在 raw data.bin 的偏移 = ${idPos}`);
const owner = recs.find((r) => idPos >= r.b && idPos < r.b + r.d);
console.log(`包含它的记录(按 b/d) : ${owner ? owner.name : "无"}`);
const owner2 = recs.find((r) => idPos >= r.a && idPos < r.a + r.e);
console.log(`包含它的记录(按 a/e) : ${owner2 ? owner2.name : "无"}`);

// 导出：分别按 b/d 与 a/e 从 raw 取
const outDir = path.join(dir, "bny-raw");
fs.mkdirSync(outDir, { recursive: true });
const big = "drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny";
const bigRec = recs.find((r) => r.name.endsWith(big));
console.log(`\n大表记录:`, bigRec);
for (const [tag, off, size] of [["bd", bigRec.b, bigRec.d], ["ae", bigRec.a, bigRec.e]]) {
  const data = raw.subarray(off, off + size);
  fs.writeFileSync(path.join(outDir, `${big}.${tag}`), data);
  let hit = 0;
  for (const id of ids.slice(0, 480)) {
    const p = Buffer.alloc(4); p.writeInt32BE(id);
    if (data.indexOf(p) >= 0) hit++;
  }
  console.log(`  [${tag}] off=${off} size=${size} → entryId 命中 ${hit}/480   头 32B: ${data.subarray(0, 32).toString("hex")}`);
}
