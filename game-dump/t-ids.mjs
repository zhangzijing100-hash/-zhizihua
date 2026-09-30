import fs from "node:fs";
import { readNameRecords, readFile } from "./bny.mjs";
const pack = "emu/data.png";
const r = readNameRecords(pack).find(x => x.name.toLowerCase().includes("cfortunewheelitemcfg.bny"));
const d = readFile(pack, r);
const ids = [];
for (let s = 0; s + 72 <= d.length; s += 72) {
  if (!(d[s] === 0x19 && d[s+1] === 0x2e && d[s+2] === 0xd6)) break;
  const ints = [];
  for (let o = 4; o + 4 <= 72; o += 4) ints.push(d.readInt32BE(s + o));
  // 物品 id 是 9 位数（1 亿~2 亿）
  const id = ints.find(v => v > 100000000 && v < 200000000);
  if (id) ids.push(id);
}
console.log(`命轮物品 id 共 ${ids.length} 个：`);
console.log("  " + ids.join(", "));
fs.writeFileSync("emu/fw-item-ids.json", JSON.stringify(ids), "utf8");
