// 栀子花 命轮优化 —— 求解器（移植自桌面版 utility.js + rules chunk）
// 使用 HiGHS WASM 在浏览器内求解 CPLEX LP（混合整数规划）

let highsInstance = null;
async function getHighs() {
  if (highsInstance) return highsInstance;
  const highsMod = await import("highs");
  // 浏览器 / Worker 下用 Vite 解析出的 wasm 地址；纯 Node（跑测试）下没有 ?url 解析，回退到默认加载
  let wasmUrl = null;
  try {
    const wasmMod = await import("highs/runtime?url");
    wasmUrl = wasmMod?.default ?? null;
  } catch {
    wasmUrl = null;
  }
  highsInstance = wasmUrl ? await highsMod.default({ locateFile: () => wasmUrl }) : await highsMod.default();
  return highsInstance;
}

// 阶星/打分模型版本：改打分公式时必须提升，历史结果据此判断是否可比
const STAGE_MODEL_VERSION = "value-multiplier-v5-extra-percent";

// ---------- 有理数精确运算（BigInt 分数） ----------
const zero = { numerator: 0n, denominator: 1n };
function gcd(left, right) {
  let a = left < 0n ? -left : left;
  let b = right < 0n ? -right : right;
  while (b !== 0n) [a, b] = [b, a % b];
  return a || 1n;
}
function rational(numerator, denominator = 1n) {
  if (denominator === 0n) throw new Error("分母不能为 0。");
  if (denominator < 0n) return rational(-numerator, -denominator);
  const divisor = gcd(numerator, denominator);
  return { numerator: numerator / divisor, denominator: denominator / divisor };
}
function fromNumber(value) {
  if (!Number.isFinite(value)) throw new Error("目标系数必须是有限数字。");
  const raw = String(value);
  const [mantissa, exponentText] = raw.toLowerCase().split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const sign = mantissa?.startsWith("-") ? -1n : 1n;
  const unsigned = (mantissa ?? "0").replace(/^[+-]/, "");
  const [whole, fraction = ""] = unsigned.split(".");
  const digits = `${whole ?? "0"}${fraction}`.replace(/^0+(?=\d)/, "") || "0";
  const places = fraction.length - exponent;
  return places >= 0
    ? rational(sign * BigInt(digits), 10n ** BigInt(places))
    : rational(sign * BigInt(digits) * 10n ** BigInt(-places));
}
function add(left, right) {
  return rational(left.numerator * right.denominator + right.numerator * left.denominator, left.denominator * right.denominator);
}
function multiply(left, right) {
  return rational(left.numerator * right.numerator, left.denominator * right.denominator);
}
function divide(left, right) {
  return rational(left.numerator * right.denominator, left.denominator * right.numerator);
}
function lcm(left, right) {
  return (left / gcd(left, right)) * right;
}
function integerize(values) {
  let denominator = 1n;
  for (const value of values) denominator = lcm(denominator, value.denominator);
  const integers = values.map((value) => value.numerator * (denominator / value.denominator));
  const divisor = integers.reduce((current, value) => gcd(current, value), denominator);
  const reduced = integers.map((value) => value / divisor);
  const max = 9000000000000000n;
  if (reduced.some((value) => value > max || value < -max))
    throw new Error("目标系数超过 HiGHS 可安全表达范围。请增大基础值或降低权重。");
  return reduced;
}

