// 「SSR 命轮自选」机制验证 + 全局最优性检验
// 运行： node tests/selfselect-check.mjs
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

// 3 个单成员盘；把成员统一改成「普通 SSR」；命轮库存全为 0 → 必须靠自选
const single = wbFull.fateWheels
  .filter((w) => w.members.length === 1 && w.wheelCategoryId === "wheel-category.creation" && w.maxStar === 3)
  .slice(0, 3);
const charIds = new Set(single.flatMap((w) => w.members.map((m) => m.characterId)));
const characters = wbFull.characters
  .filter((c) => charIds.has(c.id))
  .map((c) => ({ ...c, rarity: "SSR", isLimited: false, baseRankFragmentCost: 30, destinyRankFragmentCost: 60 }));
const workbench = { ...wbFull, characters, fateWheels: single };
const nameOf = (id) => characters.find((c) => c.id === id).name;
console.log("测试盘:", single.map((w) => `${w.name}(${nameOf(w.members[0].characterId)})`).join(" / "));

const SSR_CHOICES = 3;
const plan = {
  schemaVersion: "4.1", id: "p", name: "t", workbenchVersion: "t", updatedAt: "",
  baseAttributes: wbFull.defaults.userBaseAttributeTemplate.values.map((v) => ({ ...v })),
  extraPercents: wbFull.defaults.userBaseAttributeTemplate.extraPercents.map((v) => ({ ...v })),
  objectives: wbFull.optimizationMetrics.map((m) => ({ metricId: m.id, weight: 1, isEnabled: m.id === "metric.global.spirit" })),
  inventory: [...charIds].map((id) => ({ characterId: id, wheelCount: 0, fragmentCount: 30 })),
  currencies: [{ currencyId: "currency.ace-points", amount: 0 }, { currencyId: "currency.fate-coins", amount: 0 }],
  solver: {
    algorithmId: "solver.highs-mip", includeDestinyWheel: false, ignoredFragmentGroups: [], ssrWheelChoices: SSR_CHOICES,
    parameters: [{ key: "time_limit_seconds", value: "60" }, { key: "threads", value: "1" }, { key: "random_seed", value: "1" }],
  },
  solverHistory: [],
};
console.log(`库存：命轮 0 / 碎片 30（每角色）　SSR 命轮自选 = ${SSR_CHOICES}（全局共享池）　货币均为 0`);

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
const needOf = (selection) => {
  const per = new Map(), frag = new Map();
  for (const sel of selection) {
    const w = single.find((x) => x.id === sel.fateWheelId);
    const up = sel.rank * w.maxStar + sel.star;
    for (const m of w.members) {
      per.set(m.characterId, (per.get(m.characterId) ?? 0) + up);
      frag.set(m.characterId, (frag.get(m.characterId) ?? 0) + sel.rank * 30);
    }
  }
  return { per, frag, total: [...per.values()].reduce((a, b) => a + b, 0) };
};

let best = null, feasible = 0;
const walk = (idx, acc) => {
  if (idx === perWheel.length) {
    const { per, frag } = needOf(acc);
    for (const [, v] of frag) if (v > 30) return;
    for (const [, v] of per) if (v > SSR_CHOICES) return; // 单角色需求不能超过池子总量
    const total = [...per.values()].reduce((a, b) => a + b, 0);
    if (total > SSR_CHOICES) return;                       // 池子全局共享
    feasible += 1;
    const sc = trueScore(workbench, plan, acc);
    if (!best || sc > best.score) best = { score: sc, selection: acc.map((s) => ({ ...s })), per: new Map(per) };
    return;
  }
  for (const st of perWheel[idx]) walk(idx + 1, [...acc, st]);
};
walk(0, []);
console.log(`\n穷举：可行组合 ${feasible} 个，最优分 ${best.score.toFixed(6)}`);
console.log("穷举最优解:", best.selection.filter((s) => s.star || s.rank).map((s) => {
  const w = single.find((x) => x.id === s.fateWheelId);
  return `${w.name}:${s.rank}阶${s.star}星`;
}).join("  ") || "(全不选)");
console.log("  自选分配:", [...best.per.entries()].map(([id, n]) => `${nameOf(id)}×${n}`).join(", "), `（合计 ${[...best.per.values()].reduce((a, b) => a + b, 0)}/${SSR_CHOICES}）`);

const res = await solveWorkbench(workbench, plan, () => {});
const score = trueScore(workbench, plan, res.fateWheels);
const need = needOf(res.fateWheels);
console.log(`\n求解器: status=${res.status} 最优=${res.isProvenOptimal} 真分=${score.toFixed(6)}`);
console.log("求解器解:", res.fateWheels.map((s) => {
  const w = single.find((x) => x.id === s.fateWheelId);
  return `${w.name}:${s.rank}阶${s.star}星`;
}).join("  ") || "(全不选)");
console.log("  自选需求:", [...need.per.entries()].map(([id, n]) => `${nameOf(id)}×${n}`).join(", ") || "无", `（合计 ${need.total}/${SSR_CHOICES}）`);
console.log(`  result 里记录的自选用量 = ${res.ssrChoiceUsed ?? "(未记录)"} / ${SSR_CHOICES}`);

const diff = Math.abs(score - best.score);
console.log(`\n===== 判定 =====`);
console.log(`  穷举最优 ${best.score.toFixed(6)}  vs  求解器 ${score.toFixed(6)}   差 ${diff.toExponential(3)}`);
console.log(`  自选池未超支: ${need.total <= SSR_CHOICES ? "✅" : "❌"}`);
if (diff >= 1e-6) { console.error("  ❌ 求解器未达全局最优"); process.exit(1); }
console.log("  ✅ 一致：自选池的分配由求解器全局最优决定");
