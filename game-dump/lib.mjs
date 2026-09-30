import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const entries = JSON.parse(fs.readFileSync(path.join(dir, "entries.json"), "utf8"));
const cats = {};
for (const key of ["configs", "lua", "data"]) cats[key] = fs.readFileSync(path.join(dir, `${key}.cat`));

export function entryBytes(e, upto) {
  const buf = cats[e.key];
  const all = entries.filter((x) => x.key === e.key);
  const idx = all.indexOf(e);
  const next = idx + 1 < all.length ? all[idx + 1].off : buf.length;
  const end = upto ?? next;
  return buf.subarray(e.off, end);
}

const groups = process.argv[2] || "fatecore";
const hits = entries.filter((e) => e.name.toLowerCase().includes(groups));
console.log(`=== "${groups}" 命中 ${hits.length} 条 ===`);
for (const e of hits) console.log(`  ${e.key.padEnd(8)} ${e.name}`);
