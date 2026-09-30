import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const terms = process.argv.slice(2);
const files = ["lua.cat", "configs.cat", "data.bin.full"];

for (const t of terms) {
  const pat = Buffer.from(t, "utf8");
  console.log(`\n=== "${t}" (utf8 ${pat.length} bytes) ===`);
  let total = 0;
  for (const f of files) {
    const p = path.join(dir, f);
    if (!fs.existsSync(p)) continue;
    const buf = fs.readFileSync(p);
    let i = 0, n = 0;
    const ctxs = [];
    while ((i = buf.indexOf(pat, i)) !== -1) {
      n++;
      if (ctxs.length < 6) {
        const from = Math.max(0, i - 90), to = Math.min(buf.length, i + 90);
        ctxs.push(buf.subarray(from, to).toString("utf8").replace(/[^\u4e00-\u9fff\x20-\x7e]/g, "."));
      }
      i += pat.length;
    }
    total += n;
    if (n) {
      console.log(`  ${f}: ${n} 次`);
      for (const c of ctxs) console.log(`     …${c}…`);
    }
  }
  if (!total) console.log("  (无命中)");
}
