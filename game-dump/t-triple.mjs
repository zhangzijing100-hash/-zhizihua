import fs from "node:fs";
import { readNameRecords, readFile } from "./bny.mjs";
const wb = JSON.parse(fs.readFileSync("../minglun-mobile/src/data/workbench.json","utf8"));
const byPartner = new Map(); for (const c of wb.characters) byPartner.set(String(c.gamePartnerId), c);
const r = readNameRecords("emu/data.png").find(x => x.name.toLowerCase().includes("cfortunewheelitemcfg.bny"));
const d = readFile("emu/data.png", r);
const ids = [];
for (let s = 0; s + 72 <= d.length; s += 72) {
  if (!(d[s]===0x19 && d[s+1]===0x2e && d[s+2]===0xd6)) break;
  const ints = []; for (let o = 4; o + 4 <= 72; o += 4) ints.push(d.readInt32BE(s+o));
  ids.push(ints[4]);
}
const tt = "0300000000000000";
function dbl(v){ const b = Buffer.alloc(8); b.writeDoubleLE(v); return b.toString("hex"); }
// 连续 3 个 id 组成 Lua 数组（每个 TValue = double + tt3 + pad）
const pats = [];
for (let i = 0; i + 3 <= ids.length; i++) {
  pats.push(dbl(ids[i]) + tt + dbl(ids[i+1]) + tt + dbl(ids[i+2]) + tt);
}
console.log(`连续三元组模式 ${pats.length} 个，示例:\n  ${pats[0]}`);
fs.writeFileSync("emu/fw-triples.txt", pats.join("\n"), "utf8");
