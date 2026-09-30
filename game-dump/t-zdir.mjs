import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/lua.png");
for (const name of ["zdirutility.lua", "debugman.lua"]) {
  const e = entries.find(x => {
    if (x.data[0] !== 0x1b) return false;
    const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
    return m && m[0].toLowerCase().endsWith(name);
  });
  if (!e) continue;
  const d = dumpLua(e.data);
  const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
  console.log(`\n### ${name}`);
  strs.filter(s => /flag|console|Path|path|Saved|\/|\\\\/.test(s)).slice(0, 40).forEach(s => console.log("   " + JSON.stringify(s)));
}
