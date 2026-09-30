import { unpackPng } from "./unpackpng.mjs";
import { dumpLua } from "./luadump.mjs";
const { entries } = unpackPng("emu/lua.png");
// 找定义了 GetItemNumber 的文件（同时含 _item / map 之类字段名）
const cands = [];
entries.forEach((e, i) => {
  if (e.data[0] !== 0x1b) return;
  const s = e.data.toString("latin1");
  if (!s.includes("GetItemNumber")) return;
  const head = e.data.subarray(0, 260).toString("latin1");
  const p = (head.match(/@?[\w\\/.-]+\.lua/) ?? ["?"])[0];
  if (!/item/i.test(p)) return;
  cands.push({ i, p, len: e.data.length, data: e.data });
});
console.log(`候选 ${cands.length} 个（路径含 item 且提到 GetItemNumber）：`);
cands.slice(0, 25).forEach(c => console.log(`  #${String(c.i).padStart(6)} ${String(c.len).padStart(6)} B  ${c.p}`));
if (cands.length) {
  // 挑最像管理器的，打印字符串常量
  const best = cands.sort((a,b)=>b.len-a.len)[0];
  console.log(`\n=== 最大候选（最可能是数据层）：${best.p} ===`);
  const d = dumpLua(best.data);
  const strs = [...new Set(d.filter(x=>x.kind==="string"&&x.value).map(x=>x.value))];
  console.log(strs.join("  |  "));
}
