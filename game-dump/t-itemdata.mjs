import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/lua.png");
for (const want of ["modules\\item\\itemdata.lua", "modules\\item\\bag.lua", "modules\\item\\itemprotocols.lua"]) {
  const e = entries.find(x => x.data[0] === 0x1b && x.data.subarray(0,260).toString("latin1").toLowerCase().includes(want));
  if (!e) { console.log(`找不到 ${want}`); continue; }
  const head = e.data.subarray(0, 260).toString("latin1");
  const p = (head.match(/@?[\w\\/.-]+\.lua/) ?? ["?"])[0];
  console.log(`\n=== ${p}  (${e.data.length} B) ===`);
  try {
    const d = dumpLua(e.data);
    const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
    console.log(strs.join("  |  "));
  } catch (err) { console.log("  解析失败 " + err.message); }
}
