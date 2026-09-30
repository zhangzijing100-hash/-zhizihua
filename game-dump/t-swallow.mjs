// 谁在调用 SetPreTouchSwallowed / SetSituation
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const needles = (process.argv[2] ?? "SetPreTouchSwallowed").split(",");

const hits = [];
entries.forEach((e) => {
  if (e.data[0] !== 0x1b) return;
  const s = e.data.toString("latin1");
  if (!needles.some((n) => s.includes(n))) return;
  const m = e.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  hits.push({ path: m ? m[0] : "?", data: e.data });
});
console.log(`提到 ${needles.join("/")} 的文件 ${hits.length} 个：`);
hits.forEach((h) => console.log("   " + h.path));

for (const h of hits) {
  const p = parseLua(h.data);
  p.protos.forEach((pr, i) => {
    const s = (pr.strings ?? []).filter(Boolean).map(String);
    const hit = needles.filter((n) => s.some((x) => x.includes(n)));
    if (!hit.length) return;
    console.log(`\n--- ${h.path} #${i} @line ${pr.linedefined} (${pr.code.length}) 命中 ${hit.join("/")} ---`);
    console.log("  " + JSON.stringify(s.slice(0, 25)));
    if (pr.code.length <= 60) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
  });
}