// ---------- 规则辅助（移植自 rules chunk） ----------
function isPercentAllowed(sourceAttributeId) {
  return sourceAttributeId !== "source.fate-value";
}
function perStarWheelCost(member, category) {
  return category.isDestiny ? member.perStarWheelCost : 1;
}
function perRankFragmentCost(member, character, category) {
  return category.isDestiny && member.perRankFragmentCostOverride !== undefined
    ? member.perRankFragmentCostOverride
    : category.isDestiny
      ? character.destinyRankFragmentCost
      : character.baseRankFragmentCost;
}
function completedStarUpgrades(rank, star, maxStar) {
  return rank * maxStar + star;
}
function resourceGroupForCharacter(character) {
  return character.rarity === "SSR" && character.isLimited ? "SSR_LIMITED" : character.rarity;
}
function wheelStageLabel(rank, star, maxRank) {
  return rank === maxRank && star === 0 ? "满阶" : `${rank}阶 ${star}星`;
}
function wheelTagNames(wheel, tags) {
  const byId = new Map(tags.map((tag) => [tag.id, tag]));
  return wheel.tagIds.map((id) => byId.get(id)?.name ?? id);
}
function allGainsForResult(workbench, result) {
  const wheelById = new Map(workbench.fateWheels.map((wheel) => [wheel.id, wheel]));
  const gains = [];
  for (const line of result.fateWheels) {
    const wheel = wheelById.get(line.fateWheelId);
    if (!wheel) continue;
    const starUpgrades = completedStarUpgrades(line.rank, line.star, wheel.maxStar);
    for (const gain of wheel.perStarGains)
      for (let step = 0; step < starUpgrades; step += 1) gains.push(gain);
    for (const gain of wheel.perRankGains)
      for (let step = 0; step < line.rank; step += 1) gains.push(gain);
  }
  return gains;
}
function calculateRawAttributes(workbench, gains) {
  const sourceById = new Map(workbench.sourceAttributes.map((source) => [source.id, source]));
  const values = new Map();
  for (const gain of gains) {
    const source = sourceById.get(gain.sourceAttributeId);
    if (!source) throw new Error(`未找到固定源词条：${gain.sourceAttributeId}`);
    if (gain.valueKind === "percent" && !isPercentAllowed(gain.sourceAttributeId))
      throw new Error(`${source.name} 只允许数值类型。`);
    const key = `${gain.sourceAttributeId}\u0000${gain.valueKind}`;
    values.set(key, (values.get(key) ?? 0) + gain.value);
  }
  return [...values]
    .map(([key, value]) => {
      const [sourceAttributeId, valueKind] = key.split("\u0000");
      return { sourceAttributeId, valueKind, value };
    })
    .sort((left, right) => (sourceById.get(left.sourceAttributeId)?.order ?? 0) - (sourceById.get(right.sourceAttributeId)?.order ?? 0) || (left.valueKind === "flat" ? -1 : 1));
}
function calculateIncrements(workbench, baseAttributes, gains) {
  const base = new Map([...baseAttributes].map((item) => [item.metricId, item.value]));
  const flat = new Map(workbench.optimizationMetrics.map((metric) => [metric.id, 0]));
  const percent = new Map(workbench.optimizationMetrics.map((metric) => [metric.id, 0]));
  const sourceById = new Map(workbench.sourceAttributes.map((source) => [source.id, source]));
  for (const gain of calculateRawAttributes(workbench, gains)) {
    const targets = sourceById.get(gain.sourceAttributeId)?.targetMetricIds ?? [];
    const percentMode = sourceById.get(gain.sourceAttributeId)?.percentMode ?? "relative";
    for (const metricId of targets) {
      const target = gain.valueKind === "flat" || percentMode === "points" ? flat : percent;
      target.set(metricId, (target.get(metricId) ?? 0) + gain.value);
    }
  }
  for (const metric of workbench.optimizationMetrics)
    flat.set(metric.id, (flat.get(metric.id) ?? 0) + (base.get(metric.id) ?? 0) * (percent.get(metric.id) ?? 0) / 100);
  return Object.fromEntries(flat);
}

// ---------- 建模 ----------
function variable(prefix, index) {
  return `${prefix}${index}`;
}
function candidateSafe(value) {
  return value.replace(/[^A-Za-z0-9_]/g, "_");
}
function linear(terms) {
  if (!terms.length) return "0";
  return terms
    .map((term, index) => `${index && term.coefficient >= 0 ? "+ " : ""}${term.coefficient} ${term.variable}`)
    .join(" ");
}
function metricScaleById(workbench) {
  const baselines = new Map(workbench.globalSettings.objectiveBaselines.map((item) => [item.metricId, item.value]));
  return new Map(
    workbench.optimizationMetrics.map((metric) => {
      const baseline = baselines.get(metric.id) ?? 1;
      return [metric.id, baseline > 0 ? 1 / baseline : 1];
    })
  );
}
// ---------- 打分模型 v5 ----------
// 总值 V = (F + B) × (1 + (P + E) / 100)
//   F = 升星/升阶带来的「固定值」合计
//   B = 「参考基础属性」里该属性的值
//   P = 升星/升阶带来的「百分比」合计（单位 %）
//   E = 「额外百分比」（仅 5 个元素属性有）
// 元素韧性 / 元素破韧 按需求【不参与打分】。
const SCORING_EXCLUDED_SOURCES = new Set([
  "source.global.element-resilience",
  "source.global.element-resilience-break",
]);

// 「额外百分比」只对元素属性开放（用指标的 group 判定）
function isElementMetric(metric) {
  return metric.group === "元素属性";
}
function normalizeExtraPercents(userPlan) {
  const list = Array.isArray(userPlan?.extraPercents) ? userPlan.extraPercents : [];
  return list.map((entry) => ({ metricId: entry.metricId, value: Number(entry.value) || 0 }));
}

