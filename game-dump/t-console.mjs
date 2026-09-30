// 反汇编 debugman.lua 里跟「控制台开关」有关的那几个函数
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");

function pick(name) {
  return entries.find((x) => {
    if (x.data[0] !== 0x1b) return false;
    const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
    return m && m[0].toLowerCase().endsWith(name);
  });
}

const want = (process.argv[2] ?? "debugman.lua").toLowerCase();
const e = pick(want);
if (!e) { console.log("找不到 " + want); process.exit(1); }
const m = e.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
const parsed = parseLua(e.data);
console.log(`=== ${m[0]}  proto 数=${parsed.protos.length} ===\n`);

const needles = (process.argv[3] ?? "console.flag,HasDebugPath,IsFileExist,IsDisableConsole,GetInputSituationProxy,ToggleShow").split(",");

const maxIns = parseInt(process.env.MAXINS ?? "120", 0);
parsed.protos.forEach((p, i) => {
  const hit = needles.filter((n) => (p.strings ?? []).some((s) => s && String(s).includes(n)));
  if (!hit.length) return;
  if (p.code.length > maxIns) { console.log(`\n##### proto #${i} @line ${p.linedefined}  命中 ${hit.join("/")} —— ${p.code.length} 条指令，跳过（MAXINS=${maxIns}）`); return; }
  console.log(`\n##### proto #${i}  @line ${p.linedefined}  命中 ${hit.join(" / ")}  （${p.code.length} 条指令）`);
  const lines = disassemble(p);
  lines.forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
});
