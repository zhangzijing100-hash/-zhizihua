import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const dir = process.cwd();
const buf = fs.readFileSync(path.join(dir, "configs.bin"));
const n = buf.length;

console.log("=== bytes 96..272 ===");
for (let o = 96; o < 272; o += 16) {
  const row = buf.subarray(o, o + 16);
  console.log(o.toString().padStart(7), row.toString("hex").replace(/(..)/g, "$1 ").trim(), " ", row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}

console.log("\n=== 逐步扩大输入，找流结束点 ===");
let last = null;
for (let k = 20; k <= 4000; k++) {
  try {
    const out = zlib.inflateSync(buf.subarray(16, 16 + k));
    if (last === null || out.length !== last.len || k === 4000) {
      // record changes
    }
    last = { k, len: out.length };
  } catch (e) {
    // ignore
  }
}
console.log("最后一次成功:", last);

console.log("\n=== 精确探测 ===");
for (const k of [100, 105, 108, 109, 110, 111, 112, 113, 114, 120, 128, 129, 130, 140, 160, 200, 256]) {
  try {
    const out = zlib.inflateSync(buf.subarray(16, 16 + k));
    console.log(`  subarray(16, ${16 + k}) -> OK ${out.length} bytes, tail=${out.subarray(-8).toString("hex")}`);
  } catch (e) {
    console.log(`  subarray(16, ${16 + k}) -> ${e.message}`);
  }
}
