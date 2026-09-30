import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const KEYS = ["CFortuneWheelItemCfg", "fortunewheel", "FortuneWheel", ".bny", "confbean", "drc.gsp"];
for (const f of ["emu/configs.png", "emu/lua-delta.png", "emu/data.png"]) {
  if (!fs.existsSync(f)) continue;
  const { entries } = unpackPng(f);
  console.log(`\n=== ${f}   ${entries.length} 条 ===`);
  entries.forEach((e, i) => {
    const s = e.data.toString("latin1");
    const hits = KEYS.filter(k => s.includes(k));
    if (!hits.length) return;
    console.log(`  #${i} (${(e.data.length/1024).toFixed(0)} KB) 命中: ${hits.join(", ")}`);
    // 打印第一条命中的上下文
    const k = hits[0];
    const idx = s.indexOf(k);
    console.log(`     上下文: ${JSON.stringify(s.slice(Math.max(0,idx-60), idx+80))}`);
  });
}
