// debugman.lua 里 IsDisableConsole / HasDebugPath / console.flag 到底怎么用的，谁调 Init
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");

// 1) 哪些文件引用了 DebugMan
const users = [];
entries.forEach((e) => {
  if (e.data[0] !== 0x1b) return;
  const s = e.data.toString("latin1");
  if (!/DebugMan|Core\.Debug\.DebugMan/.test(s)) return;
  const m = e.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  users.push(m ? m[0] : "?");
});
console.log("引用 DebugMan 的文件：");
users.forEach((u) => console.log("   " + u));

// 2) debugman 主 chunk 里跟开关相关的指令
const e = entries.find((x) => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && m[0].toLowerCase().endsWith("debugman.lua");
});
const p = parseLua(e.data);
const pr = p.protos[0];
console.log("\n=== debugman 主 chunk 里含 IsDisable/HasDebug/console.flag/Init 的指令 ===");
const lines = disassemble(pr);
lines.forEach((l, i) => {
  if (/IsDisable|HasDebug|console\.flag|InitDebugCommandCfg|"Init"|DebugMan/.test(l.desc)) {
    const from = Math.max(0, i - 4);
    for (let j = from; j <= i + 4 && j < lines.length; j++) {
      const mark = j === i ? ">>" : "  ";
      console.log(`${mark} ${String(lines[j].pc).padStart(4)}  ${lines[j].op.padEnd(10)} ${lines[j].desc}`);
    }
    console.log("   ---");
  }
});
