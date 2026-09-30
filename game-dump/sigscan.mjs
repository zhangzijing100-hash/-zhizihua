import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bny");
const files = fs.readdirSync(dir);
const want = process.argv.slice(2).map(Number);
console.log("目标签名:", want.join(", "));

const hits = [];
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  const vals = [];
  for (let o = 0; o + 4 <= buf.length; o++) vals.push({ at: o, v: buf.readInt32LE(o) });
  // sliding window of 40 int32 (160 bytes) containing all wanted values in order
  const W = 48;
  for (let i = 0; i + W <= vals.length; i++) {
    const win = vals.slice(i, i + W);
    let k = 0;
    for (const x of win) {
      if (x.v === want[k]) { k++; if (k === want.length) break; }
    }
    if (k === want.length) {
      const from = vals[i].at;
      const to = vals[i + W - 1].at + 4;
      hits.push({ f, from, to, sample: win.filter((x) => want.includes(x.v)).slice(0, 8).map((x) => `${x.v}@${x.at}`) });
      i += W - 1;
    }
  }
}
console.log(`命中文件数: ${new Set(hits.map((h) => h.f)).size}, 命中窗口: ${hits.length}`);
const byFile = {};
for (const h of hits) (byFile[h.f] ??= []).push(h);
for (const [f, hs] of Object.entries(byFile).slice(0, 30)) {
  console.log(`\n  ${f}  (${hs.length} 个窗口)`);
  for (const h of hs.slice(0, 4)) console.log(`     @${h.from}-${h.to}   ${h.sample.join(" ")}`);
}
