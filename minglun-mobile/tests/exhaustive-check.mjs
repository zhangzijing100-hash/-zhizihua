// 回归测试：用【独立实现的穷举】验证新目标函数（含双线性精确线性化）是否正确。
// 运行： node tests/exhaustive-check.mjs
import { readFileSync } from "node:fs";
import { solveWorkbench } from "../src/solver.js";

const wbFull = JSON.parse(readFileSync(new URL("../src/data/workbench.json", import.meta.url), "utf8"));

// ---------- 独立实现的打分（完全不依赖 solver.js 内部） ----------
const EXCLUDED = new Set(["source.global.element-resilience", "source.global.element-resilience-break"]);
const SRC = Object.fromEntries(wbFull.sourceAttributes.map((s) => [s.id, s]));

function trueValues(workbench, plan, selection) {
  const flat = new Map(workbench.optimizationMetrics.map((m) => [m.id, 0]));
  const pct = new Map(workbench.optimizationMetrics.map((m) => [m.id, 0]));
  const add = (g) => {
    if (EXCLUDED.has(g.sourceAttributeId)) return;
    const s = SRC[g.sourceAttributeId];
    const bucket = g.valueKind === "flat" || s.percentMode === "points" ? flat : pct;
    for (const t of s.targetMetricIds) bucket.set(t, bucket.get(t) + g.value);
  };
  for (const sel of selection) {
    const w = workbench.fateWheels.find((x) => x.id === sel.fateWheelId);
    const upgrades = sel.rank * w.maxStar + sel.star;
    for (const g of w.perStarGains) for (let i = 0; i < upgrades; i += 1) add(g);
    for (const g of w.perRankGains) for (let i = 0; i < sel.rank; i += 1) add(g);
  }
  const base = new Map(plan.baseAttributes.map((b) => [b.metricId, b.value]));
  const extra = new Map((plan.extraPercents ?? []).map((e) => [e.metricId, e.value]));
  const out = {};
  for (const m of workbench.optimizationMetrics) {
    const F = flat.get(m.id), B = base.get(m.id) ?? 0, P = pct.get(m.id), E = extra.get(m.id) ?? 0;
    out[m.id] = (F + B) * (1 + (P + E) / 100);
  }
  return out;
}
function trueScore(workbench, plan, selection) {
  const v = trueValues(workbench, plan, selection);
  const bl = Object.fromEntries(workbench.globalSettings.objectiveBaselines.map((b) => [b.metricId, b.value]));
  return plan.objectives
    .filter((o) => o.isEnabled)
    .reduce((t, o) => t + (v[o.metricId] * o.weight) / (bl[o.metricId] ?? 1), 0);
}

// ---------- 取 3 个单成员盘，造一个小模型 ----------
const single = wbFull.fateWheels
  .filter((w) => w.members.length === 1 && w.wheelCategoryId === "wheel-category.creation" && w.maxStar === 3)
  .slice(0, 3);
const charIds = new Set(single.flatMap((w) => w.members.map((m) => m.characterId)));
const workbench = { ...wbFull, characters: wbFull.characters.filter((c) => charIds.has(c.id)), fateWheels: single };
console.log("测试盘:", single.map((w) => `${w.name}(maxStar=${w.maxStar}, ${w.members.length}人)`).join("  "));

const plan = {
  schemaVersion: "4.1", id: "p", name: "t", workbenchVersion: "t", updatedAt: "",
  baseAttributes: wbFull.defaults.userBaseAttributeTemplate.values.map((v) => ({ ...v })),
  extraPercents: wbFull.defaults.userBaseAttributeTemplate.extraPercents.map((v) => ({ ...v })),
  objectives: wbFull.optimizationMetrics.map((m) => ({ metricId: m.id, weight: 1, isEnabled: m.id === "metric.global.spirit" })),
  inventory: [...charIds].map((id) => ({ characterId: id, wheelCount: 5, fragmentCount: 30 })),
  solver: {
    algorithmId: "solver.highs-mip", includeDestinyWheel: false, ignoredFragmentGroups: [], ssrWheelChoices: 0,
    parameters: [{ key: "time_limit_seconds", value: "60" }, { key: "threads", value: "1" }, { key: "random_seed", value: "1" }],
  },
  solverHistory: [],
};
console.log("库存: wheelCount=5, fragmentCount=30 (每个角色)   目标: 精神元素 权重1   extraPercents=10%");

// ---------- 穷举 ----------
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
const inv = new Map(plan.inventory.map((i) => [i.characterId, i]));
let best = null;
let feasible = 0;
const walk = (idx, acc) => {
  if (idx === perWheel.length) {
    const wheelUse = new Map(), fragUse = new Map();
    for (const sel of acc) {
      const w = single.find((x) => x.id === sel.fateWheelId);
      const up = sel.rank * w.maxStar + sel.star;
      for (const m of w.members) {
        const c = wbFull.characters.find((x) => x.id === m.characterId);
        wheelUse.set(m.characterId, (wheelUse.get(m.characterId) ?? 0) + up);
        fragUse.set(m.characterId, (fragUse.get(m.characterId) ?? 0) + sel.rank * c.baseRankFragmentCost);
      }
    }
    for (const [id, u] of wheelUse) if (u > (inv.get(id)?.wheelCount ?? 0)) return;
    for (const [id, u] of fragUse) if (u > (inv.get(id)?.fragmentCount ?? 0)) return;
    feasible += 1;
    const sc = trueScore(workbench, plan, acc);
    if (!best || sc > best.score) best = { score: sc, selection: acc.map((s) => ({ ...s })) };
    return;
  }
  for (const st of perWheel[idx]) walk(idx + 1, [...acc, st]);
};
walk(0, []);
console.log(`\n穷举完成：可行组合 ${feasible} 个，最优分 = ${best.score.toFixed(6)}`);
console.log("穷举最优解:", best.selection.filter((s) => s.star || s.rank).map((s) => `${single.find((x) => x.id === s.fateWheelId).name}:${s.rank}阶${s.star}星`).join("  ") || "(全不选)");

// ---------- 求解器 ----------
const t0 = performance.now();
const res = await solveWorkbench(workbench, plan, () => {});
const dt = performance.now() - t0;
const solverScore = trueScore(workbench, plan, res.fateWheels);
console.log(`\n求解器: status=${res.status} isProvenOptimal=${res.isProvenOptimal} 耗时=${dt.toFixed(0)}ms stageModelVersion=${res.stageModelVersion}`);
console.log("求解器解:", res.fateWheels.map((s) => `${single.find((x) => x.id === s.fateWheelId).name}:${s.rank}阶${s.star}星`).join("  ") || "(全不选)");
console.log(`求解器独立评分 = ${solverScore.toFixed(6)}`);

const diff = Math.abs(solverScore - best.score);
console.log(`\n===== 判定 =====`);
console.log(`  穷举最优 ${best.score.toFixed(6)}  vs  求解器 ${solverScore.toFixed(6)}   差 ${diff.toExponential(3)}`);
if (diff >= 1e-6) {
  console.error("  ❌ 不一致：线性化有问题！");
  process.exit(1);
}
console.log("  ✅ 一致：线性化精确，求解器找到了真最优");
