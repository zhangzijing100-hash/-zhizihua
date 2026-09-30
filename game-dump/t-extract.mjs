import fs from "node:fs";
const buf = fs.readFileSync("emu/data.png");
console.log(`data.png ${buf.length} 字节`);
// 读一条名字记录的元数据
function meta(off) {
  return { dataOff: buf.readUInt32LE(off + 0x104), size: buf.readUInt32LE(off + 0x110), size2: buf.readUInt32LE(off + 0x114) };
}
const recOff = 0x4b9b400;   // cfortunewheelitemcfg.bny 的记录位置
const m = meta(recOff);
console.log(`cfortunewheelitemcfg.bny -> 数据偏移 ${m.dataOff}, 大小 ${m.size} / ${m.size2}`);
const blob = buf.subarray(m.dataOff, m.dataOff + Math.min(m.size, 64));
console.log(`数据头 64 字节: ${blob.toString("hex").replace(/(..)/g,"$1 ")}`);
console.log(`  可见字符: ${JSON.stringify(blob.toString("latin1").replace(/[^\x20-\x7e]/g,"."))}`);
// 完整导出
const full = buf.subarray(m.dataOff, m.dataOff + m.size);
fs.writeFileSync("emu/CFortuneWheelItemCfg.bny", full);
console.log(`已导出 ${full.length} 字节到 emu/CFortuneWheelItemCfg.bny`);
// 相邻记录对比，确认 offset 递增 = size
const r2 = meta(0x4b9b44e);   // 下一条 cfortunewheelpresetcfg
console.log(`下一条 -> 数据偏移 ${r2.dataOff}, 大小 ${r2.size}   差值=${r2.dataOff - m.dataOff}`);
