import fs from "node:fs";
import path from "node:path";

const f = path.join(process.cwd(), "libUE4-arm64.so");
const buf = fs.readFileSync(f);

// ---- program headers ----
const phoff = Number(buf.readBigUInt64LE(0x20));
const phentsize = buf.readUInt16LE(0x36);
const phnum = buf.readUInt16LE(0x38);
const loads = [];
for (let i = 0; i < phnum; i++) {
  const o = phoff + i * phentsize;
  const type = buf.readUInt32LE(o);
  if (type !== 1) continue; // PT_LOAD
  const flags = buf.readUInt32LE(o + 4);
  const off = Number(buf.readBigUInt64LE(o + 8));
  const vaddr = Number(buf.readBigUInt64LE(o + 16));
  const filesz = Number(buf.readBigUInt64LE(o + 32));
  const memsz = Number(buf.readBigUInt64LE(o + 40));
  loads.push({ off, vaddr, filesz, memsz, flags });
}
console.log("=== PT_LOAD 段 ===");
for (const l of loads) console.log(`  off=0x${l.off.toString(16)} vaddr=0x${l.vaddr.toString(16)} filesz=0x${l.filesz.toString(16)} flags=${l.flags}`);

const offToVa = (off) => { for (const l of loads) if (off >= l.off && off < l.off + l.filesz) return l.vaddr + (off - l.off); return null; };
const vaToOff = (va) => { for (const l of loads) if (va >= l.vaddr && va < l.vaddr + l.filesz) return l.off + (va - l.vaddr); return null; };

// ---- section headers ----
const shoff = Number(buf.readBigUInt64LE(0x28));
const shentsize = buf.readUInt16LE(0x3a);
const shnum = buf.readUInt16LE(0x3c);
const shstrndx = buf.readUInt16LE(0x3e);
const sh = [];
for (let i = 0; i < shnum; i++) {
  const o = shoff + i * shentsize;
  sh.push({ nameOff: buf.readUInt32LE(o), type: buf.readUInt32LE(o + 4), addr: Number(buf.readBigUInt64LE(o + 0x10)), off: Number(buf.readBigUInt64LE(o + 0x18)), size: Number(buf.readBigUInt64LE(o + 0x20)) });
}
const shstrOff = sh[shstrndx].off;
const sname = (s) => { let e = shstrOff + s.nameOff, r = ""; while (buf[e]) r += String.fromCharCode(buf[e++]); return r; };
const sec = (n) => sh.find((s) => sname(s) === n);

const targets = process.argv.slice(2).length ? process.argv.slice(2) : ["BnyDataTable", "GetInt32Value", "UnmarshalInt32", "BnyDataRecord"];
for (const t of targets) {
  console.log(`\n########## 字符串 "${t}" ##########`);
  const tb = Buffer.from(t);
  let p = 0, hits = [];
  while ((p = buf.indexOf(tb, p)) !== -1) { hits.push(p); p += 1; }
  for (const h of hits.slice(0, 6)) {
    const va = offToVa(h);
    console.log(`  file@0x${h.toString(16)}  va=0x${va?.toString(16)}`);
    // 在可写数据段里找指向该字符串的 8 字节指针
    const ptr = Buffer.alloc(8);
    ptr.writeBigUInt64LE(BigInt(va));
    for (const s of sh) {
      if (!s.size || s.off === 0) continue;
      const nm = sname(s);
      if (![".data.rel.ro", ".data", ".rodata"].includes(nm)) continue;
      let q = s.off, found = [];
      while ((q = buf.indexOf(ptr, q)) !== -1 && q < s.off + s.size) { found.push(q); q += 1; }
      if (found.length) {
        console.log(`     ← ${nm} 中有 ${found.length} 处指针引用`);
        for (const fo of found.slice(0, 4)) {
          const fva = offToVa(fo);
          console.log(`        ref file@0x${fo.toString(16)} va=0x${fva?.toString(16)}  周边: ${buf.subarray(fo - 8, fo + 32).toString("hex").replace(/(..)/g, "$1 ")}`);
        }
      }
    }
  }
}