// ---------- 兑换货币（王牌积分 / 命轮金币）----------
// 池化资源：可以兑换「任意同品质角色」的命轮，所以由求解器决定补给谁最划算
function normalizeCurrencies(userPlan) {
  const list = Array.isArray(userPlan?.currencies) ? userPlan.currencies : [];
  return list.map((entry) => ({ currencyId: entry.currencyId, amount: Number(entry.amount) || 0 }));
}
function enabledCurrencies(workbench) {
  return (workbench.globalSettings.currencies ?? []).filter((currency) => currency?.isEnabled);
}
// 用该货币兑换一个命轮的价格；0 / 缺失 = 该品质不可兑换
function currencyRate(currency, resourceGroup) {
  const rate = (currency.rates ?? []).find((entry) => entry.resourceGroup === resourceGroup);
  const cost = Number(rate?.costPerWheel);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

// 把一批收益按「指标」拆成 固定值(flat) 与 百分比(percent，单位 %)
function splitGainsByMetric(workbench, gains) {
  const sourceById = new Map(workbench.sourceAttributes.map((source) => [source.id, source]));
  const flat = new Map(workbench.optimizationMetrics.map((metric) => [metric.id, 0]));
  const percent = new Map(workbench.optimizationMetrics.map((metric) => [metric.id, 0]));
  for (const gain of calculateRawAttributes(workbench, gains)) {
    if (SCORING_EXCLUDED_SOURCES.has(gain.sourceAttributeId)) continue;
    const source = sourceById.get(gain.sourceAttributeId);
    if (!source) continue;
    const percentMode = source.percentMode ?? "relative";
    const bucket = gain.valueKind === "flat" || percentMode === "points" ? flat : percent;
    for (const metricId of source.targetMetricIds) bucket.set(metricId, (bucket.get(metricId) ?? 0) + gain.value);
  }
  return { flat, percent };
}

// 每个指标的完整拆解 + 总值
function calculateValues(workbench, userPlan, gains) {
  const base = new Map((userPlan.baseAttributes ?? []).map((item) => [item.metricId, item.value]));
  const extra = new Map(normalizeExtraPercents(userPlan).map((item) => [item.metricId, item.value]));
  const { flat, percent } = splitGainsByMetric(workbench, gains);
  const parts = {};
  for (const metric of workbench.optimizationMetrics) {
    const F = flat.get(metric.id) ?? 0;
    const B = base.get(metric.id) ?? 0;
    const P = percent.get(metric.id) ?? 0;
    const E = extra.get(metric.id) ?? 0;
    parts[metric.id] = { flat: F, base: B, percent: P, extra: E, value: (F + B) * (1 + (P + E) / 100) };
  }
  return parts;
}

// 分数 = Σ 启用目标 (总值 × 权重 ÷ 优化目标基础值)
function scoreFromParts(workbench, userPlan, parts) {
  const metricScale = metricScaleById(workbench);
  return normalizeScore(
    userPlan.objectives
      .filter((objective) => objective.isEnabled)
      .reduce((total, objective) => total + (parts[objective.metricId]?.value ?? 0) * objective.weight * (metricScale.get(objective.metricId) ?? 0), 0)
  );
}

// 供界面展示：只列出本方案真正影响到的属性
function finalValuesFromParts(workbench, parts) {
  return workbench.optimizationMetrics
    .filter((metric) => {
      const part = parts[metric.id];
      return part && (part.flat !== 0 || part.percent !== 0 || part.extra !== 0);
    })
    .map((metric) => ({ metricId: metric.id, ...parts[metric.id] }));
}

// 数据里的百分比最多 2 位小数；乘 maxStar 后会出现浮点噪声（如 3*0.2=0.6000000000000001），
// 而 fromNumber 是精确转换，噪声会变成天文数字的分母。先归整到 6 位小数。
function cleanNumber(value) {
  return Number.isFinite(value) ? Math.round(value * 1e6) / 1e6 : 0;
}

// 表示 [0, maxValue] 需要多少个 0/1 位
function binaryBitCount(maxValue) {
  let bits = 1;
  while (bits < 64 && Math.pow(2, bits) - 1 < maxValue) bits += 1;
  return bits;
}
function buildModel(request) {
  const { workbench, userPlan } = request;
  const categories = new Map(workbench.wheelCategories.map((category) => [category.id, category]));
  const characters = new Map(workbench.characters.map((character) => [character.id, character]));
  const metricScale = metricScaleById(workbench);
  const extra = new Map(normalizeExtraPercents(userPlan).map((item) => [item.metricId, item.value]));
  const baseByMetric = new Map((userPlan.baseAttributes ?? []).map((item) => [item.metricId, item.value]));
  const enabledObjectives = userPlan.objectives.filter(
    (o) => o.isEnabled && o.weight !== 0 && (metricScale.get(o.metricId) ?? 0) !== 0
  );
  const candidates = [];
  for (const wheel of workbench.fateWheels) {
    const category = categories.get(wheel.wheelCategoryId);
    if (!wheel.isEnabled || !category?.isEnabled || (category.isDestiny && !userPlan.solver.includeDestinyWheel) || !wheel.members.length)
      continue;
    const memberIds = new Set();
    if (wheel.members.some((member) => memberIds.has(member.characterId) || (memberIds.add(member.characterId), false) || !characters.get(member.characterId)?.isEnabled))
      continue;
    const wheelCosts = new Map();
    const fragmentCosts = new Map();
    for (const member of wheel.members) {
      const character = characters.get(member.characterId);
      if (!character) continue;
      wheelCosts.set(character.id, (wheelCosts.get(character.id) ?? 0) + perStarWheelCost(member, category));
      fragmentCosts.set(character.id, (fragmentCosts.get(character.id) ?? 0) + perRankFragmentCost(member, character, category));
    }
    candidates.push({
      index: candidates.length,
      wheel,
      category,
      starSplit: splitGainsByMetric(workbench, wheel.perStarGains),
      rankSplit: splitGainsByMetric(workbench, wheel.perRankGains),
      wheelCosts,
      fragmentCosts,
    });
  }
  const maxRank = workbench.globalSettings.maxRank;
  const lines = [];
  for (const candidate of candidates) {
    const s = variable("s", candidate.index);
    const r = variable("r", candidate.index);
    const max = candidate.wheel.maxStar;
    lines.push(` full_rank_resets_star_${candidate.index}: ${s} + ${max} ${r} <= ${max * maxRank}`);
  }
  const inventory = new Map(userPlan.inventory.map((entry) => [entry.characterId, entry]));
  const ssrWheelChoices = Math.max(0, Math.floor(userPlan.solver.ssrWheelChoices));
  const ssrChoiceCharacterIds = ssrWheelChoices > 0 ? workbench.characters.filter((entry) => entry.isEnabled && entry.rarity === "SSR").map((entry) => entry.id) : [];
  const extraBounds = [];
  const extraIntegers = [];

  // ---------- 兑换货币：池化资源，补任意同品质角色的命轮缺口 ----------
  const currencyAmounts = new Map(normalizeCurrencies(userPlan).map((item) => [item.currencyId, Math.max(0, Math.floor(item.amount))]));
  const currencyList = enabledCurrencies(workbench).filter((currency) => (currencyAmounts.get(currency.id) ?? 0) > 0);
  const currencySlots = new Map(); // 变量名 -> {currencyId,currencyName,characterId,characterName,cost}
  const buyTermsByCharacter = new Map();
  const currencyBudgetTerms = currencyList.map(() => []);
  const enabledCharacterList = workbench.characters.filter((entry) => entry.isEnabled);
  enabledCharacterList.forEach((character, characterIndex) => {
    const group = resourceGroupForCharacter(character);
    currencyList.forEach((currency, currencyIndex) => {
      const cost = currencyRate(currency, group);
      if (!cost) return;
      const name = `w${currencyIndex}_${characterIndex}`;
      currencySlots.set(name, { currencyId: currency.id, currencyName: currency.name, characterId: character.id, characterName: character.name, cost });
      if (!buyTermsByCharacter.has(character.id)) buyTermsByCharacter.set(character.id, []);
      buyTermsByCharacter.get(character.id).push({ variable: name, coefficient: -1 });
      currencyBudgetTerms[currencyIndex].push({ variable: name, coefficient: cost });
    });
  });

  for (const character of enabledCharacterList) {
    const wheels = [];
    const fragments = [];
    for (const candidate of candidates) {
      const wheelCost = candidate.wheelCosts.get(character.id) ?? 0;
      const fragmentCost = candidate.fragmentCosts.get(character.id) ?? 0;
      if (wheelCost) {
        wheels.push({ variable: variable("s", candidate.index), coefficient: wheelCost });
        wheels.push({ variable: variable("r", candidate.index), coefficient: wheelCost * candidate.wheel.maxStar });
      }
      if (fragmentCost) fragments.push({ variable: variable("r", candidate.index), coefficient: fragmentCost });
    }
    if (wheels.length) {
      const choices = ssrChoiceCharacterIds.indexOf(character.id);
      const selector = choices >= 0 ? [{ variable: variable("q", choices), coefficient: -1 }] : [];
      const buys = buyTermsByCharacter.get(character.id) ?? [];
      lines.push(` resource_wheels_${candidateSafe(character.id)}: ${linear([...wheels, ...selector, ...buys])} <= ${Math.max(0, inventory.get(character.id)?.wheelCount ?? 0)}`);
    }
    if (fragments.length && !userPlan.solver.ignoredFragmentGroups.includes(resourceGroupForCharacter(character)))
      lines.push(` resource_fragments_${candidateSafe(character.id)}: ${linear(fragments)} <= ${Math.max(0, inventory.get(character.id)?.fragmentCount ?? 0)}`);
  }
  if (ssrChoiceCharacterIds.length)
    lines.push(` resource_ssr_wheel_choices: ${linear(ssrChoiceCharacterIds.map((_, index) => ({ variable: variable("q", index), coefficient: 1 })))} <= ${ssrWheelChoices}`);
  currencyList.forEach((currency, currencyIndex) => {
    const terms = currencyBudgetTerms[currencyIndex];
    if (!terms.length) return;
    const amount = currencyAmounts.get(currency.id) ?? 0;
    lines.push(` currency_budget_${currencyIndex}: ${linear(terms)} <= ${amount}`);
    for (const term of terms) {
      extraBounds.push(` 0 <= ${term.variable} <= ${amount}`);
      extraIntegers.push(term.variable);
    }
  });

  // ---------- 目标函数 ----------
  // V = (F + B)(1 + E/100) + F·P/100 + B·P/100
  //   F·P/100 为双线性项，用「P̃ = 100P 的二进制展开 + z = F·y」做精确线性化
  const coefficients = new Map();
  const bump = (name, delta) => coefficients.set(name, add(coefficients.get(name) ?? zero, delta));
  let objectiveIndex = 0;
  for (const objective of enabledObjectives) {
    const { metricId } = objective;
    const baseline = workbench.globalSettings.objectiveBaselines.find((entry) => entry.metricId === metricId)?.value ?? 1;
    const scale = baseline > 0 ? divide(fromNumber(objective.weight), fromNumber(baseline)) : fromNumber(objective.weight);
    const E = extra.get(metricId) ?? 0;
    const B = baseByMetric.get(metricId) ?? 0;
    const entityMultiplier = add(fromNumber(1), divide(fromNumber(E), fromNumber(100))); // 1 + E/100
    const flatTerms = [];
    const percentTerms = [];
    let flatMax = 0;
    let percentMax = 0;
    for (const candidate of candidates) {
      const s = variable("s", candidate.index);
      const r = variable("r", candidate.index);
      const fStar = candidate.starSplit.flat.get(metricId) ?? 0;
      const fRank = candidate.rankSplit.flat.get(metricId) ?? 0;
      const pStar = candidate.starSplit.percent.get(metricId) ?? 0;
      const pRank = candidate.rankSplit.percent.get(metricId) ?? 0;
      // 每星收益实际重复 (maxStar*阶 + 星) 次，所以「阶」的系数要含 maxStar 份星收益
      const maxStar = candidate.wheel.maxStar;
      const flatStar = cleanNumber(fStar);
      const flatRank = cleanNumber(maxStar * fStar + fRank);
      const pctStar = cleanNumber(pStar);
      const pctRank = cleanNumber(maxStar * pStar + pRank);
      if (flatStar) flatTerms.push({ variable: s, coefficient: flatStar });
      if (flatRank) flatTerms.push({ variable: r, coefficient: flatRank });
      const pctStarScaled = Math.round(pctStar * 100);
      const pctRankScaled = Math.round(pctRank * 100);
      if (pctStarScaled) percentTerms.push({ variable: s, coefficient: pctStarScaled });
      if (pctRankScaled) percentTerms.push({ variable: r, coefficient: pctRankScaled });
      flatMax += Math.abs(flatStar) * candidate.wheel.maxStar + Math.abs(flatRank) * maxRank;
      percentMax += pctStarScaled * candidate.wheel.maxStar + pctRankScaled * maxRank;
      const linearStar = add(multiply(entityMultiplier, fromNumber(flatStar)), divide(multiply(fromNumber(B), fromNumber(pctStar)), fromNumber(100)));
      const linearRank = add(multiply(entityMultiplier, fromNumber(flatRank)), divide(multiply(fromNumber(B), fromNumber(pctRank)), fromNumber(100)));
      if (linearStar.numerator !== 0n) bump(s, multiply(scale, linearStar));
      if (linearRank.numerator !== 0n) bump(r, multiply(scale, linearRank));
    }
    if (percentTerms.length && flatTerms.length && percentMax > 0 && flatMax > 0) {
      const bits = binaryBitCount(percentMax);
      const tag = `m${objectiveIndex}`;
      const bitTerms = [];
      const negatives = flatTerms.map((term) => ({ variable: term.variable, coefficient: -term.coefficient }));
      for (let k = 0; k < bits; k += 1) {
        const power = Math.pow(2, k);
        const y = `y${tag}_${k}`;
        const z = `z${tag}_${k}`;
        extraBounds.push(` 0 <= ${y} <= 1`);
        extraBounds.push(` 0 <= ${z} <= ${flatMax}`);
        extraIntegers.push(y, z);
        lines.push(` product_${tag}_${k}_a: ${linear([{ variable: z, coefficient: 1 }, ...negatives])} <= 0`);
        lines.push(` product_${tag}_${k}_b: ${linear([{ variable: z, coefficient: 1 }, { variable: y, coefficient: -flatMax }])} <= 0`);
        bitTerms.push({ variable: y, coefficient: -power });
        bump(z, multiply(scale, divide(fromNumber(power), fromNumber(10000))));
      }
      lines.push(` product_${tag}_bits: ${linear([...percentTerms, ...bitTerms])} = 0`);
      objectiveIndex += 1;
    }
  }
  const names = [...coefficients.keys()];
  const integers = integerize(names.length ? names.map((name) => coefficients.get(name)) : [zero]);
  const objective = [];
  names.forEach((name, index) => {
    const value = Number(integers[index] ?? 0n);
    if (value) objective.push({ variable: name, coefficient: value });
  });
  return { candidates, maxRank, lines, objective, extraBounds, extraIntegers, ssrChoiceCharacterIds, ssrWheelChoices, currencySlots };
}
function makeLp(model, sense) {
  const bounds = [];
  const integers = [];
  for (const candidate of model.candidates) {
    bounds.push(` 0 <= ${variable("s", candidate.index)} <= ${candidate.wheel.maxStar}`);
    bounds.push(` 0 <= ${variable("r", candidate.index)} <= ${model.maxRank}`);
    integers.push(variable("s", candidate.index), variable("r", candidate.index));
  }
  for (let index = 0; index < model.ssrChoiceCharacterIds.length; index += 1) {
    bounds.push(` 0 <= ${variable("q", index)} <= ${model.ssrWheelChoices}`);
    integers.push(variable("q", index));
  }
  for (const bound of model.extraBounds ?? []) bounds.push(bound);
  for (const name of model.extraIntegers ?? []) integers.push(name);
  const objective = model.objective.length ? linear(model.objective) : "0";
  return [
    sense === "min" ? "Minimize" : "Maximize",
    " objective: " + objective,
    "Subject To",
    ...model.lines,
    "Bounds",
    ...bounds,
    "Generals",
    ...integers.map((item) => ` ${item}`),
    "End",
    "",
  ].join("\n");
}

// ---------- 结果解析与校验 ----------
function normalizeScore(value) {
  return Number(value.toFixed(12));
}
function isValidWheelStage(rank, star, maxStar, maxRank) {
  return Number.isInteger(rank) && Number.isInteger(star) && rank >= 0 && rank <= maxRank && star >= 0 && star <= maxStar && !(rank === maxRank && star !== 0);
}
function verifySolution(request, result) {
  const errors = [];
  const { workbench, userPlan } = request;
  const wheelById = new Map(workbench.fateWheels.map((wheel) => [wheel.id, wheel]));
  const characterById = new Map(workbench.characters.map((character) => [character.id, character]));
  const categoryById = new Map(workbench.wheelCategories.map((category) => [category.id, category]));
  const inventory = new Map(userPlan.inventory.map((item) => [item.characterId, item]));
  const wheelUse = new Map();
  const fragmentUse = new Map();
  const seen = new Set();
  for (const selected of result.fateWheels) {
    if (seen.has(selected.fateWheelId)) errors.push(`命轮重复：${selected.fateWheelId}`);
    seen.add(selected.fateWheelId);
    const wheel = wheelById.get(selected.fateWheelId);
    if (!wheel) { errors.push(`命轮不存在：${selected.fateWheelId}`); continue; }
    const category = categoryById.get(wheel.wheelCategoryId);
    if (!category) { errors.push(`轮盘类别不存在：${wheel.wheelCategoryId}`); continue; }
    if ((!userPlan.solver.includeDestinyWheel && category.isDestiny) || !wheel.isEnabled || !category.isEnabled)
      errors.push(`不应被求解的命轮：${wheel.name}`);
    if (!isValidWheelStage(selected.rank, selected.star, wheel.maxStar, workbench.globalSettings.maxRank))
      errors.push(`阶星状态无效：${wheel.name}`);
    const starUpgrades = completedStarUpgrades(selected.rank, selected.star, wheel.maxStar);
    for (const member of wheel.members) {
      const character = characterById.get(member.characterId);
      if (!character) { errors.push(`伙伴不存在：${member.characterId}`); continue; }
      wheelUse.set(character.id, (wheelUse.get(character.id) ?? 0) + starUpgrades * perStarWheelCost(member, category));
      fragmentUse.set(character.id, (fragmentUse.get(character.id) ?? 0) + selected.rank * perRankFragmentCost(member, character, category));
    }
  }
  // 兑换货币：校验预算，并把买到的命轮算进该角色的可用量
  const currencyById = new Map(enabledCurrencies(workbench).map((currency) => [currency.id, currency]));
  const planCurrencyAmounts = new Map(normalizeCurrencies(userPlan).map((item) => [item.currencyId, Math.max(0, Math.floor(item.amount))]));
  const boughtByCharacter = new Map();
  const spentByCurrency = new Map();
  for (const usage of result.currencyUsage ?? []) {
    const currency = currencyById.get(usage.currencyId);
    const character = characterById.get(usage.characterId);
    if (!currency || !character) { errors.push(`兑换记录无效：${usage.currencyId}`); continue; }
    const cost = currencyRate(currency, resourceGroupForCharacter(character));
    if (!cost) { errors.push(`该货币不能兑换这个品质：${currency.name} × ${character.name}`); continue; }
    spentByCurrency.set(currency.id, (spentByCurrency.get(currency.id) ?? 0) + cost * usage.count);
    boughtByCharacter.set(character.id, (boughtByCharacter.get(character.id) ?? 0) + usage.count);
  }
  for (const [currencyId, spent] of spentByCurrency) {
    const amount = planCurrencyAmounts.get(currencyId) ?? 0;
    if (spent > amount) errors.push(`${currencyById.get(currencyId)?.name ?? currencyId}不足：需要 ${spent}，拥有 ${amount}`);
  }
  const availableWheels = (id) => Math.max(0, inventory.get(id)?.wheelCount ?? 0) + (boughtByCharacter.get(id) ?? 0);
  const ssrChoiceUse = workbench.characters.filter((character) => character.rarity === "SSR").reduce((total, character) => total + Math.max(0, (wheelUse.get(character.id) ?? 0) - availableWheels(character.id)), 0);
  for (const [id, used] of wheelUse)
    if (characterById.get(id)?.rarity !== "SSR" && used > availableWheels(id))
      errors.push(`命轮不足：${id}`);
  if (ssrChoiceUse > Math.max(0, userPlan.solver.ssrWheelChoices)) errors.push("SSR命轮自选不足");
  for (const [id, used] of fragmentUse) {
    const character = characterById.get(id);
    if (character && userPlan.solver.ignoredFragmentGroups.includes(resourceGroupForCharacter(character))) continue;
    if (used > Math.max(0, inventory.get(id)?.fragmentCount ?? 0)) errors.push(`碎片不足：${id}`);
  }
  const gains = allGainsForResult(workbench, result);
  const parts = calculateValues(workbench, userPlan, gains);
  const score = scoreFromParts(workbench, userPlan, parts);
  return { valid: errors.length === 0, errors, score, values: parts, finalValues: finalValuesFromParts(workbench, parts), finalAttributes: calculateRawAttributes(workbench, gains), ssrChoiceUse, currencySpent: Object.fromEntries(spentByCurrency) };
}
function resultFromValues(request, values, status, isProvenOptimal, startedAt, elapsed) {
  const model = buildModel(request);
  const wheels = model.candidates
    .map((candidate) => ({
      fateWheelId: candidate.wheel.id,
      star: values.get(variable("s", candidate.index)) ?? 0,
      rank: values.get(variable("r", candidate.index)) ?? 0,
    }))
    .filter((entry) => entry.star || entry.rank);
  // 兑换货币实际买给了谁（变量名 w<货币序号>_<角色序号>）
  const currencyUsage = [];
  for (const [name, count] of values) {
    const slot = model.currencySlots.get(name);
    if (slot && count > 0) currencyUsage.push({ currencyId: slot.currencyId, currencyName: slot.currencyName, characterId: slot.characterId, characterName: slot.characterName, count, cost: slot.cost * count });
  }
  currencyUsage.sort((a, b) => (a.currencyId === b.currencyId ? b.cost - a.cost : a.currencyId < b.currencyId ? -1 : 1));
  const result = {
    status,
    algorithmId: "solver.highs-mip",
    startedAt,
    completedAt: new Date().toISOString(),
    elapsedMilliseconds: Math.round(elapsed),
    isProvenOptimal,
    fateWheels: wheels,
    currencyUsage,
    finalAttributes: [],
    finalValues: [],
    stageModelVersion: STAGE_MODEL_VERSION,
  };
  const gains = allGainsForResult(request.workbench, result);
  const parts = calculateValues(request.workbench, request.userPlan, gains);
  result.objectiveScore = scoreFromParts(request.workbench, request.userPlan, parts);
  result.finalValues = finalValuesFromParts(request.workbench, parts);
  return result;
}

function readSettings(userPlan) {
  const values = new Map(userPlan.solver.parameters.map((item) => [item.key, item.value]));
  const num = (key, fallback, min, max) => {
    const value = Number(values.get(key));
    return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : fallback;
  };
  return {
    timeLimitSeconds: num("time_limit_seconds", 300, 1, 1800),
    threads: num("threads", 0, 0, 128),
    randomSeed: num("random_seed", 1, 0, 2147483647),
  };
}

function mapStatus(status) {
  const s = String(status).toLowerCase();
  if (s.includes("optimal")) return "optimal";
  if (s.includes("time") || s.includes("limit")) return "time_limit";
  if (s.includes("infeasible")) return "infeasible";
  if (s.includes("feasible")) return "feasible";
  return "failed";
}

// ---------- 高层求解入口 ----------
export async function solveWorkbench(workbench, userPlan, onProgress) {
  const startedAt = new Date();
  const t0 = performance.now();
  const settings = readSettings(userPlan);
  onProgress?.("构建整数规划模型");
  const model = buildModel({ workbench, userPlan });
  if (!model.candidates.length || !model.objective.length) {
    const emptyParts = calculateValues(workbench, userPlan, []);
    return { status: "optimal", algorithmId: "solver.highs-mip", startedAt: startedAt.toISOString(), completedAt: new Date().toISOString(), elapsedMilliseconds: 0, objectiveScore: scoreFromParts(workbench, userPlan, emptyParts), isProvenOptimal: true, fateWheels: [], currencyUsage: [], ssrChoiceUsed: 0, finalAttributes: [], finalValues: finalValuesFromParts(workbench, emptyParts), stageModelVersion: STAGE_MODEL_VERSION };
  }
  const lp = makeLp(model, "max");
  onProgress?.("HiGHS 正在求解");
  const highs = await getHighs();
  const options = {
    threads: settings.threads,
    random_seed: settings.randomSeed,
    mip_rel_gap: 0,
    mip_abs_gap: 0,
    mip_feasibility_tolerance: 1e-8,
    time_limit: settings.timeLimitSeconds,
    output_flag: false,
  };
  const sol = highs.solve(lp, options);
  const status = mapStatus(sol.Status);
  if (status === "infeasible") throw new Error("HiGHS 报告模型无可行解；全零方案本应可行。");
  if (status === "failed") throw new Error("HiGHS 求解失败。");
  const values = new Map();
  for (const [name, col] of Object.entries(sol.Columns ?? {})) {
    if (/^[srq]\d+$/.test(name) || /^w\d+_\d+$/.test(name)) values.set(name, Math.round(col.Primal));
  }
  const isOptimal = status === "optimal";
  const result = resultFromValues({ workbench, userPlan }, values, status, isOptimal, startedAt.toISOString(), performance.now() - t0);
  const verification = verifySolution({ workbench, userPlan }, result);
  if (!verification.valid) throw new Error(`HiGHS 结果独立校验失败：${verification.errors.join("；")}`);
  result.objectiveScore = verification.score;
  result.finalAttributes = verification.finalAttributes;
  result.finalValues = verification.finalValues;
  // 实际用掉的自选 / 货币（由独立校验按"最小需求"重算，与求解器内部变量无关）
  result.ssrChoiceUsed = verification.ssrChoiceUse;
  return result;
}

// 提供给 UI 的展示辅助
export function formatNumber(value, digits = 2) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}
export function resultDisplayHelpers(workbench) {
  const wheelById = new Map(workbench.fateWheels.map((w) => [w.id, w]));
  const categoryById = new Map(workbench.wheelCategories.map((c) => [c.id, c]));
  const characterById = new Map(workbench.characters.map((c) => [c.id, c]));
  const sourceById = new Map(workbench.sourceAttributes.map((s) => [s.id, s]));
  const metricById = new Map(workbench.optimizationMetrics.map((m) => [m.id, m]));
  const tagById = new Map(workbench.wheelTags.map((t) => [t.id, t]));
  return { wheelById, categoryById, characterById, sourceById, metricById, tagById, wheelStageLabel, wheelTagNames };
}
