import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const buf = fs.readFileSync("emu/data.png");
const { entries } = unpackPng("emu/data.png");
const idx = entries.findIndex(e => e.data.length === 280 && e.data.toString("latin1").toLowerCase().includes("cfortunewheelitemcfg.bny"));
const rec = entries[idx].data;
const dataOff = rec.readUInt32LE(0x104);
const f1 = rec.readUInt32LE(0x10c), f2 = rec.readUInt32LE(0x110), f3 = rec.readUInt32LE(0x114);
console.log(`记录 #${idx}: dataOff=${dataOff}  f10c=${f1}  f110=${f2}  f114=${f3}`);
// 下一条对比
function at(i){ const r = entries[i].data; return { name: r.toString("latin1").split("\u0000")[0], off: r.readUInt32LE(0x104), a: r.readUInt32LE(0x10c), b: r.readUInt32LE(0x110) }; }
for (let k = idx; k < idx + 4; k++) { const x = at(k); console.log(`  #${k}  off=${x.off} a=${x.a} b=${x.b}  ${x.name}`); }
// 试取数据
for (const [off, size, tag] of [[dataOff, f1, "f10c"], [dataOff, f2, "f110"]]) {
  if (off <= 0 || off >= buf.length) { console.log(`  ${tag}: 偏移越界`); continue; }
  const blob = buf.subarray(off, off + Math.min(size, 80));
  console.log(`  取 ${tag}: @${off} 长 ${size}  头: ${blob.toString("hex").replace(/(..)/g,"$1 ")}`);
  console.log(`    可见: ${JSON.stringify(blob.toString("latin1").replace(/[^\x20-\x7e]/g,"."))}`);
}
