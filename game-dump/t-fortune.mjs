import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const names = (process.argv[2] ?? "debugcmd.lua").split(",");
const needles = (process.argv[3] ?? "Fortune,fortune").split(",");
const maxIns = parseInt(process.env.MAXINS ?? "150", 0);

for (const name of names) {
  const e = entries.find((x) => {
    if (x.data[0] !== 0x1b) return false;
    const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
    return m && m[0].toLowerCase().endsWith(name.toLowerCase());
  });
  if (!e) { console.log("找不到 " + name); continue; }
  const m = e.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  const parsed = parseLua(e.data);
  console.log(`\n############ ${m[0]}  proto=${parsed.protos.length} ############`);
  parsed.protos.forEach((p, i) => {
    const strs = (p.strings ?? []).filter(Boolean);
    const hit = needles.filter((n) => strs.some((s) => String(s).includes(n)));
    if (!hit.length) return;
    console.log(`\n--- proto #${i} @line ${p.linedefined} (${p.code.length}) 命中 ${hit.join("/")} ---`);
    console.log("  " + JSON.stringify(strs).slice(0, 900));
    if (p.code.length <= maxIns) disassemble(p).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
  });
}
