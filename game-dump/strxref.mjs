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
const text = sh.find((s) => nm(s) === ".text");

const wants = process.argv.slice(2).length ? process.argv.slice(2) : [
  "BnyDataTable_readData: -offset(%d) > m_dataSize(%u)!",
  "loadRecordOffsetMapFromCache: %s",
  "loadRecordBlockProfileMapFromCache: %s!",
];
const strVas = [];
for (const w of wants) {
  const b = Buffer.from(w);
  let p = 0;
  while ((p = buf.indexOf(b, p)) !== -1) { strVas.push({ va: offToVa(p), w }); p += 1; }
}
console.log("目标字符串地址:", strVas.map((s) => `0x${s.va.toString(16)} (${s.w.slice(0, 24)}…)`).join("\n  "));

// 扫描 .text 找 adrp 指向这些页
const pages = new Map();
for (const s of strVas) { const pg = s.va & ~0xfff; if (!pages.has(pg)) pages.set(pg, []); pages.get(pg).push(s); }

const found = [];
const t0 = Date.now();
for (let o = text.off; o + 8 <= text.off + text.size; o += 4) {
  const w = buf.readUInt32LE(o);
  if ((w & 0x9f000000) >>> 0 !== 0x90000000) continue;
  const pc = text.addr + (o - text.off);
  let imm = ((w >>> 5) & 0x7ffff) | ((w >>> 29) & 3) << 19;
  if (imm & (1 << 20)) imm -= 1 << 21;
  const tgt = (pc & ~0xfff) + (imm << 12);
  if (!pages.has(tgt)) continue;
  // 下一条应为 add
  const w2 = buf.readUInt32LE(o + 4);
  if ((w2 & 0xff800000) >>> 0 !== 0x91000000) continue;
  const rd = w & 0x1f, rn = (w2 >> 5) & 0x1f, rd2 = w2 & 0x1f;
  if (rd !== rn || rd !== rd2) continue;
  let imm12 = (w2 >> 10) & 0xfff;
  const sh2 = (w2 >> 22) & 3;
  if (sh2 === 1) imm12 <<= 12;
  const finalVa = tgt + imm12;
  const hit = pages.get(tgt).find((s) => s.va === finalVa);
  if (hit) found.push({ pc, va: finalVa, w: hit.w });
}
console.log(`\n扫描完成 (${Date.now() - t0}ms)，找到 ${found.length} 处引用`);
for (const f of found) console.log(`  代码 0x${f.pc.toString(16)}  ->  "${f.w.slice(0, 50)}"`);
fs.writeFileSync(path.join(process.cwd(), "strxref.json"), JSON.stringify(found, null, 1));
