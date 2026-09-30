// 找 debugcmd.lua 里跟「背包/碎片」相关的命令实现
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const e = entries.find((x) => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && m[0].toLowerCase().endsWith("debugcmd.lua");
});
if (!e) { console.log("找不到 debugcmd.lua"); process.exit(1); }
const p = parseLua(e.data);
console.log(`debugcmd.lua proto=${p.protos.length}\n`);

const re = /包|袋|碎片|Bag|bag|ItemData|GetItemNumber|背包/;
const maxIns = parseInt(process.env.MAXINS ?? "250", 0);
p.protos.forEach((pr, i) => {
  const s = (pr.strings ?? []).filter(Boolean).map(String);
  const hit = s.filter((x) => re.test(x));
  if (!hit.length) return;
  const big = pr.code.length > maxIns;
  console.log(`\n--- proto #${i} @line ${pr.linedefined} (${pr.code.length})${big ? " [跳过反汇编]" : ""} ---`);
  console.log("  " + JSON.stringify(hit.slice(0, 30)));
  if (!big) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
});
