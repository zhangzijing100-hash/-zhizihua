// 看 Core.Event.Event 的 Add / Invoke，确认 tag 是否作为第一个参数传给回调
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
function find(re) {
  return entries.find((x) => {
    if (x.data[0] !== 0x1b) return false;
    const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
    return m && re.test(m[0]);
  });
}

const e = find(/core[\\/]event[\\/]event\.lua$/i) ?? find(/[\\/]event\.lua$/i);
if (!e) { console.log("找不到 event.lua"); process.exit(1); }
const m = e.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
console.log("文件: " + m[0]);
const p = parseLua(e.data);
console.log("proto=" + p.protos.length);

const maxIns = parseInt(process.env.MAXINS ?? "120", 0);
if (process.env.LIST) {
  p.protos.forEach((pr, i) => {
    const s = (pr.strings ?? []).filter(Boolean).map(String);
    console.log(`#${i} @${pr.linedefined} (${pr.code.length})  ${JSON.stringify(s.slice(0, 14))}`);
  });
  process.exit(0);
}

p.protos.forEach((pr, i) => {
  const s = (pr.strings ?? []).filter(Boolean).map(String);
  if (!s.some((x) => /^(Add|Invoke|AddAuto|Remove|Clear)$/.test(x))) return;
  console.log(`\n===== proto #${i} @line ${pr.linedefined} (${pr.code.length}) =====`);
  console.log("  " + JSON.stringify(s.slice(0, 30)));
  if (pr.code.length <= maxIns) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
  else console.log("  [太大，跳过]");
});
