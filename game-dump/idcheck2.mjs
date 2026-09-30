import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const ids = wb.fateWheels.map((w) => w.gameEntryId).filter((x) => x > 0);
console.log(`entryId ${ids.length} 个`);

for (const f of ["data.bin", "data.bin.full", "data.cat", "lua.cat", "configs.cat"]) {
  const p = path.join(dir, f);
  if (!fs.existsSync(p)) { console.log(`${f}: 无`); continue; }
  const buf = fs.readFileSync(p);
  let le = 0, be = 0;
  const samp = [];
  for (const id of ids) {
    const l = Buffer.alloc(4); l.writeInt32LE(id);
    const b = Buffer.alloc(4); b.writeInt32BE(id);
    const a = buf.indexOf(l); if (a >= 0) { le++; if (samp.length < 4) samp.push(`${id}@LE${a}`); }
    const c = buf.indexOf(b); if (c >= 0) { be++; if (samp.length < 4) samp.push(`${id}@BE${c}`); }
  }
  console.log(`${f.padEnd(16)} size=${String(buf.length).padStart(9)}  LE ${String(le).padStart(3)}/480  BE ${String(be).padStart(3)}/480  ${samp.join(" ")}`);
}

console.log("\n=== 字符串搜索 ===");
const buf = fs.readFileSync(path.join(dir, "data.bin.full"));
for (const s of ["422310185", "422310", "fortunewheel", "FortuneWheel", "wheelValue", "entryId"]) {
  const b = Buffer.from(s);
  let c = 0, p = 0;
  while ((p = buf.indexOf(b, p)) !== -1) { c++; p++; }
  console.log(`  "${s}" 出现 ${c} 次`);
}
