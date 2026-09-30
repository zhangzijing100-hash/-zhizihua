// 反汇编 MathHelper.CalcAng / Distance，以及 debugman 里的方向一致性判定闭包 P0
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");

function find(name) {
  return entries.find((x) => {
    if (x.data[0] !== 0x1b) return false;
    const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
    return m && m[0].toLowerCase().endsWith(name);
  });
}

function dump(file, needles) {
  const e = find(file);
  if (!e) { console.log(`找不到 ${file}`); return; }
  const parsed = parseLua(e.data);
  console.log(`\n############ ${file}  proto=${parsed.protos.length} ############`);
  parsed.protos.forEach((p, i) => {
    const hit = needles.filter((n) => (p.strings ?? []).some((s) => s && String(s).includes(n)));
    if (!hit.length || p.code.length > 80) return;
    console.log(`\n--- proto #${i} @line ${p.linedefined} 命中 ${hit.join("/")} (${p.code.length}) ---`);
    disassemble(p).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
  });
}

dump("mathhelper.lua", ["CalcAng", "Distance"]);
dump("debugman.lua", ["CalcAng"]);

// debugman 的 P0 闭包（proto#1）就是方向一致性判定
const e = find("debugman.lua");
const parsed = parseLua(e.data);
for (const i of [1, 2]) {
  const p = parsed.protos[i];
  if (!p) continue;
  console.log(`\n--- debugman proto #${i} @line ${p.linedefined} (${p.code.length}) ---`);
  console.log("    常量: " + JSON.stringify(p.k.map((c) => c.value)));
  disassemble(p).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
}
