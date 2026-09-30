import fs from "node:fs";
for (const f of ["emu/lua-delta.png", "emu/configs.png"]) {
  const b = fs.readFileSync(f);
  console.log(`\n=== ${f} 前 512 字节 ===`);
  for (let off = 0; off < 512; off += 32) {
    const chunk = b.subarray(off, off + 32);
    const hex = Array.from(chunk).map(x => x.toString(16).padStart(2,"0")).join(" ");
    const asc = Array.from(chunk).map(x => (x >= 32 && x < 127) ? String.fromCharCode(x) : ".").join("");
    console.log(`  ${off.toString(16).padStart(4,"0")}  ${hex}  ${asc}`);
  }
}
