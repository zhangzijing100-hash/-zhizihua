import fs from "node:fs";
const b = fs.readFileSync("emu/mem-slice.bin");
const base = 0x78c218c5ad00n;
console.log(`读入 ${b.length} 字节，基址 0x${base.toString(16)}`);
for (let off = 0; off + 16 <= b.length; off += 16) {
  const ints = [];
  for (let k = 0; k < 16; k += 4) ints.push(b.readInt32LE(off + k));
  const ptr = b.readBigUInt64LE(off);
  const hex = Array.from(b.subarray(off, off+16)).map(x=>x.toString(16).padStart(2,"0")).join(" ");
  console.log(`  0x${(base + BigInt(off)).toString(16)}  ${hex}   i32=[${ints.join(",")}]`);
}
