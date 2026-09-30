import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
// 先看 configs.png 里的 debugcommandscfg / servercommands
const { entries } = unpackPng("emu/configs.png");
for (const e of entries) {
  const head = e.data.subarray(0, 300).toString("latin1");
  const m = head.match(/@?[\w\\/.-]+\.lua/);
  if (!m) continue;
  if (!/debugcommand|servercommand|gm/i.test(m[0])) continue;
  console.log(`\n### ${m[0]}  (${e.data.length} B)`);
  try {
    const d = dumpLua(e.data);
    const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
    console.log(strs.slice(0, 120).join("  |  "));
    const nums = d.filter(x=>x.kind==="number").map(x=>x.value);
    console.log("数字: " + nums.slice(0, 40).join(", "));
  } catch (err) { console.log("  解析失败 " + err.message); }
}
// 再全局搜有没有「控制台」相关
const all = unpackPng("emu/lua.png");
const hits = [];
all.entries.forEach(e => {
  if (e.data[0] !== 0x1b) return;
  const head = e.data.subarray(0, 300).toString("latin1");
  const m = head.match(/@?[\w\\/.-]+\.lua/);
  if (!m) return;
  if (/console|debugcommand|gmcommand/i.test(m[0])) hits.push(m[0]);
});
console.log(`\n名字里带 console/debugcommand/gmcommand 的 lua：${hits.length} 个`);
hits.slice(0, 20).forEach(h => console.log("  " + h));
