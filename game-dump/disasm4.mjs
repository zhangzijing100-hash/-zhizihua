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

// 从指令字节正确计算 b/bl 目标
function branchTarget(off, addr, bytes) {
  const w = (bytes[0] | (bytes[1] << 8) | (bytes[2] << 16) | (bytes[3] << 24)) >>> 0;
  const op = (w & 0xfc000000) >>> 0;
  if (op === 0x94000000 || op === 0x14000000) {
    let imm = w & 0x03ffffff;
    if (imm & 0x02000000) imm -= 0x04000000;
    return addr + imm * 4;
  }
  return null;
}

function dis(va, len, label) {
  const off = vaToOff(va);
  console.log(`\n########## ${label ?? ""} 0x${va.toString(16)} ##########`);
  if (off === null) { console.log("  (unmapped)"); return; }
  for (const i of cs.disasm(buf.subarray(off, off + len), 0)) {
    const ra = va + i.address;
    const ioff = vaToOff(ra);
    const bytes = ioff === null ? [0, 0, 0, 0] : [buf[ioff], buf[ioff + 1], buf[ioff + 2], buf[ioff + 3]];
    const t = branchTarget(ioff, ra, bytes);
    const extra = t !== null ? `   -> 0x${t.toString(16)}` : "";
    console.log(`  0x${ra.toString(16)}  ${(i.mnemonic + " " + i.opStr).padEnd(40)}${extra}`);
  }
}

const args = process.argv.slice(2);
for (let k = 0; k + 1 < args.length; k += 2) {
  dis(parseInt(args[k], 16), parseInt(args[k + 1], 16), "");
}
