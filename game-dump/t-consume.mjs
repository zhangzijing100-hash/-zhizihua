import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/lua.png");
const KEY = "GetItemCanConsumeNumber";
for (const e of entries) {
  if (e.data[0] !== 0x1b) continue;
  const s = e.data.toString("latin1");
  if (!s.includes(KEY)) continue;
  const head = e.data.subarray(0, 260).toString("latin1");
  const p = (head.match(/@?[\w\\/.-]+\.lua/) ?? ["?"])[0];
  console.log(`\n### ${p}  (${e.data.length} B)`);
  try {
    const d = dumpLua(e.data);
    const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
    console.log("  全部字符串常量：");
    console.log("   " + strs.join("  |  "));
  } catch (err) { console.log("  解析失败 " + err.message); }
}
