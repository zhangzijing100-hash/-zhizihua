import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const buf = fs.readFileSync(path.join(dir, "data.bin"));
console.log(`data.bin  ${buf.length} bytes`);

// 1) .bny 目录名是否在原始文件里
const pat = Buffer.from("bny\\drc.gsp.fortunewheel");
let p = 0, found = [];
while ((p = buf.indexOf(pat, p)) !== -1) { found.push(p); p += 1; }
console.log(`\n"bny\\drc.gsp.fortunewheel" 在原始 data.bin 出现 ${found.length} 次`);
for (const o of found.slice(0, 5)) console.log(`   @${o}`);

const pat2 = Buffer.from("bny\\");
let c2 = 0; p = 0;
while ((p = buf.indexOf(pat2, p)) !== -1) { c2++; p += 1; }
console.log(`"bny\\" 共 ${c2} 次`);

// 2) entryId 所在区域的原始字节
const region = 36963083;
console.log(`\n=== entryId 区 @${region} 前后 256 字节 ===`);
for (let o = region - 64; o < region + 192; o += 16) {
  const row = buf.subarray(o, o + 16);
  console.log(String(o).padStart(9), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48), row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
console.log("--- 该区按大端 int32 ---");
const vals = [];
for (let o = region - 64; o < region + 192; o += 4) vals.push(buf.readInt32BE(o));
console.log("  " + vals.join(", "));
