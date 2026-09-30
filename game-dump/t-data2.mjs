import fs from "node:fs";
import zlib from "node:zlib";
const b = fs.readFileSync("emu/data.png");
console.log("前 128 字节:");
for (let off = 0; off < 128; off += 32) {
  const c = b.subarray(off, off+32);
  console.log(`  ${off.toString(16).padStart(4,"0")}  ${Array.from(c).map(x=>x.toString(16).padStart(2,"0")).join(" ")}  ${Array.from(c).map(x=>(x>=32&&x<127)?String.fromCharCode(x):".").join("")}`);
}
console.log("\n扫描前 8KB 里的 zlib 候选:");
for (let off = 0; off < 8192; off++) {
  if (b[off] === 0x78 && (b[off+1] === 0x01 || b[off+1] === 0x9c || b[off+1] === 0xda)) {
    try {
      const out = zlib.inflateSync(b.subarray(off), { maxOutputLength: 1024*1024*1024 });
      console.log(`  ✓ 偏移 0x${off.toString(16)} (${b[off+1].toString(16)}) -> ${(out.length/1048576).toFixed(1)} MB`);
      fs.writeFileSync("emu/unpacked-data.bin", out);
      const s = out.toString("latin1");
      for (const key of ["fortunewheel", "FortuneWheel", ".bny", "confbean"]) {
        console.log(`      含 "${key}": ${s.includes(key) ? "有（偏移 " + s.indexOf(key) + "）" : "无"}`);
      }
      break;
    } catch (e) { /* 继续找 */ }
  }
}
