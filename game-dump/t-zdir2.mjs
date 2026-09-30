// zdirutility 里 GetDirConfigs / ParseDirConfig / IsDisableConsole 有没有把 console.flag 算进去
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const e = entries.find((x) => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && m[0].toLowerCase().endsWith("zdirutility.lua");
});
const p = parseLua(e.data);
console.log(`zdirutility proto=${p.protos.length}`);
const want = /GetDirConfigs|ParseDirConfig|DirConfig|console|IsFileExist|zdir_flag|ClearCachedData/;
p.protos.forEach((pr, i) => {
  const s = (pr.strings ?? []).filter(Boolean).map(String);
  if (!s.some((x) => want.test(x))) return;
  console.log(`\n--- #${i} @line ${pr.linedefined} (${pr.code.length}) ---`);
  console.log("  " + JSON.stringify(s.slice(0, 24)));
  if (pr.code.length <= 60) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
});
