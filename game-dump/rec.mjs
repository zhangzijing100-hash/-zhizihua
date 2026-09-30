import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const buf = fs.readFileSync(path.join(dir, "data.bin.full"));
const at = parseInt(process.argv[2], 10);
const span = parseInt(process.argv[3] ?? "280", 10);

for (let o = at; o < at + span; o += 16) {
  const row = buf.subarray(o, o + 16);
  console.log(String(o).padStart(9), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48), row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
console.log("\n--- 解释为 uint32 ---");
for (let o = at; o + 4 <= at + span; o += 4) {
  const v = buf.readUInt32LE(o);
  console.log(`  +${String(o - at).padStart(3)}  u32=${String(v).padStart(12)}  0x${v.toString(16).padStart(8, "0")}`);
}
