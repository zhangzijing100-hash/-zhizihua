import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/configs.png");
for (const file of ["servercommands.lua", "debugcommandscfg.lua"]) {
  const e = entries.find(x => x.data.subarray(0,300).toString("latin1").toLowerCase().includes(file));
  if (!e) { console.log(`找不到 ${file}`); continue; }
  const d = dumpLua(e.data);
  const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
  console.log(`\n########## ${file}（${strs.length} 个字符串） ##########`);
  // 命令 = 以 . 开头（服务器）或纯 [a-z_]+（客户端）
  const cmds = strs.filter(s => /^[.a-z_][\w.]*$/i.test(s) && /[a-z_]/i.test(s) && s.length > 2);
  console.log("命令/标识符：");
  cmds.forEach(s => process.stdout.write(s + "  "));
  console.log("\n\n含中文说明的：");
  strs.filter(s => /[\u4e00-\u9fa5]/.test(s)).forEach(s => console.log("   " + s));
}
