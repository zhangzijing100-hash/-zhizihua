import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/lua.png");
const e = entries.find(x => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && /debugman\.lua$/i.test(m[0]);
});
if (!e) { console.log("没找到 debugman.lua"); process.exit(0); }
const m = e.data.subarray(0,300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
console.log(`=== ${m[0]} (${e.data.length} B) ===`);
const d = dumpLua(e.data);
console.log("数字常量: " + JSON.stringify(d.filter(x=>x.kind==="number").map(x=>x.value)));
const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
console.log("\n含 flag/path/console 的:");
strs.filter(s => /flag|path|console/i.test(s)).forEach(s => console.log("   " + JSON.stringify(s)));
