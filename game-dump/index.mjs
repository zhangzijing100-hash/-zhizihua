import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const MAGIC = Buffer.from([0x1b, 0x4c, 0x75, 0x61, 0x51]);

function indexEntries(buf) {
  const out = [];
  let i = 0;
  while ((i = buf.indexOf(MAGIC, i)) !== -1) {
    const nameLen = buf.readUInt32LE(i + 12);
    if (nameLen < 4 || nameLen > 400) { i += 5; continue; }
    let name = buf.subarray(i + 16, i + 16 + nameLen).toString("latin1").replace(/\0+$/, "");
    if (!/^@?[\w\\.\-/]+$/.test(name)) { i += 5; continue; }
    out.push({ off: i, name });
    i += 16 + nameLen;
  }
  return out;
}

const all = [];
for (const key of ["configs", "lua", "data"]) {
  const buf = fs.readFileSync(path.join(dir, `${key}.cat`));
  const entries = indexEntries(buf);
  console.log(`=== ${key}.cat  ${buf.length} bytes  entries=${entries.length} ===`);
  for (const e of entries) e.key = key;
  all.push(...entries);
}

console.log(`\n总条目: ${all.length}`);
const top = {};
for (const e of all) {
  const d = e.name.replace(/^@?/, "").split("\\").slice(0, 2).join("/");
  top[d] = (top[d] || 0) + 1;
}
console.log("\n=== 目录分布 top 30 ===");
for (const [k, v] of Object.entries(top).sort((a, b) => b[1] - a[1]).slice(0, 30)) console.log(`  ${String(v).padStart(5)}  ${k}`);

fs.writeFileSync(path.join(dir, "entries.json"), JSON.stringify(all, null, 1));

console.log("\n=== 关键字命中 ===");
for (const kw of ["fatewheel", "minglun", "soul", "attribute", "property", "element", "currency", "exchange", "wish", "destiny"]) {
  const hits = all.filter((e) => e.name.toLowerCase().includes(kw));
  console.log(`[${kw}] ${hits.length}`);
  for (const h of hits.slice(0, 10)) console.log(`     ${h.name}`);
}
