import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bny");
const f = process.argv[2];
const buf = fs.readFileSync(path.join(dir, f));
console.log(`${f}  ${buf.length} bytes`);

console.log("\n=== 前 192 字节 ===");
for (let o = 0; o < Math.min(192, buf.length); o += 16) {
  const row = buf.subarray(o, o + 16);
  console.log(String(o).padStart(6), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48), row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}

const step = Math.max(1000, Math.floor(buf.length / 60));
console.log(`\n=== 熵图 (窗口 ${step}B, 采样 4096B) ===`);
const parts = [];
for (let o = 0; o < buf.length; o += step) {
  const seg = buf.subarray(o, Math.min(o + 4096, buf.length));
  const freq = new Array(256).fill(0);
  for (const b of seg) freq[b]++;
  let h = 0;
  for (const c of freq) if (c) { const p = c / seg.length; h -= p * Math.log2(p); }
  // fraction of zero bytes
  const z = freq[0] / seg.length;
  parts.push(`${o}:${h.toFixed(1)}/${(z * 100).toFixed(0)}%`);
}
for (let i = 0; i < parts.length; i += 6) console.log("  " + parts.slice(i, i + 6).join("  "));
