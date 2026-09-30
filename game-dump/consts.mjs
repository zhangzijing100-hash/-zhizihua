import { findEntry, extractConstants } from "./luaq.mjs";

const sub = process.argv[2];
const e = findEntry(sub);
const best = extractConstants(e.bytes);
console.log(`file : ${e.name}`);
console.log(`size : ${e.bytes.length}`);
if (!best) { console.log("no constants found"); process.exit(0); }
console.log(`const pool: offset ${best.start}..${best.end}  count=${best.seq.length}`);
console.log("");
for (let i = 0; i < best.seq.length; i++) {
  const c = best.seq[i];
  if (c.value === null) console.log(`${String(i).padStart(4)}  nil`);
  else if (typeof c.value === "bigint") console.log(`${String(i).padStart(4)}  int   ${c.value}`);
  else if (typeof c.value === "number") console.log(`${String(i).padStart(4)}  num   ${c.value}`);
  else console.log(`${String(i).padStart(4)}  str   ${JSON.stringify(c.value)}`);
}
