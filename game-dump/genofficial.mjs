import fs from "node:fs";

const rows = JSON.parse(fs.readFileSync("C:/Users/Ricairo/Desktop/栀子花/game-dump/official-wheelvalues.json", "utf8"));
const out = {};
for (const r of rows) {
  const vals = [...new Set(Object.values(r.units))];
  if (vals.length === 1) out[r.id] = vals[0];
  else out[r.id] = vals;   // 理论上不会发生
}
const dest = "C:/Users/Ricairo/Desktop/栀子花/minglun-mobile/src/data/official-fate-values.json";
fs.writeFileSync(dest, JSON.stringify(out), "utf8");
const n = Object.keys(out).length;
const size = fs.statSync(dest).size;
console.log(`已写出 ${n} 条官方命轮值 → ${dest}  (${size} bytes)`);
const multi = Object.entries(out).filter(([, v]) => Array.isArray(v));
console.log(`值随(阶,星)变化的条目: ${multi.length}`);
