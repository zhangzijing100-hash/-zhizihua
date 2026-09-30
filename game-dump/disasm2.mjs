import fs from "node:fs";
import { loadCapstone, Capstone, Const } from "capstone-wasm";

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
const cs = new Capstone(Const.CS_ARCH_ARM64, Const.CS_MODE_ARM);

function show(va, len, label) {
  const off = vaToOff(va);
  console.log(`\n########## ${label} @0x${va.toString(16)} ##########`);
  if (off === null) { console.log("  (unmapped)"); return; }
  const insns = cs.disasm(buf.subarray(off, off + len), va);
  for (const i of insns) {
    let tgt = "";
    const mn = i.mnemonic;
    if ((mn === "bl" || mn === "b" || mn === "b.eq" || mn === "b.ne" || mn.startsWith("b.")) && i.opStr.startsWith("#")) {
      const rel = Number(i.opStr.slice(1));
      tgt = `   -> 0x${(i.address + rel).toString(16)}`;
    }
    console.log(`  0x${i.address.toString(16)}  ${(i.mnemonic + " " + i.opStr).padEnd(46)}${tgt}`);
  }
}

show(0x644d6c00, 0x300, "Unmarshal 读取器区域");
