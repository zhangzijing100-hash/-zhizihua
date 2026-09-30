// 看 lua 包里 GetInputSituationProxy / OnPreTouch* 的用法，确认 Add(fn, tag) 的约定
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const hits = [];
entries.forEach((e) => {
  if (e.data[0] !== 0x1b) return;
  const s = e.data.toString("latin1");
  if (!s.includes("GetInputSituationProxy")) return;
  const m = e.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  hits.push({ path: m ? m[0] : "?", len: e.data.length, data: e.data });
});
console.log(`用到 GetInputSituationProxy 的文件 ${hits.length} 个：`);
hits.forEach((h) => console.log(`   ${String(h.len).padStart(7)} B  ${h.path}`));

// 把每个文件里相关 proto 的字符串列出来，找 OnPreTouch* 的注册
for (const h of hits) {
  const p = parseLua(h.data);
  p.protos.forEach((pr, i) => {
    const s = (pr.strings ?? []).filter(Boolean).map(String);
    if (!s.some((x) => x.includes("OnPreTouch") || x.includes("GetInputSituationProxy"))) return;
    const rel = s.filter((x) => /Situation|OnPre|OnTouch|OnClick|Priority|Add|Input/.test(x));
    console.log(`\n--- ${h.path} #${i} @line ${pr.linedefined} (${pr.code.length}) ---`);
    console.log("  " + JSON.stringify(rel.slice(0, 40)));
    if (pr.code.length <= 70) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
  });
}
