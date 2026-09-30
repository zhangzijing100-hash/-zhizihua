import fs from "node:fs";
import { loadCapstone, Capstone, Const } from "capstone-wasm";

const buf = fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/game-dump/libUE4-arm64.so");
const shoff = Number(buf.readBigUInt64LE(0x28));
const se = buf.readUInt16LE(0x3a), sn = buf.readUInt16LE(0x3c), si = buf.readUInt16LE(0x3e);
const sh = [];
for (let i = 0; i < sn; i++) {
  const o = shoff + i * se;
  sh.push({ no: buf.readUInt32LE(o), addr: Number(buf.readBigUInt64LE(o + 0x10)), off: Number(buf.readBigUInt64LE(o + 0x18)), size: Number(buf.readBigUInt64LE(o + 0x20)) });
}
const so = sh[si].off;
const nm = (s) => { let e = so + s.no, r = ""; while (buf[e]) r += String.fromCharCode(buf[e++]); return r; };
const secs = sh.filter((s) => [".text", ".rodata", ".data.rel.ro", ".data"].includes(nm(s)));
const vaToOff = (va) => { const h = secs.find((s) => va >= s.addr && va < s.addr + s.size); return h ? h.off + (va - h.addr) : null; };

await loadCapstone();
const cs = new Capstone(Const.CS_ARCH_ARM64, Const.CS_MODE_ARM);

function dis(va, len) {
  const off = vaToOff(va);
  if (off === null) return [{ text: `(unmapped 0x${va.toString(16)})` }];
  const out = [];
  for (const i of cs.disasm(buf.subarray(off, off + len), 0)) {
    const ra = va + i.address;
    let extra = "";
    const m = /^#(-?0x[0-9a-f]+)$/.exec(i.opStr);
    if (m && (i.mnemonic === "bl" || i.mnemonic === "b" || i.mnemonic.startsWith("b.") || i.mnemonic === "cbz" || i.mnemonic === "cbnz" || i.mnemonic === "tbz" || i.mnemonic === "tbnz")) {
      const rel = Number(m[1]);
      extra = ` -> 0x${(va + rel).toString(16)}`;
    }
    out.push({ text: `0x${ra.toString(16)}  ${(i.mnemonic + " " + i.opStr).padEnd(44)}${extra}` });
  }
  return out;
}

const args = process.argv.slice(2);
if (args.length >= 1) {
  for (let k = 0; k < args.length; k += 2) {
    const va = parseInt(args[k], 16);
    const len = parseInt(args[k + 1] ?? "160", 16);
    console.log(`\n########## 0x${va.toString(16)} ##########`);
    for (const l of dis(va, len)) console.log("  " + l.text);
  }
} else {
  // UnmarshalInt32 内的 bl 目标
  const base = 0x644d5a0;
  console.log("=== UnmarshalInt32 stub ===");
  const ins = cs.disasm(buf.subarray(vaToOff(base), vaToOff(base) + 0x50), 0);
  let reader = null;
  for (const i of ins) {
    const m = /^#(-?0x[0-9a-f]+)$/.exec(i.opStr);
    if (i.mnemonic === "bl" && m) { const t = base + Number(m[1]); console.log(`  bl at +0x${i.address.toString(16)} -> 0x${t.toString(16)}`); if (!reader) reader = t; }
  }
  if (reader) { console.log(`\n########## 读取器 0x${reader.toString(16)} ##########`); for (const l of dis(reader, 0x140)) console.log("  " + l.text); }
}
