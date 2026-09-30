// 看 GetFortuneWheelDepositeItemNum 到底返回什么
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
function find(suffix) {
  return entries.find((x) => {
    if (x.data[0] !== 0x1b) return false;
    const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
    return m && m[0].toLowerCase().endsWith(suffix);
  });
}

for (const [file, needles, maxIns] of [
  ["wheeloffortunemgr.lua", ["_general_consume_item_num_map", "GetFortuneWheelDepositeItemNum", "SetGeneralConsumeItemMap"], 60],
  ["wheeloffortuneutility.lua", ["GetFortuneWheelDepositeItemNum"], 100],
]) {
  const e = find(file);
  if (!e) { console.log("找不到 " + file); continue; }
  const p = parseLua(e.data);
  console.log(`\n########## ${file} proto=${p.protos.length} ##########`);
  p.protos.forEach((pr, i) => {
    const s = (pr.strings ?? []).filter(Boolean).map(String);
    const hit = needles.filter((n) => s.some((x) => x.includes(n)));
    if (!hit.length) return;
    console.log(`\n--- proto #${i} @line ${pr.linedefined} (${pr.code.length}) 命中 ${hit.join("/")} ---`);
    console.log("  " + JSON.stringify(s.slice(0, 20)));
    if (pr.code.length <= maxIns) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
    else console.log("  [太大，跳过]");
  });
}
