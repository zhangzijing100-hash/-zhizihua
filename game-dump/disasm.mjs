import fs from "node:fs";
import { loadCapstone, Const } from "capstone-wasm";

const buf = fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/game-dump/libUE4-arm64.so");
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

await loadCapstone();
const cs = new (await import("capstone-wasm")).Capstone(Const.CS_ARCH_ARM64, Const.CS_MODE_ARM);

const targets = [
  [0x644d460, 0x28, "BeginUnmarshalRecord"],
  [0x644d488, 0x28, "EndUnmarshalRecord"],
  [0x644d5a0, 0x50, "UnmarshalInt32"],
  [0x644d5f0, 0x50, "UnmarshalInt64"],
  [0x644db2c, 0x154, "GetInt32Value"],
  [0x644e6d8, 0x98, "CreateSubMap"],
  [0x644e770, 0x68, "GetClassTable"],
];

for (const [va, len, label] of targets) {
  const off = vaToOff(va);
  console.log(`\n########## ${label}  @0x${va.toString(16)} ##########`);
  if (off === null) { console.log("  (no mapping)"); continue; }
  const code = buf.subarray(off, off + len);
  try {
    const insns = cs.disasm(code, va);
    for (const i of insns) console.log(`  0x${i.address.toString(16)}  ${(i.mnemonic + " " + i.opStr).padEnd(56)} // ${i.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ")}`);
  } catch (e) { console.log("  disasm error:", e.message); }
}
