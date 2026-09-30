import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const entries = JSON.parse(fs.readFileSync(path.join(dir, "entries.json"), "utf8"));
const cats = {};
for (const key of ["configs", "lua", "data"]) cats[key] = fs.readFileSync(path.join(dir, `${key}.cat`));

const byKey = {};
for (const key of Object.keys(cats)) byKey[key] = entries.filter((e) => e.key === key);

export function findEntry(sub) {
  const s = sub.toLowerCase();
  const e = entries.find((x) => x.name.toLowerCase().includes(s));
  if (!e) throw new Error("not found: " + sub);
  const arr = byKey[e.key];
  const i = arr.indexOf(e);
  const end = i + 1 < arr.length ? arr[i + 1].off : cats[e.key].length;
  return { ...e, bytes: cats[e.key].subarray(e.off, end) };
}

function hexdump(buf, limit) {
  const n = Math.min(buf.length, limit ?? buf.length);
  for (let o = 0; o < n; o += 16) {
    const row = buf.subarray(o, o + 16);
    const hex = row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48);
    const asc = row.toString("latin1").replace(/[^\x20-\x7e]/g, ".");
    console.log(o.toString().padStart(6), hex, asc);
  }
  if (n < buf.length) console.log(`   ... (${buf.length - n} more bytes, total ${buf.length})`);
}

const target = process.argv[2];
const limit = process.argv[3] ? parseInt(process.argv[3], 10) : undefined;
const e = findEntry(target);
console.log(`name : ${e.name}`);
console.log(`key  : ${e.key}  off=${e.off}  size=${e.bytes.length}`);
console.log("");
hexdump(e.bytes, limit);
