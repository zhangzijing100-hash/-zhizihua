// 兑换货币（王牌积分 / 命轮金币）验证：
//   A. 单货币 —— 用独立穷举（含货币可行域）比对求解器是否找到真最优
//   B. 双货币 —— 校验各自预算不被超支、买到的命轮确实补进了对应角色
// 运行： node tests/currency-check.mjs
import { readFileSync } from "node:fs";
import { solveWorkbench } from "../src/engine/solver.js";

const wbFull = JSON.parse(readFileSync(new URL("../src/data/workbench.json", import.meta.url), "utf8"));
const EXCLUDED = new Set(["source.global.element-resilience", "source.global.element-resilience-break"]);
const SRC = Object.fromEntries(wbFull.sourceAttributes.map((s) => [s.id, s]));
const BL = Object.fromEntries(wbFull.globalSettings.objectiveBaselines.map((b) => [b.metricId, b.value]));

function trueScore(workbench, plan, selection) {
  const flat = new Map(workbench.optimizationMetrics.map((m) => [m.id, 0]));
  const pct = new Map(workbench.optimizationMetrics.map((m) => [m.id, 0]));
  const add = (g) => {
    if (EXCLUDED.has(g.sourceAttributeId)) return;
    const s = SRC[g.sourceAttributeId];
    const b = g.valueKind === "flat" || s.percentMode === "points" ? flat : pct;
    for (const t of s.targetMetricIds) b.set(t, b.get(t) + g.value);
  };
  for (const sel of selection) {
    const w = workbench.fateWheels.find((x) => x.id === sel.fateWheelId);
    const up = sel.rank * w.maxStar + sel.star;
    for (const g of w.perStarGains) for (let i = 0; i < up; i += 1) add(g);
    for (const g of w.perRankGains) for (let i = 0; i < sel.rank; i += 1) add(g);
  }
  const base = new Map(plan.baseAttributes.map((b) => [b.metricId, b.value]));
  const extra = new Map((plan.extraPercents ?? []).map((e) => [e.metricId, e.value]));
  return plan.objectives.filter((o) => o.isEnabled).reduce((t, o) => {
    const F = flat.get(o.metricId), B = base.get(o.metricId) ?? 0, P = pct.get(o.metricId), E = extra.get(o.metricId) ?? 0;
    return t + ((F + B) * (1 + (P + E) / 100) * o.weight) / (BL[o.metricId] ?? 1);
  }, 0);
}

// ---------- 造小模型：3 个单成员盘，角色统一为「普通 SSR」以便单价一致 ----------
const single = wbFull.fateWheels
  .filter((w) => w.members.length === 1 && w.wheelCategoryId === "wheel-category.creation" && w.maxStar === 3)
  .slice(0, 3);
const charIds = new Set(single.flatMap((w) => w.members.map((m) => m.characterId)));
const characters = wbFull.characters
  .filter((c) => charIds.has(c.id))
  .map((c) => ({ ...c, rarity: "SSR", isLimited: false, baseRankFragmentCost: 30, destinyRankFragmentCost: 60 }));
const workbench = { ...wbFull, characters, fateWheels: single };
console.log("测试盘:", single.map((w) => w.name).join(" / "), " 角色统一为 SSR（单价 1000）");

const mkPlan = (ace, coins) => ({
  schemaVersion: "4.1", id: "p", name: "t", workbenchVersion: "t", updatedAt: "",
  baseAttributes: wbFull.defaults.userBaseAttributeTemplate.values.map((v) => ({ ...v })),
  extraPercents: wbFull.defaults.userBaseAttributeTemplate.extraPercents.map((v) => ({ ...v })),
  objectives: wbFull.optimizationMetrics.map((m) => ({ metricId: m.id, weight: 1, isEnabled: m.id === "metric.global.spirit" })),
  inventory: [...charIds].map((id) => ({ characterId: id, wheelCount: 0, fragmentCount: 30 })), // 命轮为 0 → 必须靠兑换
  currencies: [{ currencyId: "currency.ace-points", amount: ace }, { currencyId: "currency.fate-coins", amount: coins }],
  solver: {
    algorithmId: "solver.highs-mip", includeDestinyWheel: false, ignoredFragmentGroups: [], ssrWheelChoices: 0,
    parameters: [{ key: "time_limit_seconds", value: "60" }, { key: "threads", value: "1" }, { key: "random_seed", value: "1" }],
  },
  solverHistory: [],
});

const RATE = 1000; // SSR 兑换单价
const states = (w) => {
  const out = [];
  for (let r = 0; r <= wbFull.globalSettings.maxRank; r += 1)
    for (let s = 0; s <= w.maxStar; s += 1) {
      if (r === wbFull.globalSettings.maxRank && s !== 0) continue;
      out.push({ fateWheelId: w.id, rank: r, star: s });
    }
  return out;
};
const perWheel = single.map(states);

