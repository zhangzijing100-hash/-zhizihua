// 解析 printfortunewheel 的 DebugLog，抽出「总计」段的命轮库存
import { readFileSync, writeFileSync } from "node:fs";

const text = readFileSync(process.argv[2] ?? "device/fortune-debug.log", "utf8");
const lines = text.split(/\r?\n/);

// 行格式：<名字><纯数字id>\t...\t<多方案总用量>\t<包裹内未用>
const rowRe = /^(.+?)(\d{6,})\t+(\d+)\t+(\d+)$/;

const sections = [];
let cur = null;
for (const line of lines) {
  if (!line.trim()) continue;
  if (line.startsWith("================")) { cur = null; continue; }
  if (/^(命轮方案|总计)$/.test(line.trim())) { cur = { name: line.trim(), rows: [] }; sections.push(cur); continue; }
  if (/^命轮物品/.test(line)) continue;
  if (/^(物质之轮|执行之轮|创始之轮|宿命之轮)$/.test(line.trim())) { cur = { name: line.trim(), rows: [] }; sections.push(cur); continue; }
  const m = line.match(rowRe);
  if (m && cur) cur.rows.push({ name: m[1], id: m[2], used: +m[3], left: +m[4] });
}

console.log("解析到的段：");
sections.forEach((s) => console.log(`   ${s.name}  ${s.rows.length} 行`));

const total = sections.find((s) => s.name === "总计");
if (!total) { console.log("没找到总计段"); process.exit(1); }

const wheels = total.rows.filter((r) => r.name.startsWith("命轮·"));
const nonZero = wheels.filter((r) => r.left > 0);

console.log(`\n总计段：${total.rows.length} 行（其中命轮 ${wheels.length} 个）`);
console.log(`包裹内有货的：${nonZero.length} 个，合计 ${nonZero.reduce((a, b) => a + b.left, 0)} 个\n`);
console.log("命轮\t\t\t\t包裹内未用");
nonZero.sort((a, b) => b.left - a.left).forEach((r) => console.log(`${r.name}\t${r.left}`));

// 每个方案单独看
for (const s of sections) {
  if (s.name === "总计" || s.name === "命轮方案") continue;
  const w = s.rows.filter((r) => r.name.startsWith("命轮·"));
  const f = s.rows.filter((r) => r.name.endsWith("碎片"));
  console.log(`\n[${s.name}] 命轮 ${w.length} 条 / 碎片 ${f.length} 条`);
}

writeFileSync("fortune-inventory.json", JSON.stringify({
  total: total.rows,
  sections: sections.map((s) => ({ name: s.name, rows: s.rows })),
}, null, 2), "utf8");
console.log("\n→ fortune-inventory.json");
