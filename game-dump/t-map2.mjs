import fs from "node:fs";
import { readNameRecords, readFile } from "./bny.mjs";
const wb = JSON.parse(fs.readFileSync("../minglun-mobile/src/data/workbench.json","utf8"));
const byPartner = new Map();
for (const c of wb.characters) byPartner.set(String(c.gamePartnerId), c);

const pack = "emu/data.png";
const r = readNameRecords(pack).find(x => x.name.toLowerCase().includes("cfortunewheelitemcfg.bny"));
const d = readFile(pack, r);
const rows = [];
for (let s = 0; s + 72 <= d.length; s += 72) {
  if (!(d[s]===0x19 && d[s+1]===0x2e && d[s+2]===0xd6)) break;
  const ints = [];
  for (let o = 4; o + 4 <= 72; o += 4) ints.push(d.readInt32BE(s+o));
  rows.push(ints);
}
const Q = { 3: "?", 4: "?", 5: "?" };
console.log("物品id      品质  伙伴id       伙伴名");
console.log("----------  ----  -----------  --------");
for (const x of rows) {
  const itemId = x[4], quality = x[5], partnerId = x[16];
  const ch = byPartner.get(String(partnerId));
  console.log(`${String(itemId).padEnd(11)} ${String(quality).padEnd(5)} ${String(partnerId).padEnd(12)} ${ch ? ch.name : "（App 里没有）"}`);
}
console.log(`\n共 ${rows.length} 条`);
const qs = {};
rows.forEach(x => qs[x[5]] = (qs[x[5]]||0)+1);
console.log("品质分布:", JSON.stringify(qs));

