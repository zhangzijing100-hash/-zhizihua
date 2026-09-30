import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";

const name = (process.argv[2] ?? "debugman").toLowerCase();
const { entries } = unpackPng("emu/lua.png");
const e = entries.find((x) => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && m[0].toLowerCase().endsWith(name + ".lua");
});
if (!e) { console.log("没找到 " + name); process.exit(0); }
const m = e.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
console.log(`=== ${m[0]} (${e.data.length} B) ===\n`);

const d = dumpLua(e.data);
const strs = [...new Set(d.filter((x) => x.kind === "string" && x.value).map((x) => x.value))];
console.log(`字符串常量 ${strs.length} 个：`);
strs.forEach((s) => console.log("  " + JSON.stringify(s)));
