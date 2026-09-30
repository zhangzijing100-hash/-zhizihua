import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const cat = fs.readFileSync(path.join(dir, "data.bin.full"));
const raw = fs.readFileSync(path.join(dir, "data.bin"));

const re = /bny\\[A-Za-z0-9_.]+\.bny\0/g;
const recs = [];
const s = cat.toString("latin1");
let m;
while ((m = re.exec(s)) !== null) {
  const meta = m.index + 256;
  recs.push({ name: m[0].replace(/\0$/, "").replace(/^bny\\/, ""), off: cat.readUInt32LE(meta + 4), size: cat.readUInt32LE(meta + 12) });
}

const outDir = path.join(dir, "bny-raw");
fs.mkdirSync(outDir, { recursive: true });
let written = 0, bad = 0;
for (const r of recs) {
  if (r.off + r.size > raw.length || r.size <= 0) { bad++; continue; }
  fs.writeFileSync(path.join(outDir, r.name), raw.subarray(r.off, r.off + r.size));
  written++;
}
console.log(`导出 ${written} / ${recs.length} 张表（跳过 ${bad}），目录 bny-raw/`);

// 用 entryId 校验覆盖度
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const ids = wb.fateWheels.map((w) => w.gameEntryId).filter((x) => x > 0);
const big = fs.readFileSync(path.join(outDir, "drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny"));
let hit = 0;
for (const id of ids) { const p = Buffer.alloc(4); p.writeInt32BE(id); if (big.indexOf(p) >= 0) hit++; }
console.log(`大表 entryId 覆盖 ${hit}/${ids.length}`);

console.log(`\n=== 大表头部（BE int32） ===`);
for (let o = 0; o < 256; o += 32) {
  const row = big.subarray(o, o + 32);
  console.log(String(o).padStart(6), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(96), row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
console.log("--- BE int32 ---");
for (let o = 0; o < 256; o += 32) {
  const v = [];
  for (let k = 0; k < 8; k++) v.push(big.readInt32BE(o + k * 4));
  console.log(String(o).padStart(6), v.join(", "));
}
