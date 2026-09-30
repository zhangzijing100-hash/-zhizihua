import { readNameRecords, readFile } from "./bny.mjs";
const pack = "emu/data.png";
const recs = readNameRecords(pack);
const r = recs.find(x => x.name.toLowerCase().includes("cfortunewheelitemcfg.bny"));
const d = readFile(pack, r);
console.log(`文件 ${r.name}  ${d.length} 字节`);
const rows = [];
for (let s = 0; s + 72 <= d.length; s += 72) {
  if (!(d[s]===0x19 && d[s+1]===0x2e && d[s+2]===0xd6)) break;
  const ints = [];
  for (let o = 4; o + 4 <= 72; o += 4) ints.push(d.readInt32BE(s+o));
  rows.push({ seq: d[s+3], ints });
}
console.log(`共 ${rows.length} 条记录，每条 72 字节`);
console.log("\n每条记录的 17 个 int32 字段（前 8 条）：");
rows.slice(0,8).forEach(x => console.log(`  seq${x.seq}: [${x.ints.join(", ")}]`));
// 统计每个字段的取值范围，找出哪个像「物品id」哪个像「类型」
console.log("\n各字段的取值范围：");
for (let f = 0; f < 17; f++) {
  const vs = rows.map(x => x.ints[f]);
  const uniq = [...new Set(vs)].sort((a,b)=>a-b);
  console.log(`  字段${String(f).padStart(2)}  唯一值${String(uniq.length).padStart(3)} 个   范围 ${uniq[0]} .. ${uniq[uniq.length-1]}   ${uniq.length<=8 ? "值: "+uniq.join(",") : ""}`);
}
