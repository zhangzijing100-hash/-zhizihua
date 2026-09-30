// 拆 input.lua：proxy 怎么创建、怎么分发、Situation 是什么
import { unpackPng } from "./unpackpng.mjs";
import { parseLua, disassemble } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const e = entries.find((x) => {
  if (x.data[0] !== 0x1b) return false;
  const m = x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/);
  return m && /core[\\/]input[\\/]input\.lua$/i.test(m[0]);
});
if (!e) { console.log("找不到 core/input/input.lua"); process.exit(1); }
const p = parseLua(e.data);
console.log(`core/input/input.lua  proto=${p.protos.length}`);

const needles = ["GetInputSituationProxy", "InputSituationProxy", "InitInputSituations", "SetSituation", "Situation", "curSituationId", "EnableTouch", "CheckInputTouch", "OnPreTouchDown"];
const maxIns = parseInt(process.env.MAXINS ?? "120", 0);

// 也可以直接按 proto 序号看：node t-input2.mjs 38,39,40
const only = process.argv[2] ? process.argv[2].split(",").map(Number) : null;

// GREP=正则 时，把指定 proto（默认 #0）里匹配的指令打出来
if (process.env.GREP) {
  const re = new RegExp(process.env.GREP);
  const idx = only ? only : [0];
  for (const i of idx) {
    const pr = p.protos[i];
    if (!pr) continue;
    console.log(`\n===== proto #${i} @line ${pr.linedefined} (${pr.code.length}) 匹配 /${process.env.GREP}/ =====`);
    disassemble(pr).forEach((l) => { if (re.test(l.desc)) console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`); });
  }
  process.exit(0);
}

// RANGE=480,575 时打印指定 proto 的指令区间
if (process.env.RANGE) {
  const [a, b] = process.env.RANGE.split(",").map(Number);
  const idx = only ? only : [0];
  for (const i of idx) {
    const pr = p.protos[i];
    if (!pr) continue;
    console.log(`\n===== proto #${i} @line ${pr.linedefined}  pc ${a}..${b} =====`);
    disassemble(pr).forEach((l) => { if (l.pc >= a && l.pc <= b) console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`); });
  }
  process.exit(0);
}

p.protos.forEach((pr, i) => {
  if (only && !only.includes(i)) return;
  const s = (pr.strings ?? []).filter(Boolean).map(String);
  const hit = needles.filter((n) => s.some((x) => x.includes(n)));
  if (!only && !hit.length) return;
  const big = pr.code.length > maxIns;
  console.log(`\n===== proto #${i} @line ${pr.linedefined} (${pr.code.length}) 命中 ${hit.join("/")} =====`);
  console.log("  " + JSON.stringify(s.slice(0, 45)));
  if (!big) disassemble(pr).forEach((l) => console.log(`  ${String(l.pc).padStart(4)}  ${l.op.padEnd(10)} ${l.desc}`));
  else console.log("  [太大，跳过]");
});
