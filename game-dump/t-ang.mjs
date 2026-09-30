import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const e = entries.find((x) => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && m[0].toLowerCase().endsWith("mathhelper.lua");
});
const parsed = parseLua(e.data);
// CalcAng = CLOSURE P14 -> protos[15]；Distance = P15 -> protos[16]
for (const idx of [15, 16]) {
  const p = parsed.protos[idx];
  console.log(`\n--- mathhelper proto #${idx} (对应 P${idx - 1}) @line ${p.linedefined} (${p.code.length}) ---`);
  console.log("    常量: " + JSON.stringify(p.k.map((c) => (c.t === 4 ? c.value : c.value))));
  disassemble(p).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
}
