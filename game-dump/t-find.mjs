import fs from "node:fs";
const b = fs.readFileSync("emu/unpacked-configs.bin");
const s = b.toString("latin1");
console.log(`文件 ${b.length} 字节`);
for (const key of ["fortunewheel", "FortuneWheel", "bny", "item", "Item"]) {
  const idx = [];
  let i = -1;
  while ((i = s.indexOf(key, i + 1)) >= 0 && idx.length < 6) idx.push(i);
  console.log(`  "${key}": ${idx.length ? idx.join(", ") : "无"}`);
}
// 全部 .bny 路径
const bny = [];
let i = -1;
while ((i = s.indexOf(".bny", i + 1)) >= 0 && bny.length < 40) {
  let st = i;
  while (st > 0 && b[st-1] >= 32 && b[st-1] < 127) st--;
  bny.push(s.slice(st, i + 4));
}
console.log(`\n含 .bny 的条目共 ${bny.length} 个（前 25）:`);
bny.slice(0,25).forEach(x => console.log("   " + x));
