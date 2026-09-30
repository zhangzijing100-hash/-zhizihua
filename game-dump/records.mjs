import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bny");
const f = process.argv[2];
const stride = parseInt(process.argv[3] ?? "16", 10);
const nf = parseInt(process.argv[4] ?? "4", 10);
const buf = fs.readFileSync(path.join(dir, f));
console.log(`${f}  ${buf.length} bytes  stride=${stride} fields=${nf}`);

const best = [];
for (let off = 0; off + stride * 3 <= buf.length; off++) {
  let run = 0;
  let prev = null;
  let ok = true;
  for (let r = 0; off + (r + 1) * stride <= buf.length && r < 200; r++) {
    const vals = [];
    for (let k = 0; k < nf; k++) vals.push(buf.readInt32LE(off + r * stride + k * 4));
    if (vals.some((v) => v < 0 || v > 100_000_000)) { ok = false; break; }
    if (prev === null) { prev = vals; run = 1; continue; }
    // 要求：字段0 递增 或 字段1 等值/缓增
    if (vals[0] >= prev[0] && vals[0] - prev[0] < 1000) { run++; prev = vals; }
    else { ok = false; break; }
  }
  if (ok && run >= 4) best.push({ off, run });
}
best.sort((a, b) => b.run - a.run);
console.log(`\n找到 ${best.length} 个候选区段，最长几个:`);
for (const b of best.slice(0, 6)) {
  console.log(`\n  offset=${b.off}  记录数=${b.run}`);
  for (let r = 0; r < Math.min(b.run, 8); r++) {
    const vals = [];
    for (let k = 0; k < nf; k++) vals.push(buf.readInt32LE(b.off + r * stride + k * 4));
    console.log(`     ${vals.join(", ")}`);
  }
}
