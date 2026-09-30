import fs from "node:fs";
import path from "node:path";

const f = path.join(process.cwd(), "libUE4-arm64.so");
const buf = fs.readFileSync(f);

const phoff = Number(buf.readBigUInt64LE(0x20));
const phentsize = buf.readUInt16LE(0x36);
const phnum = buf.readUInt16LE(0x38);
const loads = [];
for (let i = 0; i < phnum; i++) {
  const o = phoff + i * phentsize;
  if (buf.readUInt32LE(o) !== 1) continue;
  loads.push({ off: Number(buf.readBigUInt64LE(o + 8)), vaddr: Number(buf.readBigUInt64LE(o + 16)), filesz: Number(buf.readBigUInt64LE(o + 32)) });
}
const vaToOff = (va) => { for (const l of loads) if (va >= l.vaddr && va < l.vaddr + l.filesz) return l.off + (va - l.vaddr); return null; };
const offToVa = (off) => { for (const l of loads) if (off >= l.off && off < l.off + l.filesz) return l.vaddr + (off - l.off); return null; };

const shoff = Number(buf.readBigUInt64LE(0x28));
const shentsize = buf.readUInt16LE(0x3a);
const shnum = buf.readUInt16LE(0x3c);
const shstrndx = buf.readUInt16LE(0x3e);
const sh = [];
for (let i = 0; i < shnum; i++) {
  const o = shoff + i * shentsize;
  sh.push({ nameOff: buf.readUInt32LE(o), addr: Number(buf.readBigUInt64LE(o + 0x10)), off: Number(buf.readBigUInt64LE(o + 0x18)), size: Number(buf.readBigUInt64LE(o + 0x20)) });
}
const shstrOff = sh[shstrndx].off;
const sname = (s) => { let e = shstrOff + s.nameOff, r = ""; while (buf[e]) r += String.fromCharCode(buf[e++]); return r; };
const rd = sh.find((s) => sname(s) === ".rela.dyn");

// 建立 "重定位槽 va -> addend" 映射（只保留关心的区间）
const FROM = parseInt(process.argv[2] ?? "0xb8ba000", 16), TO = parseInt(process.argv[3] ?? "0xb8bb600", 16);
const relocAt = new Map();
const cnt = rd.size / 24;
for (let i = 0; i < cnt; i++) {
  const o = rd.off + i * 24;
  const target = Number(buf.readBigUInt64LE(o));
  if (target < FROM || target >= TO) continue;
  relocAt.set(target, buf.readBigInt64LE(o + 16));
}
console.log(`区间 0x${FROM.toString(16)}..0x${TO.toString(16)} 内重定位 ${relocAt.size} 个\n`);

const cstr = (va) => { const o = vaToOff(va); if (o === null) return `?0x${va.toString(16)}`; let e = o, r = ""; while (buf[e] && r.length < 80) r += String.fromCharCode(buf[e++]); return r; };

// 按 va 顺序列出，识别 {name,func} 结构
const sorted = [...relocAt.keys()].sort((a, b) => a - b);
console.log("=== 槽位表 (va, addend) ===");
for (const va of sorted) {
  const addend = Number(relocAt.get(va));
  let desc;
  const ao = vaToOff(addend);
  if (ao !== null && addend < 0x6000000) desc = `STR "${cstr(addend)}"`;
  else desc = `0x${addend.toString(16)}`;
  console.log(`  0x${va.toString(16)}  ->  ${desc}`);
}
