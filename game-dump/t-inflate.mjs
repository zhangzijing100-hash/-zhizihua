import fs from "node:fs";
import zlib from "node:zlib";
for (const f of ["emu/configs.png", "emu/lua-delta.png"]) {
  const b = fs.readFileSync(f);
  console.log(`\n=== ${f} ===`);
  for (const off of [16, 0x122, 0x132, 0x128]) {
    try {
      const out = zlib.inflateSync(b.subarray(off), { maxOutputLength: 400 * 1024 * 1024 });
      console.log(`  从 0x${off.toString(16)} inflate 成功！解开 ${out.length} 字节 (${(out.length/1048576).toFixed(1)} MB)`);
      fs.writeFileSync(f.replace(/.*\//, "emu/unpacked-").replace(".png","").replace("lua-delta","lua") + ".bin", out);
      console.log(`  头 32 字节: ${out.subarray(0,32).toString("hex").replace(/(..)/g,"$1 ")}`);
      console.log(`  前 200 字符: ${JSON.stringify(out.subarray(0,200).toString("latin1"))}`);
      break;
    } catch (e) {
      console.log(`  从 0x${off.toString(16)} 失败: ${String(e.message).slice(0,60)}`);
    }
  }
}
