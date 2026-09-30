import fs from "node:fs";
import path from "node:path";

const buf = fs.readFileSync(path.join(process.cwd(), "libUE4-arm64.so"));
const DYNSYM_OFF = 816, ENT = 24, N = 10545192 / ENT, DYNSTR_OFF = 14666496, SIZE = 39040588;
const strAt = (o) => { let e = o, r = ""; while (buf[e]) r += String.fromCharCode(buf[e++]); return r; };

const syms = [];
for (let i = 0; i < N; i++) {
  const o = DYNSYM_OFF + i * ENT;
  const no = buf.readUInt32LE(o);
  if (!no || no >= SIZE) continue;
  const value = Number(buf.readBigUInt64LE(o + 8));
  const size = Number(buf.readBigUInt64LE(o + 16));
  if (value === 0) continue;
  syms.push({ value, size, name: strAt(DYNSTR_OFF + no) });
}
syms.sort((a, b) => a.value - b.value);
console.log(`有效符号 ${syms.length} 个`);

const addrs = process.argv.slice(2).map((s) => parseInt(s, 16));
if (!addrs.length) {
  // 默认查 Bny 绑定函数
  const table = [
    [0x6449a4c, "GetBooleanValue"], [0x6449b90, "GetInt8Value"], [0x6449cd4, "GetInt16Value"],
    [0x6449e18, "GetInt32Value"], [0x6449f5c, "GetInt64Value"], [0x6449ff4, "GetFloatValue"],
    [0x644a13c, "GetDoubleValue"], [0x644a280, "GetStringValue"], [0x644a374, "CreateInt8KeySubMap"],
    [0x644a59c, "CreateInt32KeySubMap"], [0x644ab00, "GetClassTable"], [0x644ac80, "GetSize"],
    [0x644b0c0, "GetInt32KeyId"], [0x644bd94, "GetInt32NextKeyId"], [0x644ca88, "GetInt32Key"],
    [0x644d10c, "GetInt32Size"],
  ];
  console.log("\n=== Bny 绑定函数 → 最近符号 ===");
  for (const [a, label] of table) {
    let lo = 0, hi = syms.length - 1, best = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (syms[m].value <= a) { best = syms[m]; lo = m + 1; } else hi = m - 1; }
    const exact = best && best.value === a;
    const delta = best ? a - best.value : 0;
    console.log(`  0x${a.toString(16)} ${label.padEnd(22)} ← ${best ? best.name.slice(0, 110) : "?"}${exact ? "  [精确]" : `  (+0x${delta.toString(16)}, size=${best?.size})`}`);
  }
} else {
  for (const a of addrs) {
    let lo = 0, hi = syms.length - 1, best = null;
    while (lo <= hi) { const m = (lo + hi) >> 1; if (syms[m].value <= a) { best = syms[m]; lo = m + 1; } else hi = m - 1; }
    console.log(`0x${a.toString(16)} ← ${best?.name ?? "?"}  (+0x${(a - (best?.value ?? 0)).toString(16)})`);
  }
}
