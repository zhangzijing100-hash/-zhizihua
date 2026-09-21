// 元素百分比来源的回归测试（防止「全属性%」被错误地算进元素）
//
// 正确映射：
//   ✅ source.global.fire / wind / water / earth / spirit  → 各自元素
//   ✅ source.global.all-element                           → 5 个元素
//   ❌ source.global.all-stats（全属性%）                   → 只影响 4 个基础属性，绝不进元素
//
// 运行： node tests/element-percent-check.mjs
import { readFileSync } from "node:fs";
import { solveWorkbench } from "../src/solver.js";

const wbFull = JSON.parse(readFileSync(new URL("../src/data/workbench.json", import.meta.url), "utf8"));

const member = wbFull.characters.find((c) => c.rarity === "SSR" && !c.isLimited);
const wheel = {
  id: "fate-wheel.test.pct", gameEntryId: 0, name: "测试-百分比来源", order: 1,
  wheelCategoryId: "wheel-category.creation", tagIds: [], maxStar: 3,
  members: [{ characterId: member.id, perStarWheelCost: 1 }],
  perStarGains: [{ sourceAttributeId: "source.global.fire", valueKind: "flat", value: 100 }],
  perRankGains: [
    { sourceAttributeId: "source.global.all-stats", valueKind: "percent", value: 2.4 },   // 不应进元素
    { sourceAttributeId: "source.global.all-element", valueKind: "percent", value: 2 },   // 应进元素
    { sourceAttributeId: "source.global.fire", valueKind: "percent", value: 5 },          // 应进元素
  ],
  isEnabled: true,
};
const wb = { ...wbFull, characters: [member], fateWheels: [wheel] };
const plan = {
  schemaVersion: "4.1", id: "p", name: "t", workbenchVersion: "t", updatedAt: "",
  baseAttributes: wbFull.defaults.userBaseAttributeTemplate.values.map((v) => ({ ...v })),
  extraPercents: wbFull.defaults.userBaseAttributeTemplate.extraPercents.map((v) => ({ ...v })),
  objectives: wbFull.optimizationMetrics.map((m) => ({ metricId: m.id, weight: 1, isEnabled: m.id === "metric.global.fire" })),
  inventory: [{ characterId: member.id, wheelCount: 99, fragmentCount: 300 }],
  currencies: [],
  solver: {
    algorithmId: "solver.highs-mip", includeDestinyWheel: false, ignoredFragmentGroups: [], ssrWheelChoices: 0,
    parameters: [{ key: "time_limit_seconds", value: "30" }, { key: "threads", value: "1" }, { key: "random_seed", value: "1" }],
  },
  solverHistory: [],
};

const res = await solveWorkbench(wb, plan, () => {});
const rank = res.fateWheels.reduce((sum, f) => sum + f.rank, 0);
const fire = res.finalValues.find((v) => v.metricId === "metric.global.fire");
const attack = res.finalValues.find((v) => v.metricId === "metric.global.attack");

console.log("方案:", res.fateWheels.map((f) => `${f.rank}阶${f.star}星`).join(" ") || "(全不选)");
console.log(`每阶收益：全属性 2.4% ／ 全元素 2% ／ 火元素 5%      每星收益：火元素 +100\n`);
console.log(`  火元素  固定 F = ${fire.flat}（火元素 +100/星 × ${3 * rank} 星）`);
console.log(`  火元素  百分比 P = ${fire.percent}   期望 ${(2 + 5) * rank}（全元素2% + 火元素5%，×${rank}阶）`);
console.log(`  攻击    百分比 P = ${attack?.percent}   期望 ${2.4 * rank}（全属性2.4%，×${rank}阶）`);

const checks = [
  ["全元素% 计入火元素", Math.abs(fire.percent - (2 + 5) * rank) < 1e-9],
  ["全属性% 未计入火元素", Math.abs(fire.percent - (2.4 + 2 + 5) * rank) > 1e-9],
  ["全属性% 只影响基础属性（攻击）", attack && Math.abs(attack.percent - 2.4 * rank) < 1e-9],
];
console.log("\n===== 断言 =====");
let ok = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? "✅" : "❌"} ${label}`);
  if (!pass) ok = false;
}
console.log(`\n${ok ? "✅ 通过：元素百分比来源正确" : "❌ 失败"}`);
process.exit(ok ? 0 : 1);
