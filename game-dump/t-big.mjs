import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const { entries } = unpackPng("emu/data.png");
const big = [];
entries.forEach((e, i) => {
  if (e.data.length <= 1024) return;
  const s = e.data.toString("latin1");
  if (s.includes(".bny") || /secretType/.test(s)) big.push({ i, len: e.data.length, s });
});
console.log(`大于 1KB 且含 .bny/secretType 的条目 ${big.length} 个`);
big.slice(0, 12).forEach(b => {
  const idx = b.s.indexOf(".bny") >= 0 ? b.s.indexOf(".bny") : b.s.indexOf("secretType");
  console.log(`  #${b.i} ${(b.len/1024).toFixed(1)} KB  ${JSON.stringify(b.s.slice(Math.max(0,idx-80), idx+120))}`);
});
// 统计条目大小分布，看最大的几个
const sizes = entries.map((e,i)=>({i, len:e.data.length})).sort((a,b)=>b.len-a.len);
console.log("\n最大的 10 个条目:", sizes.slice(0,10).map(x=>`#${x.i}:${(x.len/1024).toFixed(0)}KB`).join(" "));
