import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/configs.png");
const e = entries.find(x => x.data.subarray(0,300).toString("latin1").includes("servercommands.lua"));
const d = dumpLua(e.data);
const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
// 只打印以 . 开头的命令和它们的中文说明
console.log("=== 服务器 GM 命令全表 ===");
let i = 0;
while (i < strs.length) {
  if (strs[i].startsWith(".")) {
    console.log(`  ${strs[i].padEnd(34)} ${strs[i+2] ?? ""}`);
    i += 3;
  } else i++;
}
