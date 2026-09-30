import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const f = "emu/lua.png";
const t0 = Date.now();
const { entries } = unpackPng(f);
console.log(`${f}: ${entries.length} 条，用时 ${((Date.now()-t0)/1000).toFixed(1)}s`);
// 找含 fortunewheel 的条目
let found = 0;
entries.forEach((e, i) => {
  const s = e.data.toString("latin1");
  if (/fortunewheel/i.test(s)) {
    found++;
    const idx = s.toLowerCase().indexOf("fortunewheel");
    // 抠出条目里嵌的路径
    const m = s.match(/@?[\w\\/.-]*fortunewheel[\w\\/.-]*/i);
    if (found <= 20) console.log(`  #${i} ${(e.data.length/1024).toFixed(1)} KB  ${m ? m[0] : ""}`);
  }
});
console.log(`含 fortunewheel 的条目共 ${found} 条`);
