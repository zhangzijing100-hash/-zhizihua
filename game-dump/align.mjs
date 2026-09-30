import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bny");
const f = process.argv[2];
const buf = fs.readFileSync(path.join(dir, f));
console.log(`${f}  ${buf.length} bytes\n`);

for (let align = 0; align < 4; align++) {
  const vals = [];
  for (let o = align; o + 4 <= buf.length; o += 4) vals.push(buf.readInt32LE(o));
  const plausible = vals.filter((v) => v >= 0 && v < 10_000_000).length;
  console.log(`align=${align}: ${vals.length} 个 int32, 合理值 ${plausible} (${(plausible / vals.length * 100).toFixed(0)}%)`);
  console.log(`   前 20: ${vals.slice(0, 20).join(", ")}`);
  const trailing = (buf.length - align) % 4;
  console.log(`   尾部余 ${trailing} 字节`);
  console.log("");
}
