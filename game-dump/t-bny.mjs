import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
for (const f of ["emu/configs.png", "emu/data.png"]) {
  if (!fs.existsSync(f)) { console.log(`${f} 不存在`); continue; }
  const t0 = Date.now();
  const { entries } = unpackPng(f);
  let nBny = 0, nFW = 0, sizeSum = 0;
  const hits = [];
  entries.forEach((e, i) => {
    sizeSum += e.data.length;
    const s = e.data.toString("latin1");
    if (s.includes(".bny")) nBny++;
    if (/CFortuneWheelItemCfg/i.test(s)) { nFW++; hits.push(i); }
  });
  console.log(`${f}: ${entries.length} 条 / ${(sizeSum/1048576).toFixed(1)} MB，含 .bny 的条目 ${nBny}，含 CFortuneWheelItemCfg 的 ${nFW} ${hits.length?("-> #"+hits.slice(0,8).join(", #")):""}  (${((Date.now()-t0)/1000).toFixed(1)}s)`);
  if (nFW) {
    const e = entries[hits[0]];
    const s = e.data.toString("latin1");
    const idx = s.indexOf("CFortuneWheelItemCfg");
    console.log(`  #${hits[0]} (${(e.data.length/1024).toFixed(1)} KB) 上下文：`);
    console.log("   " + JSON.stringify(s.slice(Math.max(0,idx-120), idx+160)));
  }
}
