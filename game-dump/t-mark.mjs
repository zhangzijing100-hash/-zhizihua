import { readNameRecords, readFile } from "./bny.mjs";
const pack = "emu/data.png";
const r = readNameRecords(pack).find(x => x.name.toLowerCase().includes("cfortunewheelitemcfg.bny"));
const d = readFile(pack, r);
console.log(`文件 ${d.length} 字节`);
// 找所有 19 2e d6 的位置
const pos = [];
for (let i = 0; i + 4 <= d.length; i++) if (d[i] === 0x19 && d[i+1] === 0x2e && d[i+2] === 0xd6) pos.push(i);
console.log(`19 2e d6 出现 ${pos.length} 次，前 20 个位置: ${pos.slice(0,20).join(", ")}`);
console.log(`间距: ${pos.slice(1,20).map((p,i)=>p-pos[i]).join(", ")}`);
console.log("\n每条记录的第 4 字节（序号？）:", pos.slice(0,20).map(p=>d[p+3]).join(", "));
console.log("\n前 200 字节:");
for (let off = 0; off < 200; off += 40) {
  const c = d.subarray(off, off+40);
  console.log(`  ${off.toString().padStart(3)}  ${Array.from(c).map(x=>x.toString(16).padStart(2,"0")).join(" ")}`);
}
