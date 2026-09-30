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
const Q = { 5: "SSR", 4: "SR", 3: "R" };
const out = rows.map(x => {
  const ch = byPartner.get(String(x[16]));
  return {
    itemId: x[4],
    partnerId: x[16],
    quality: Q[x[5]] ?? String(x[5]),
    name: ch ? ch.name : null,
    appCharacterId: ch ? ch.id : null,
  };
});
fs.writeFileSync("命轮物品id映射.json", JSON.stringify({
  note: "来自 CFortuneWheelItemCfg.bny（游戏静态配置）。itemId 是命轮材料的物品 id，partnerId 对应 App 的 gamePartnerId。",
  source: "data/bny/drc.gsp.fortunewheel.confbean.CFortuneWheelItemCfg.bny",
  count: out.length,
  table: out,
}, null, 2), "utf8");
console.log(`已写出 命轮物品id映射.json（${out.length} 条）`);
console.log("品质分布:", Object.entries(out.reduce((a,x)=>(a[x.quality]=(a[x.quality]||0)+1,a),{})).map(([k,v])=>`${k}=${v}`).join("  "));
console.log("App 里没有对应伙伴的:", out.filter(x=>!x.name).length, "条");
