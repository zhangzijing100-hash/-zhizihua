// Lua 5.1 字节码反汇编器（配合 luadump.mjs 使用）
import { parseLua51 } from "./luadump.mjs";

const OP = [
  "MOVE", "LOADK", "LOADBOOL", "LOADNIL", "GETUPVAL", "GETGLOBAL", "GETTABLE", "SETGLOBAL",
  "SETUPVAL", "SETTABLE", "NEWTABLE", "SELF", "ADD", "SUB", "MUL", "DIV", "MOD", "POW",
  "UNM", "NOT", "LEN", "CONCAT", "JMP", "EQ", "LT", "LE", "TEST", "TESTSET", "CALL",
  "TAILCALL", "RETURN", "FORLOOP", "FORPREP", "TFORLOOP", "SETLIST", "CLOSE", "CLOSURE", "VARARG",
];

function fmtConst(proto, idx) {
  const c = proto.k?.[idx];
  if (!c) return `K[${idx}]?`;
  if (c.t === 0) return "nil";
  if (c.t === 1) return String(c.value);
  if (c.t === 3) return String(c.value);
  if (c.t === 4) return JSON.stringify(c.value);
  return `K[${idx}]`;
}

function fmtK(proto, i) {
  if (i & 0x100) return fmtConst(proto, i & 0xff);
  return `R${i}`;
}

export function disassemble(proto) {
  const out = [];
  for (let pc = 0; pc < proto.code.length; pc++) {
    const ins = proto.code[pc] >>> 0;
    const op = ins & 0x3f;
    const A = (ins >>> 6) & 0xff;
    const C = (ins >>> 14) & 0x1ff;
    const B = (ins >>> 23) & 0x1ff;
    const Bx = (ins >>> 14) & 0x3ffff;
    const sBx = Bx - 131071;
    const name = OP[op] ?? `OP${op}`;
    let desc;
    if (name === "LOADK") desc = `R${A} = ${fmtConst(proto, Bx)}`;
    else if (name === "GETGLOBAL") desc = `R${A} = _G[${fmtConst(proto, Bx)}]`;
    else if (name === "SETGLOBAL") desc = `_G[${fmtConst(proto, Bx)}] = R${A}`;
    else if (name === "GETUPVAL") desc = `R${A} = U[${B}]`;
    else if (name === "SETUPVAL") desc = `U[${B}] = R${A}`;
    else if (name === "LOADBOOL") desc = `R${A} = ${B ? "true" : "false"}${C ? "  (pc++)" : ""}`;
    else if (name === "LOADNIL") desc = `R${A}..R${A + B} = nil`;
    else if (name === "JMP") desc = `-> ${pc + 1 + sBx}`;
    else if (name === "CLOSURE") desc = `R${A} = closure(P${Bx})`;
    else if (name === "CALL") desc = `R${A} = call(R${A}, ${B - 1} args, ${C - 1} ret)`;
    else if (name === "TAILCALL") desc = `return call(R${A}, ${B - 1} args)`;
    else if (name === "RETURN") desc = `return R${A}..R${A + B - 2}`;
    else if (name === "EQ") desc = `if (${fmtK(proto, B)} == ${fmtK(proto, C)}) ~= ${A} then pc++`;
    else if (name === "LT") desc = `if (${fmtK(proto, B)} < ${fmtK(proto, C)}) ~= ${A} then pc++`;
    else if (name === "LE") desc = `if (${fmtK(proto, B)} <= ${fmtK(proto, C)}) ~= ${A} then pc++`;
    else if (name === "TEST") desc = C ? `if R${A} is falsy then pc++ (否则跳下一跳)` : `if R${A} is truthy then pc++ (否则跳下一跳)`;
    else if (name === "TESTSET") desc = `if R${B} == ${C ? 1 : 0} then R${A} = R${B} else pc++`;
    else if (name === "GETTABLE") desc = `R${A} = ${fmtK(proto, B)}[${fmtK(proto, C)}]`;
    else if (name === "SETTABLE") desc = `${fmtK(proto, B)}[${fmtK(proto, C)}] = R${A}`;
    else if (name === "SELF") desc = `R${A + 1} = R${B}; R${A} = ${fmtK(proto, B)}[${fmtK(proto, C)}]`;
    else if (name === "NOT") desc = `R${A} = not R${B}`;
    else if (name === "NEWTABLE") desc = `R${A} = {} (arr=${B} hash=${C})`;
    else if (name === "SETLIST") desc = `R${A}[list] = R${A + 1}.. (n=${B}, blk=${C})`;
    else if (name === "FORPREP") desc = `R${A} -= R${A + 2}; -> ${pc + 1 + sBx}`;
    else if (name === "FORLOOP") desc = `R${A} += R${A + 2}; if loop -> ${pc + 1 + sBx}`;
    else if (name === "TFORLOOP") desc = `R${A} = R${A}(R${A + 1}, R${A + 2})`;
    else if (name === "VARARG") desc = `R${A}.. = ... (n=${B - 1})`;
    else if (name === "CLOSE") desc = `close upvals >= R${A}`;
    else if (name === "CONCAT") desc = `R${A} = R${B} .. ... .. R${C}`;
    else desc = `R${A} ${fmtK(proto, B)} ${fmtK(proto, C)}`;
    out.push({ pc, op: name, A, B, C, Bx, sBx, desc, raw: ins });
  }
  return out;
}

export function parseLua(buf) {
  return parseLua51(buf);
}

export { OP };
