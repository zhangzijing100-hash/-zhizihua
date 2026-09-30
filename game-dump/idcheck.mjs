import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bny");
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const ids = wb.fateWheels.map((w) => w.gameEntryId).filter((x) => x > 0);
console.log(`数据库中的 gameEntryId: ${ids.length} 个, 例如 ${ids.slice(0, 8).join(", ")}`);

const files = [
  "drc.gsp.fortunewheel.confbean.cfortunewheelentrycfg.bny",
  "drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny",
  "drc.gsp.fortunewheel.confbean.cfortunewheelitem2entrycfg.bny",
];
for (const f of files) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.log(`\n${f}: 不存在`); continue; }
  const buf = fs.readFileSync(p);
  let hitLE = 0, hitBE = 0;
  const found = [];
  for (const id of ids) {
    const le = Buffer.alloc(4); le.writeInt32LE(id);
    const be = Buffer.alloc(4); be.writeInt32BE(id);
    const a = buf.indexOf(le), b = buf.indexOf(be);
    if (a >= 0) { hitLE++; if (found.length < 8) found.push(`${id}@LE${a}`); }
    if (b >= 0) { hitBE++; if (found.length < 8) found.push(`${id}@BE${b}`); }
  }
  console.log(`\n=== ${f} (${buf.length} B) ===`);
  console.log(`  LE 命中 ${hitLE}/${ids.length}   BE 命中 ${hitBE}/${ids.length}`);
  if (found.length) console.log(`  样例: ${found.join("  ")}`);
}

// 也检查 entry 表的前 128 字节
const p = path.join(dir, files[0]);
if (fs.existsSync(p)) {
  const buf = fs.readFileSync(p);
  console.log(`\n=== ${files[0]} 前 192 字节 ===`);
  for (let o = 0; o < Math.min(192, buf.length); o += 16) {
    const row = buf.subarray(o, o + 16);
    console.log(String(o).padStart(6), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48), row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
  }
  console.log("--- 按 4 字节对齐的 int32 ---");
  for (let a = 0; a < 4; a++) {
    const vals = [];
    for (let o = a; o + 4 <= Math.min(buf.length, 256); o += 4) vals.push(buf.readInt32LE(o));
    console.log(`  align=${a}: ${vals.slice(0, 16).join(", ")}`);
  }
}
