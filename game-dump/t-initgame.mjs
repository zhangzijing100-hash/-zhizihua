// initgame.lua 鎬庝箞鍐冲畾瑕佷笉瑕佸垱寤?DebugMan锛堟槸涓嶆槸鐪?console.flag锛?import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const e = entries.find((x) => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && m[0].toLowerCase().endsWith("initgame.lua");
});
if (!e) { console.log("鎵句笉鍒?initgame.lua"); process.exit(1); }
const p = parseLua(e.data);
console.log(`proto=${p.protos.length}`);
p.protos.forEach((pr, i) => {
  const s = (pr.strings ?? []).filter(Boolean).map(String);
  if (!s.some((x) => /DebugMan|console\.flag|IsDisableConsole/.test(x))) return;
  console.log(`\n===== proto #${i} @line ${pr.linedefined} (${pr.code.length}) =====`);
  console.log("  " + JSON.stringify(s.slice(0, 30)));
  if (pr.code.length <= 250) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
  else console.log("  [澶ぇ]");
});
process.exit(0);

const lines = disassemble(p.protos[0]);
const idx = lines.findIndex((l) => /DebugMan/.test(l.desc));
console.log("涓?chunk 閲?DebugMan 鍑虹幇鍦?pc=" + (idx >= 0 ? lines[idx].pc : "?"));
if (idx >= 0) {
  const from = Math.max(0, idx - 25), to = Math.min(lines.length - 1, idx + 12);
  for (let i = from; i <= to; i++) console.log(`${i === idx ? ">>" : "  "} ${String(lines[i].pc).padStart(4)}  ${lines[i].op.padEnd(10)} ${lines[i].desc}`);
}
console.log("\n=== 涓?chunk 閲屽惈 console.flag / IsDisable / IsFileExist / Init 鐨勭墖娈?===");
lines.forEach((l, i) => {
  if (!/console\.flag|IsDisable|IsFileExist|"Init"|DebugMan|AddDebugPath/.test(l.desc)) return;
  console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`);
});
