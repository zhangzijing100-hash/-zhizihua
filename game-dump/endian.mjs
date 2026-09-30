import fs from "node:fs";
import path from "node:path";

const big = path.join(process.cwd(), "bny/drc.gsp.fortunewheel.confbean.fortunewheelentrylevelcfg.bny");
const buf = fs.readFileSync(big);
console.log(`${path.basename(big)}  ${buf.length} bytes\n`);

const wb = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/workbench.json", "utf8"));
const known = new Set();
for (const w of wb.fateWheels) {
  const g = w.perStarGains.find((x) => x.sourceAttributeId === "source.fate-value");
  if (g) known.add(g.value);
}
const vals = [...known].sort((a, b) => a - b);

const mk = (v, be) => { const b = Buffer.alloc(4); be ? b.writeInt32BE(v) : b.writeInt32LE(v); return b; };

console.log("=== 大端 int32 搜索 ===");
let hitBE = 0;
for (const v of vals) {
  const pat = mk(v, true);
  let c = 0, p = 0, first = -1;
  while ((p = buf.indexOf(pat, p)) !== -1) { c++; if (first < 0) first = p; p += 1; }
  if (c) hitBE++;
  if (c || v >= 200) console.log(`  ${String(v).padStart(5)} : BE ${String(c).padStart(6)} 次${first >= 0 ? `  首次 @${first}` : ""}`);
}
console.log(`\n大端命中值种类: ${hitBE} / ${vals.length}`);

console.log("\n=== 对比：小端 ===");
let hitLE = 0;
for (const v of vals) {
  const pat = mk(v, false);
  let c = 0, p = 0;
  while ((p = buf.indexOf(pat, p)) !== -1) { c++; p += 1; }
  if (c) hitLE++;
}
console.log(`小端命中值种类: ${hitLE} / ${vals.length}`);

// 也试 2 字节与 8 字节
console.log("\n=== 16 位（BE/LE）搜索 330 / 270 / 225 / 315 ===");
for (const v of [330, 270, 225, 315, 210, 195, 115, 100, 96]) {
  const l = Buffer.alloc(2), b = Buffer.alloc(2);
  l.writeUInt16LE(v); b.writeUInt16BE(v);
  const cnt = (pat) => { let c = 0, p = 0; while ((p = buf.indexOf(pat, p)) !== -1) { c++; p += 1; } return c; };
  console.log(`  ${String(v).padStart(4)} : u16LE ${String(cnt(l)).padStart(5)}  u16BE ${String(cnt(b)).padStart(5)}`);
}
