import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const { entries } = unpackPng("emu/data.png");
// 从尾部往前找 280 字节名字记录段
let nameStart = entries.length;
while (nameStart > 0 && entries[nameStart - 1].data.length === 280) nameStart--;
const names = entries.slice(nameStart);
const contents = entries.slice(0, nameStart);
console.log(`内容条目 ${contents.length}，名字记录 ${names.length}  -> ${contents.length === names.length ? "1:1 ✓" : "数量不等 ✗"}`);
// 找命轮配置
const idx = names.findIndex(e => e.data.toString("latin1").toLowerCase().includes("cfortunewheelitemcfg.bny"));
console.log(`cfortunewheelitemcfg.bny 在名字表第 ${idx} 位`);
if (idx >= 0) {
  const nm = names[idx].data.toString("latin1").split("\u0000")[0];
  const c = contents[idx];
  console.log(`  名字: ${nm}`);
  console.log(`  内容: ${c.data.length} B，头 48 字节: ${c.data.subarray(0,48).toString("hex").replace(/(..)/g,"$1 ")}`);
  fs.writeFileSync("emu/CFortuneWheelItemCfg.bny", c.data);
  console.log("  已写出 emu/CFortuneWheelItemCfg.bny");
}
// 顺便把命轮相关的都导出来
for (const key of ["fortunewheelitem2entrycfg", "fortunewheelentrylevelcfg", "fortunewheelitem2uritemcfg"]) {
  const k = names.findIndex(e => e.data.toString("latin1").toLowerCase().includes(key + ".bny"));
  if (k >= 0) { fs.writeFileSync(`emu/${key}.bny`, contents[k].data); console.log(`  已导出 ${key}.bny  ${contents[k].data.length} B`); }
}
