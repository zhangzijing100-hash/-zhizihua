// 在整个 lua 包里找哪些文件提到 printfortunewheel，并把相关 proto 的字符串/反汇编打出来
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const needle = (process.argv[2] ?? "printfortunewheel").toLowerCase();
const { entries } = unpackPng("emu/lua.png");
const hits = [];
entries.forEach((e) => {
  if (e.data[0] !== 0x1b) return;
  const s = e.data.toString("latin1").toLowerCase();
  if (!s.includes(needle)) return;
  const m = e.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  hits.push({ path: m ? m[0] : "?", len: e.data.length, data: e.data });
});
console.log(`提到 "${needle}" 的文件：${hits.length} 个`);
hits.forEach((h) => console.log(`   ${String(h.len).padStart(7)} B  ${h.path}`));

for (const h of hits) {
  const parsed = parseLua(h.data);
  console.log(`\n########## ${h.path}  proto=${parsed.protos.length} ##########`);
  parsed.protos.forEach((p, i) => {
    const strs = (p.strings ?? []).filter(Boolean);
    if (!strs.some((s) => String(s).toLowerCase().includes(needle))) return;
    console.log(`\n--- proto #${i} @line ${p.linedefined} (${p.code.length} 条) ---`);
    console.log("  字符串: " + JSON.stringify(strs));
    if (p.code.length <= 400) disassemble(p).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
  });
}
