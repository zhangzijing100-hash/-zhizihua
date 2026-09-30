import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/lua.png");
let n = 0;
for (const e of entries) {
  if (e.data[0] !== 0x1b) continue;
  const head = e.data.subarray(0, 260).toString("latin1");
  if (!/fortunestarbag/i.test(head)) continue;
  n++;
  const src = (head.match(/@?[\w\\/.-]+\.lua/) ?? [""])[0];
  console.log(`\n### ${src}  (${e.data.length} B)`);
  try {
    const d = dumpLua(e.data);
    const strs = d.filter(x => x.kind === "string" && x.value && x.value !== src && !x.value.startsWith("bny."));
    console.log("  字符串: " + [...new Set(strs.map(x=>x.value))].slice(0,80).join(" | "));
  } catch (err) { console.log("  解析失败 " + err.message); }
  if (n >= 4) break;
}
console.log(`\n命中 ${n} 个文件`);
