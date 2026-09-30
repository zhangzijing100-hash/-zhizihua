import { unpackPng } from "./unpackpng.mjs";
const { entries } = unpackPng("emu/lua.png");
const hits = [];
entries.forEach((e, i) => {
  if (e.data[0] !== 0x1b) return;
  const head = e.data.subarray(0, 260).toString("latin1");
  const m = head.match(/@?[\w\\/.-]+\.lua/);
  if (!m) return;
  const p = m[0].toLowerCase();
  if (p.includes("wheeloffortune")) hits.push({ i, path: m[0], len: e.data.length });
});
console.log(`含 wheeloffortune 的 lua 文件 ${hits.length} 个：`);
hits.forEach(h => console.log(`  #${String(h.i).padStart(6)}  ${String(h.len).padStart(6)} B  ${h.path}`));
