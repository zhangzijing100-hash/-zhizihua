import fs from "node:fs";
for (const f of ["emu/configs.png", "emu/lua-delta.png"]) {
  const b = fs.readFileSync(f);
  console.log(`\n=== ${f}  ${b.length} B ===`);
  console.log("头 48 字节:", b.subarray(0,48).toString("hex").replace(/(..)/g,"$1 ").trim());
  const s = b.toString("latin1");
  for (const key of ["CFortuneWheelItemCfg", "fortunewheel", "data/bny", ".bny", "confbean"]) {
    const i = s.indexOf(key);
    console.log(`  含 "${key}": ${i >= 0 ? "在偏移 " + i : "无"}`);
  }
  // 熵：取几段看是不是加密的
  const seg = (off) => {
    const chunk = b.subarray(off, off + 65536);
    const cnt = new Array(256).fill(0);
    for (const x of chunk) cnt[x]++;
    let h = 0;
    for (const c of cnt) if (c) { const p = c / chunk.length; h -= p * Math.log2(p); }
    return h.toFixed(2);
  };
  console.log(`  熵: 头 64KB=${seg(0)}  中段=${seg(Math.floor(b.length/2))}  尾 64KB=${seg(b.length-65536)}`);
}
