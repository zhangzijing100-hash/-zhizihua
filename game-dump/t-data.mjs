import fs from "node:fs";
import zlib from "node:zlib";
const b = fs.readFileSync("emu/data.png");
console.log(`data.png ${b.length} 字节，头: ${b.subarray(0,20).toString("hex").replace(/(..)/g,"$1 ")}`);
for (const off of [16]) {
  try {
    const out = zlib.inflateSync(b.subarray(off), { maxOutputLength: 1024 * 1024 * 1024 });
    console.log(`从 0x${off.toString(16)} inflate 成功：${(out.length/1048576).toFixed(1)} MB`);
    fs.writeFileSync("emu/unpacked-data.bin", out);
    const s = out.toString("latin1");
    for (const key of ["fortunewheel", "FortuneWheel", ".bny", "confbean"]) {
      const i = s.indexOf(key);
      console.log(`  含 "${key}": ${i >= 0 ? "偏移 " + i : "无"}`);
    }
  } catch (e) { console.log(`失败: ${e.message}`); }
}
