import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const buf = fs.readFileSync(path.join(dir, "data.bin.full"));

const re = /bny\\[A-Za-z0-9_.]+\.bny\0/g;
const recs = [];
const s = buf.toString("latin1");
let m;
while ((m = re.exec(s)) !== null) {
  const off = m.index;
  const meta = off + 256;
  recs.push({
    name: m[0].replace(/\0$/, ""),
    offset: buf.readUInt32LE(meta + 4),
    size: buf.readUInt32LE(meta + 8 + 4),
  });
}
console.log(`records: ${recs.length}`);
const sorted = [...recs].sort((a, b) => a.offset - b.offset);
console.log("first 3 by offset:", sorted.slice(0, 3).map((r) => `${r.offset}+${r.size} ${r.name}`));
console.log("last 3 by offset:", sorted.slice(-3).map((r) => `${r.offset}+${r.size} ${r.name}`));

const filter = process.argv[2] ?? "fatecore";
const outDir = path.join(dir, "bny");
fs.mkdirSync(outDir, { recursive: true });
const hits = recs.filter((r) => r.name.toLowerCase().includes(filter.toLowerCase()));
console.log(`\n"${filter}" -> ${hits.length} 张表`);
for (const h of hits) {
  const data = buf.subarray(h.offset, h.offset + h.size);
  const short = h.name.replace(/^bny\\/, "");
  fs.writeFileSync(path.join(outDir, short), data);
  const head = data.subarray(0, 48).toString("hex").replace(/(..)/g, "$1 ").trim();
  console.log(`  ${short.padEnd(70)} off=${String(h.offset).padStart(9)} size=${String(h.size).padStart(7)}  ${head}`);
}
