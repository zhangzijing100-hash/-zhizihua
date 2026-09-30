import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const file = process.argv[2];
const buf = fs.readFileSync(path.join(dir, "bny", file));
console.log(`${file}  ${buf.length} bytes`);

// printable runs
const runs = [];
let cur = "", start = 0;
for (let i = 0; i <= buf.length; i++) {
  const b = i < buf.length ? buf[i] : 0;
  if (b >= 0x20 && b < 0x7f) { if (!cur) start = i; cur += String.fromCharCode(b); }
  else { if (cur.length >= 4) runs.push({ at: start, s: cur }); cur = ""; }
}
console.log(`\n可打印 run ${runs.length} 段:`);
for (const r of runs) console.log(`  @${String(r.at).padStart(6)} len=${String(r.s.length).padStart(4)}  ${JSON.stringify(r.s)}`);

// entropy map: 64-byte windows
console.log("\n=== 64字节窗口熵图 ===");
const line = [];
for (let o = 0; o < buf.length; o += 64) {
  const w = buf.subarray(o, o + 64);
  const freq = new Array(256).fill(0);
  for (const b of w) freq[b]++;
  let h = 0;
  for (const f of freq) if (f) { const p = f / w.length; h -= p * Math.log2(p); }
  const zeros = [...w].filter((x) => x === 0).length;
  line.push(`${o}:${h.toFixed(1)}/${zeros}`);
}
for (let i = 0; i < line.length; i += 8) console.log("  " + line.slice(i, i + 8).join("  "));

// int32 scan: find runs of 4+ plausible int32
console.log("\n=== 可能的 int32 序列 (4连) ===");
let found = 0;
for (let o = 0; o + 16 <= buf.length && found < 25; o++) {
  const v = [0, 1, 2, 3].map((k) => buf.readInt32LE(o + k * 4));
  const ok = v.every((x) => x >= 0 && x < 100000000);
  const nz = v.filter((x) => x !== 0).length;
  if (ok && nz >= 3) {
    console.log(`  @${String(o).padStart(6)}  ${v.join(", ")}`);
    found++;
  }
}
