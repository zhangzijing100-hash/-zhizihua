import fs from "node:fs";
import path from "node:path";
import { findEntry } from "./luaq.mjs";

const dir = process.cwd();
for (const sub of process.argv.slice(2)) {
  const e = findEntry(sub);
  const buf = e.bytes;
  console.log(`\n########## ${e.name}  (${buf.length} bytes) ##########`);

  // every printable run
  const runs = [];
  let cur = "";
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b >= 0x20 && b < 0x7f) { if (!cur) start = i; cur += String.fromCharCode(b); }
    else { if (cur.length >= 4) runs.push({ at: start, s: cur }); cur = ""; }
  }
  if (cur.length >= 4) runs.push({ at: start, s: cur });
  console.log("--- 字符串 run ---");
  for (const r of runs) console.log(`  @${String(r.at).padStart(6)}  ${JSON.stringify(r.s)}`);

  console.log("--- 数值 (double/int64) 候选 ---");
  const nums = [];
  for (let i = 0; i + 8 <= buf.length; i++) {
    const d = buf.readDoubleLE(i);
    if (Number.isFinite(d) && d !== 0 && Math.abs(d) >= 0.001 && Math.abs(d) <= 1e9) {
      const s = String(d);
      if (s.length <= 12 && !/e/i.test(s) && Math.abs(d - Math.round(d)) < 1e-9) nums.push({ at: i, v: d });
    }
  }
  const seen = new Set();
  const shown = nums.filter((n) => { const k = n.v; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, 60);
  console.log("  整数型 double:", shown.map((n) => `${n.v}@${n.at}`).join(" "));
}
