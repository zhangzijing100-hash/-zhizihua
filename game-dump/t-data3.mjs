import fs from "node:fs";
const b = fs.readFileSync("emu/unpacked-data.bin");
console.log(`大小 ${b.length}`);
console.log("头 64 字节 hex:", b.subarray(0,64).toString("hex").replace(/(..)/g,"$1 "));
console.log("头 300 字符:", JSON.stringify(b.subarray(0,300).toString("latin1")));
const s = b.toString("latin1");
for (const key of [".bny", "drc.", "gsp", "fortunewheel", "item"]) {
  const idx = []; let i = -1;
  while ((i = s.indexOf(key, i+1)) >= 0 && idx.length < 5) idx.push(i);
  console.log(`  "${key}": ${idx.length ? idx.join(", ") : "无"}`);
}
// 看看是不是长度前缀的路径表
console.log("\n按 uint16 长度前缀解析前 12 条:");
let off = 0;
for (let n = 0; n < 12 && off + 2 <= b.length; n++) {
  const len = b.readUInt16LE(off);
  if (len === 0 || len > 300 || off + 2 + len > b.length) { console.log(`  [${off}] len=${len} 停`); break; }
  console.log(`  [${off}] len=${len}  ${JSON.stringify(b.subarray(off+2, off+2+len).toString("latin1"))}`);
  off += 2 + len;
}
