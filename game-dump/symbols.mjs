import fs from "node:fs";
import path from "node:path";

const f = path.join(process.cwd(), "libUE4-arm64.so");
const buf = fs.readFileSync(f);

const DYNSYM_OFF = 816, DYNSYM_SIZE = 10545192, DYNSYM_ENT = 24;
const DYNSTR_OFF = 14666496, DYNSTR_SIZE = 39040588;

function strAt(off) {
  let e = off, s = "";
  while (buf[e] !== 0) s += String.fromCharCode(buf[e++]);
  return s;
}

const n = DYNSYM_SIZE / DYNSYM_ENT;
console.log(`符号总数 ${n}`);

const kws = process.argv.slice(2);
const matches = [];
for (let i = 0; i < n; i++) {
  const o = DYNSYM_OFF + i * DYNSYM_ENT;
  const nameOff = buf.readUInt32LE(o);
  if (nameOff === 0 || nameOff >= DYNSTR_SIZE) continue;
  const nm = strAt(DYNSTR_OFF + nameOff);
  for (const k of kws) {
    if (nm.includes(k)) { matches.push({ nm, value: Number(buf.readBigUInt64LE(o + 8)), size: Number(buf.readBigUInt64LE(o + 16)), info: buf[o + 4], shndx: buf.readUInt16LE(o + 6) }); break; }
  }
}
console.log(`命中 ${matches.length} 个符号\n`);
const byPrefix = {};
for (const m of matches) {
  const key = m.nm.split("(")[0].slice(0, 90);
  byPrefix[key] = (byPrefix[key] || 0) + 1;
}
for (const m of matches.slice(0, 120)) {
  console.log(`  0x${m.value.toString(16).padStart(8, "0")}  size=${String(m.size).padStart(7)}  ${m.nm.slice(0, 150)}`);
}
fs.writeFileSync(path.join(process.cwd(), "bny-symbols.txt"), matches.map((m) => `0x${m.value.toString(16)}\t${m.size}\t${m.nm}`).join("\n"), "utf8");
console.log(`\n(全部写入 bny-symbols.txt)`);
