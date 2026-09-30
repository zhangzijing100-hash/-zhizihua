// 线性解释 proto#0 里建表的那段伪代码，把 U[7]（手势模式表）还原出来
import { unpackPng } from "./unpackpng.mjs";
import { parseLua } from "./luadis.mjs";

const { entries } = unpackPng("emu/lua.png");
const e = entries.find((x) => x.data[0] === 0x1b && /debugman\.lua$/i.test(x.data.subarray(0, 300).toString("latin1").match(/@?[\w\\/.-]+\.lua/)?.[0] ?? ""));
const parsed = parseLua(e.data);
const P = parsed.protos[0]; // 主 chunk

const R = new Map();
const K = (i) => P.k[i]?.value;
const val = (x) => (x & 0x100 ? K(x & 0xff) : R.get(x));

// 只看建表那一段：到第一个 CLOSURE 为止
const end = P.code.findIndex((ins, i) => (ins & 0x3f) === 36 /* CLOSURE */);
console.log(`主 chunk ${P.code.length} 条指令，建表段 0..${end}\n`);

const stack = []; // SETLIST 参数暂存
for (let pc = 0; pc < end; pc++) {
  const ins = P.code[pc] >>> 0;
  const op = ins & 0x3f, A = (ins >>> 6) & 0xff, C = (ins >>> 14) & 0x1ff, B = (ins >>> 23) & 0x1ff;
  const Bx = (ins >>> 14) & 0x3ffff;
  if (op === 10) R.set(A, { __t: "table", arr: [] });                    // NEWTABLE
  else if (op === 1) R.set(A, K(Bx));                                    // LOADK
  else if (op === 3) for (let j = 0; j <= B; j++) R.set(A + j, null);    // LOADNIL
  else if (op === 34) {                                                  // SETLIST
    const t = R.get(A);
    const n = B === 0 ? 50 : B;
    if (!t || t.__t !== "table") continue;
    for (let j = 1; j <= n; j++) {
      const v = R.get(A + j);
      if (v === undefined) break;
      t.arr.push(v && v.__t === "table" ? v.arr : v);
    }
  } else if (op === 0 || op === 12 || op === 2) { /* MOVE/ADD/LOADBOOL 忽略 */ }
}

const r11 = R.get(11);
console.log("R11 =", JSON.stringify(r11, null, 0));
console.log("\nR11.arr.length =", r11?.arr?.length);
if (r11?.arr) r11.arr.forEach((p, i) => console.log(`  模式 ${i + 1}: 段数=${p.length}  ${JSON.stringify(p)}`));
