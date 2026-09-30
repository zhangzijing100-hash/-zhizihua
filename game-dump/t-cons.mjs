import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/lua.png");
const hits = [];
entries.forEach(e => {
  if (e.data[0] !== 0x1b) return;
  const s = e.data.toString("latin1");
  if (!/debugcommandscfg|DebugCommand/i.test(s)) return;
  const m = e.data.subarray(0,300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  hits.push({ path: m ? m[0] : "?", len: e.data.length, data: e.data });
});
console.log(`引用 debugcommandscfg 的文件 ${hits.length} 个：`);
hits.forEach(h => console.log(`  ${String(h.len).padStart(6)} B  ${h.path}`));
// 挑一个打印常量，找「怎么打开控制台」
for (const h of hits.slice(0, 3)) {
  console.log(`\n### ${h.path}`);
  try {
    const d = dumpLua(h.data);
    const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
    console.log(strs.slice(0, 100).join("  |  "));
  } catch (err) { console.log("  解析失败"); }
}