function usageOf(selection) {
  const wheelUse = new Map(), fragUse = new Map();
  for (const sel of selection) {
    const w = single.find((x) => x.id === sel.fateWheelId);
    const up = sel.rank * w.maxStar + sel.star;
    for (const m of w.members) {
      wheelUse.set(m.characterId, (wheelUse.get(m.characterId) ?? 0) + up);
      const c = characters.find((x) => x.id === m.characterId);
      fragUse.set(m.characterId, (fragUse.get(m.characterId) ?? 0) + sel.rank * c.baseRankFragmentCost);
    }
  }
  return { wheelUse, fragUse };
}

// ================= A. 单货币穷举 =================
console.log("\n========== A. 单货币（王牌积分 5000 / 命轮金币 0）==========");
const ACE = 5000, COIN = 0;
const plan = mkPlan(ACE, COIN);
let best = null, feasible = 0;
const walk = (idx, acc) => {
  if (idx === perWheel.length) {
    const { wheelUse, fragUse } = usageOf(acc);
    for (const [, u] of fragUse) if (u > 30) return;
    let need = 0;
    for (const [, u] of wheelUse) need += u;
    if (need * RATE > ACE + COIN) return; // 命轮全靠兑换
    feasible += 1;
    const sc = trueScore(workbench, plan, acc);
    if (!best || sc > best.score) best = { score: sc, need, selection: acc.map((s) => ({ ...s })) };
    return;
  }
  for (const st of perWheel[idx]) walk(idx + 1, [...acc, st]);
};
walk(0, []);
console.log(`可行组合 ${feasible} 个；穷举最优分 ${best.score.toFixed(6)}（需兑换 ${best.need} 个命轮 = ${best.need * RATE} 分）`);

const resA = await solveWorkbench(workbench, plan, () => {});
const scoreA = trueScore(workbench, plan, resA.fateWheels);
const spentA = (resA.currencyUsage ?? []).reduce((s, u) => s + u.cost, 0);
console.log(`求解器: status=${resA.status} 最优=${resA.isProvenOptimal} 盘数=${resA.fateWheels.length} 真分=${scoreA.toFixed(6)}`);
console.log(`        兑换用量: ${spentA} 分` + ((resA.currencyUsage ?? []).length ? "  [" + resA.currencyUsage.map((u) => `${u.currencyName}→${u.characterName}×${u.count}`).join(", ") + "]" : ""));
const okA = Math.abs(scoreA - best.score) < 1e-6 && spentA <= ACE;
console.log(`  ${okA ? "✅" : "❌"} 与穷举一致且未超预算`);

// ================= B. 双货币 =================
console.log("\n========== B. 双货币（王牌积分 3000 + 命轮金币 2500）==========");
const ACE2 = 3000, COIN2 = 2500;
const plan2 = mkPlan(ACE2, COIN2);
const resB = await solveWorkbench(workbench, plan2, () => {});
const scoreB = trueScore(workbench, plan2, resB.fateWheels);
const byCur = new Map();
for (const u of resB.currencyUsage ?? []) byCur.set(u.currencyId, (byCur.get(u.currencyId) ?? 0) + u.cost);
console.log(`求解器: status=${resB.status} 最优=${resB.isProvenOptimal} 真分=${scoreB.toFixed(6)}`);
console.log("  兑换明细:");
for (const u of resB.currencyUsage ?? []) console.log(`     ${u.currencyName} → ${u.characterName} ×${u.count}  (${u.cost} 分)`);
console.log(`  王牌积分用 ${byCur.get("currency.ace-points") ?? 0} / ${ACE2}`);
console.log(`  命轮金币用 ${byCur.get("currency.fate-coins") ?? 0} / ${COIN2}`);
const okBudget = (byCur.get("currency.ace-points") ?? 0) <= ACE2 && (byCur.get("currency.fate-coins") ?? 0) <= COIN2;
const okBetter = scoreB >= scoreA - 1e-6;
console.log(`  ${okBudget ? "✅" : "❌"} 两种货币各自未超预算`);
console.log(`  ${okBetter ? "✅" : "❌"} 资源更多时得分不劣（${scoreA.toFixed(6)} → ${scoreB.toFixed(6)}）`);

// ================= C. 兑换的命轮真的补进了该角色 =================
console.log("\n========== C. 买到的命轮计入该角色可用量（verifySolution 已通过即说明一致）==========");
const need = new Map();
for (const sel of resB.fateWheels) {
  const w = single.find((x) => x.id === sel.fateWheelId);
  const up = sel.rank * w.maxStar + sel.star;
  for (const m of w.members) need.set(m.characterId, (need.get(m.characterId) ?? 0) + up);
}
let okC = true;
for (const [cid, used] of need) {
  const bought = (resB.currencyUsage ?? []).filter((u) => u.characterId === cid).reduce((s, u) => s + u.count, 0);
  const name = characters.find((c) => c.id === cid).name;
  console.log(`  ${name}: 用到 ${used} 个命轮，兑换买到 ${bought} 个 → ${bought >= used ? "够" : "不够 ✗"}`);
  if (bought < used) okC = false;
}
console.log(`  ${okC ? "✅" : "❌"}`);

const pass = okA && okBudget && okBetter && okC;
console.log(`\n===== 总判定: ${pass ? "✅ 全部通过" : "❌ 有失败项"} =====`);
if (!pass) process.exit(1);
