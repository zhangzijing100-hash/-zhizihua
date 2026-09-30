import fs from "node:fs";
import path from "node:path";
import { loadCapstone, Capstone, Const } from "capstone-wasm";

const buf = fs.readFileSync(path.join(process.cwd(), "libUE4-arm64.so"));
const shoff = Number(buf.readBigUInt64LE(0x28));
const se = buf.readUInt16LE(0x3a), sn = buf.readUInt16LE(0x3c), si = buf.readUInt16LE(0x3e);
const sh = [];
for (let i = 0; i < sn; i++) {
  const o = shoff + i * se;
  sh.push({ no: buf.readUInt32LE(o), addr: Number(buf.readBigUInt64LE(o + 0x10)), off: Number(buf.readBigUInt64LE(o + 0x18)), size: Number(buf.readBigUInt64LE(o + 0x20)) });
}
const so = sh[si].off;
const nm = (s) => { let e = so + s.no, r = ""; while (buf[e]) r += String.fromCharCode(buf[e++]); return r; };
const secs = sh.filter((s) => s.size > 0);
const offToVa = (off) => { const h = secs.find((s) => off >= s.off && off < s.off + s.size); return h ? h.addr + (off - h.off) : null; };
const vaToOff = (va) => { const h = secs.find((s) => va >= s.addr && va < s.addr + s.size); return h ? h.off + (va - h.addr) : null; };
const text = sh.find((s) => nm(s) === ".text");

const want = process.argv[2] ?? "BnyDataTable_readData";
const pat = Buffer.from(want);
const strVas = [];
let p = 0;
while ((p = buf.indexOf(pat, p)) !== -1) { strVas.push(offToVa(p)); p += 1; }
console.log(`"${want}" 出现 ${strVas.length} 次, va=` + strVas.map((v) => "0x" + v.toString(16)).join(", "));
const pageSet = new Set(strVas.map((v) => Math.floor(v / 4096)));

const hits = [];
for (let o = text.off; o + 4 <= text.off + text.size; o += 4) {
  const w = buf.readUInt32LE(o);
  if ((w & 0x9f000000) >>> 0 !== 0x90000000) continue;
  const pc = text.addr + (o - text.off);
  let imm = ((w >>> 5) & 0x7ffff) | (((w >>> 29) & 3) << 19);
  if (imm & (1 << 20)) imm -= 1 << 21;
  const tgt = (pc & ~0xfff) + (imm << 12);
  if (!pageSet.has(Math.floor(tgt / 4096))) continue;
  hits.push({ pc, tgt, fileOff: o });
}
console.log(`\n命中页的 ADRP: ${hits.length} 处`);
await loadCapstone();
const cs = new Capstone(Const.CS_ARCH_ARM64, Const.CS_MODE_ARM);
function dis(va, len) {
  const off = vaToOff(va);
  const out = [];
  for (const i of cs.disasm(buf.subarray(off, off + len), 0)) out.push(`0x${(va + i.address).toString(16)}  ${i.mnemonic} ${i.opStr}`);
  return out;
}
for (const h of hits.slice(0, 12)) {
  const off = vaToOff(h.pc);
  // 找紧随其后、指向目标字符串的 add
  let match = false;
  for (let k = 1; k <= 8; k++) {
    const w2 = buf.readUInt32LE(off + k * 4);
    if ((((w2 & 0xff800000) >>> 0) === 0x91000000 || ((w2 & 0xff800000) >>> 0) === 0x11000000)) {
      let imm12 = (w2 >> 10) & 0xfff;
      if (((w2 >> 22) & 3) === 1) imm12 <<= 12;
      if (h.tgt + imm12 === strVas[0]) match = true;
    }
  }
  console.log(`\n--- ADRP @0x${h.pc.toString(16)} (page 0x${h.tgt.toString(16)}) ${match ? "★ 指向目标字符串" : ""}`);
  for (const l of dis(h.pc - 16, 64)) console.log("    " + l);
}
