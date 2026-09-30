import fs from "node:fs";
import path from "node:path";

const f = path.join(process.cwd(), "libUE4-arm64.so");
const buf = fs.readFileSync(f);
console.log(`${path.basename(f)}  ${buf.length} bytes`);

// ELF header
console.log("ELF magic:", buf.subarray(0, 4).toString("hex"), "class:", buf[4], "endian:", buf[5], "type:", buf.readUInt16LE(16), "machine:", buf.readUInt16LE(18));
const shoff = Number(buf.readBigUInt64LE(0x28));
const shentsize = buf.readUInt16LE(0x3a);
const shnum = buf.readUInt16LE(0x3c);
const shstrndx = buf.readUInt16LE(0x3e);
console.log(`section headers: off=${shoff} count=${shnum} entsize=${shentsize} shstrndx=${shstrndx}`);

const sh = [];
for (let i = 0; i < shnum; i++) {
  const o = shoff + i * shentsize;
  sh.push({ name: buf.readUInt32LE(o), type: buf.readUInt32LE(o + 4), off: Number(buf.readBigUInt64LE(o + 0x18)), size: Number(buf.readBigUInt64LE(o + 0x20)), link: buf.readUInt32LE(o + 0x28), entsize: Number(buf.readBigUInt64LE(o + 0x38)) });
}
const shstr = sh[shstrndx];
const strAt = (base, off) => { let e = base + off; let s = ""; while (buf[e] !== 0) s += String.fromCharCode(buf[e++]); return s; };
console.log("\n=== sections ===");
for (const s of sh) {
  const n = strAt(shstr.off, s.name);
  if (s.size > 0 || n) console.log(`  ${n.padEnd(22)} type=${s.type} off=${String(s.off).padStart(10)} size=${String(s.size).padStart(10)} entsize=${s.entsize}`);
}

console.log("\n=== 关键字字符串搜索 ===");
for (const kw of ["BnyDataTable", "GetInt32Value", "UnmarshalInt32", "BnyDataRecord", "PIPECACHE", "GetClassFixedRecord", "CreateSubMap", "UnmarshalInt32Key", "Bny"]) {
  const b = Buffer.from(kw);
  let c = 0, first = -1, p = 0;
  while ((p = buf.indexOf(b, p)) !== -1) { c++; if (first < 0) first = p; p += 1; }
  console.log(`  ${kw.padEnd(22)} ${c} 次${first >= 0 ? `, 首次 @${first}` : ""}`);
}
