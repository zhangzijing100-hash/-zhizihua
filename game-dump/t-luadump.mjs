import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/lua.png");
const want = ["cfortunewheelitemcfg", "fortunewheelitem2entrycfg", "fortunewheelitem2uritemcfg", "dynamic_cfortunewheelitembean"];
for (const e of entries) {
  const head = e.data.subarray(0, 200).toString("latin1");
  const src = (head.match(/@?[\w\\/.-]+\.lua/) ?? [""])[0];
  const base = src.split("\\").pop().replace(".lua","");
  if (!want.includes(base)) continue;
  console.log(`\n=== ${src}  (${e.data.length} B) ===`);
  try {
    const d = dumpLua(e.data);
    const strs = d.filter(x => x.kind === "string" && x.value !== src);
    const nums = d.filter(x => x.kind === "number");
    console.log(`  字符串 ${strs.length} 个，数字 ${nums.length} 个`);
    console.log("  前 60 个字符串: " + strs.slice(0,60).map(x=>JSON.stringify(x.value)).join(" "));
    console.log("  前 40 个数字: " + nums.slice(0,40).map(x=>x.value).join(" "));
  } catch (err) {
    console.log("  解析失败: " + err.message);
  }
}
