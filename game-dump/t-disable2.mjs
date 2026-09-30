// 1) debugman 开头那段条件块；2) zdirutility 里 IsDisableConsole 的实现
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const load = (suffix) => {
  const e = entries.find((x) => {
    if (x.data[0] !== 0x1b) return false;
    const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
    return m && m[0].toLowerCase().endsWith(suffix);
  });
  return e ? parseLua(e.data) : null;
};

const dm = load("debugman.lua");
console.log("===== debugman 主 chunk pc 0..60 =====");
disassemble(dm.protos[0]).forEach((l) => { if (l.pc <= 60) console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`); });

const zd = load("zdirutility.lua");
console.log(`\n===== zdirutility 里提到 IsDisableConsole / disable_console 的 proto =====`);
zd.protos.forEach((pr, i) => {
  const s = (pr.strings ?? []).filter(Boolean).map(String);
  if (!s.some((x) => /IsDisableConsole|disable_console/.test(x))) return;
  console.log(`\n--- #${i} @line ${pr.linedefined} (${pr.code.length}) ---`);
  console.log("  " + JSON.stringify(s.slice(0, 30)));
  if (pr.code.length <= 80) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
});
