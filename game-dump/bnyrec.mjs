import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const buf = fs.readFileSync(path.join(dir, "data.bin.full"));

// directory records: name at record start (spacing 280), metadata at +256
const re = /bny\\[A-Za-z0-9_.]+\.bny\0/g;
const recs = [];
const s = buf.toString("latin1");
let m;
while ((m = re.exec(s)) !== null) {
  const off = m.index;
  const name = m[0].replace(/\0$/, "");
  const meta = off + 256;
  recs.push({
    off,
    name,
    a: buf.readUInt32LE(meta),
    b: buf.readUInt32LE(meta + 4),
    c: buf.readUInt32LE(meta + 8),
    d: buf.readUInt32LE(meta + 12),
    e: buf.readUInt32LE(meta + 16),
  });
}
console.log(`records: ${recs.length}`);
console.log("sample:");
for (const r of recs.slice(0, 5)) console.log(`  ${r.name}  +256: ${r.a} ${r.b} ${r.c} ${r.d} ${r.e}  (0x${r.a.toString(16)})`);

const t = recs.find((r) => /fatecorebasepropertycfg/i.test(r.name));
console.log("\ntarget:", t);
if (t) {
  // try offset candidates
  for (const cand of [t.a, t.d, t.e, t.a + 4]) {
    if (cand <= 0 || cand >= buf.length) continue;
    console.log(`\n--- data at ${cand} ---`);
    for (let o = cand; o < Math.min(buf.length, cand + 160); o += 16) {
      const row = buf.subarray(o, o + 16);
      console.log(String(o).padStart(9), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48), row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
    }
  }
}
