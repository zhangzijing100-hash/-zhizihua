import fs from "node:fs";
import path from "node:path";

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

const rd = sh.find((s) => nm(s) === ".rela.dyn");

// 目标：所有含 "Bny" 或 "recordOffsetMap" 的字符串地址
const targets = new Map();
const want = ["BnyDataTable_readData", "loadRecordOffsetMapFromCache", "loadRecordBlockProfileMapFromCache", "SetRecordDataEmptyTable", "__PPBIO_UnmarshalTag", "iBny"];
for (const w of want) {
  const b = Buffer.from(w);
  let p = 0;
  while ((p = buf.indexOf(b, p)) !== -1) { const va = offToVa(p); if (va) targets.set(va, w); p += 1; }
}
console.log(`目标字符串 ${targets.size} 个`);

const refs = new Map();
const cnt = rd.size / 24;
for (let i = 0; i < cnt; i++) {
  const o = rd.off + i * 24;
  const slot = Number(buf.readBigUInt64LE(o));
  const addend = Number(buf.readBigInt64LE(o + 16));
  if (targets.has(addend)) {
    if (!refs.has(addend)) refs.set(addend, []);
    refs.get(addend).push(slot);
  }
}
for (const [va, list] of refs) {
  console.log(`\n"${targets.get(va)}"  va=0x${va.toString(16)}  ← ${list.length} 处`);
  for (const s of list.slice(0, 6)) console.log(`    槽 va=0x${s.toString(16)}`);
}
if (!refs.size) console.log("(无重定位引用；字符串可能被代码内联 adrp/add 引用)");
