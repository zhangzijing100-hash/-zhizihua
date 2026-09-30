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
const offToVa = (off) => { for (const l of loads) if (off >= l.off && off < l.off + l.filesz) return l.vaddr + (off - l.off); return null; };
const vaToOff = (va) => { for (const l of loads) if (va >= l.vaddr && va < l.vaddr + l.filesz) return l.off + (va - l.vaddr); return null; };

const shoff = Number(buf.readBigUInt64LE(0x28));
const shentsize = buf.readUInt16LE(0x3a);
const shnum = buf.readUInt16LE(0x3c);
const shstrndx = buf.readUInt16LE(0x3e);
const sh = [];
for (let i = 0; i < shnum; i++) {
  const o = shoff + i * shentsize;
  sh.push({ nameOff: buf.readUInt32LE(o), addr: Number(buf.readBigUInt64LE(o + 0x10)), off: Number(buf.readBigUInt64LE(o + 0x18)), size: Number(buf.readBigUInt64LE(o + 0x20)), entsize: Number(buf.readBigUInt64LE(o + 0x38)) });
}
const shstrOff = sh.find((s, i) => i === shstrndx).off;
const sname = (s) => { let e = shstrOff + s.nameOff, r = ""; while (buf[e]) r += String.fromCharCode(buf[e++]); return r; };
const sec = (n) => sh.find((s) => sname(s) === n);

// 目标字符串地址
const targets = ["BnyDataTable", "GetInt32Value", "UnmarshalInt32", "GetClassFixedRecord", "CreateSubMap", "UnmarshalInt32Key", "BnyDataRecord"];
const strVa = new Map();
for (const t of targets) {
  const tb = Buffer.from(t);
  let p = 0;
  while ((p = buf.indexOf(tb, p)) !== -1) { strVa.set(offToVa(p), t); p += 1; }
}
console.log(`字符串地址 ${strVa.size} 个`);

// 扫描 .rela.dyn
const rd = sec(".rela.dyn");
console.log(`.rela.dyn off=${rd.off} size=${rd.size} entries=${rd.size / 24}`);
const relocs = new Map(); // addend -> [{slot}]
const n = rd.size / 24;
for (let i = 0; i < n; i++) {
  const o = rd.off + i * 24;
  const rOffset = Number(buf.readBigUInt64LE(o));
  const addend = buf.readBigInt64LE(o + 16);
  if (addend >= 0 && strVa.has(Number(addend))) {
    if (!relocs.has(Number(addend))) relocs.set(Number(addend), []);
    relocs.get(Number(addend)).push(rOffset);
  }
}
console.log(`命中字符串的重定位 ${relocs.size} 个\n`);
for (const [va, slots] of relocs) {
  console.log(`"${strVa.get(va)}" va=0x${va.toString(16)}  ← ${slots.length} 处引用`);
  for (const s of slots.slice(0, 6)) {
    const off = vaToOff(s);
    console.log(`   槽 va=0x${s.toString(16)}  fileOff=${off}`);
    if (off !== null && off - 16 >= 0) {
      console.log(`      前 32 字节: ${buf.subarray(off - 16, off + 40).toString("hex").replace(/(..)/g, "$1 ")}`);
      // 打印前后的 u64 值（可能是函数指针）
      for (let k = -16; k <= 32; k += 8) {
        const v = Number(buf.readBigUInt64LE(off + k));
        if (v > 0x1000) console.log(`        [${k >= 0 ? "+" : ""}${k}] = 0x${v.toString(16)}`);
      }
    }
  }
}
