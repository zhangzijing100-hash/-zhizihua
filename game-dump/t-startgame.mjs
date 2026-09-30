// 看 initgame.lua 的 StartGame（proto #21）里 HasDebugPath / GIsBuildShipping 怎么决定调试路径
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const e = entries.find((x) => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && m[0].toLowerCase().endsWith("initgame.lua");
});
const p = parseLua(e.data);
const pr = p.protos[21];
console.log(`initgame proto #21 @line ${pr.linedefined} (${pr.code.length} 条)`);
const lines = disassemble(pr);
const hit = lines.findIndex((l) => /HasDebugPath/.test(l.desc));
console.log(`HasDebugPath 在 pc=${hit >= 0 ? lines[hit].pc : "?"}\n`);
const from = Math.max(0, hit - 22), to = Math.min(lines.length - 1, hit + 30);
for (let i = from; i <= to; i++) {
  console.log(`${lines[i].pc === lines[hit]?.pc ? ">>" : "  "} ${String(lines[i].pc).padStart(4)}  ${lines[i].op.padEnd(10)} ${lines[i].desc}`);
}
