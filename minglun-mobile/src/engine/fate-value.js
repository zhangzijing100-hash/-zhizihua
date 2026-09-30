// 命轮值（游戏内 FortuneVal / wheelValue）计算与校验
//
// 规则来源：从《龙族：卡塞尔之门》客户端 APK 提取的数据表
//   data/bny/drc.gsp.fortunewheel.confbean.FortuneWheelEntryLevelCfg.bny
// 字段链路：entryId → stage2Bean → star2Bean → wheelValue
// 代码侧：lua/modules/wheeloffortune/wheeloffortuneutility.lua
//   → GetWheelOfFortuneEntryAccumulateFortuneVal
//
// ── 普通盘（创始 / 物质 / 执行）──────────────────────────────
//     命轮值 = R5( Σbase × m(n) )
//       base : UR 100 / SSR 30 / SR 20 / R 10
//       n    : 该盘的成员数
//       m(n) : 1, 5/4, 4/3, 17/12, 3/2
//       R5   : 银行家舍入（四舍六入五取偶）到 5 的倍数
//     实测 302 / 315 = 95.9%
//
// ── 宿命之轮 ────────────────────────────────────────────
//     命轮值 = M(n) × ( Σbase / 10 + t )
//       M(n) : 10, 12, 13, 14, 15
//       t    : 非负整数，随成员品质上升（n=5 时 3..6）
//     实测 170 / 170 盘均满足 M(n) 整除（100%），但 t 尚无法由成员构成唯一确定，
//     因此宿命之轮的命轮值不做预测，只做「整除性」校验。

// ── 官方数据核对 ──────────────────────────────────────────
// 已从客户端 data/bny/drc.gsp.fortunewheel.confbean.FortuneWheelEntryLevelCfg.bny
// （原始 data.bin 偏移 37015568，大端 int32）解出 475 条官方 wheelValue 并打包为
// ./data/officialFateValues.js。经逐条比对：**数据库中 475 条全部与官方一致（0 不一致）**。
// 因此本文件的公式只用于「估算新增盘」，绝不能用来覆盖已有盘的数据。
import officialFateValues from "../data/officialFateValues.js";

export const OFFICIAL_FATE_VALUES = officialFateValues;

/** 取官方命轮值；无官方数据时返回 null */
export function officialFateValue(entryId) {
  const v = OFFICIAL_FATE_VALUES[String(entryId)];
  return typeof v === "number" ? v : null;
}

export const FATE_VALUE_SOURCE_ID = "source.fate-value";

export const RARITY_BASE = { UR: 100, SSR: 30, SSR_LIMITED: 30, SR: 20, R: 10 };

/** 普通盘成员数 → 倍率 m(n) */
export const NORMAL_MULTIPLIER = { 1: 1, 2: 5 / 4, 3: 4 / 3, 4: 17 / 12, 5: 3 / 2 };

/** 宿命之轮成员数 → M(n) */
export const DESTINY_STEP = { 1: 10, 2: 12, 3: 13, 4: 14, 5: 15 };

/**
 * 公式无法解释、但**确认都是游戏真实数据**的盘。
 *
 * 其中 11 个已由客户端官方配置表逐条确证（与数据库完全一致），
 * 另 2 个（剑道会友 / 朝雾内庭）是手工录入且已确认无误。
 * ⇒ 这 13 个盘说明 `R5(Σbase × m(n))` 只是 **95.9% 的近似公式**，并非完整规律。
 * ⇒ **任何情况下都不得用公式覆盖它们。**
 */
export const FORMULA_DEVIATIONS = [
  // 含 UR、n=3：官方值比公式低 5
  "罪与刃的孤途", "傀儡实验", "雨月物语", "不坠的星群", "终焉博弈", "三女巫的预言", "格陵兰残响",
  // n=4 纯 SSR：官方 225（同组合另有 12 个是 170）
  "红妆怀刃", "极速狂花", "锐刃绮梦",
  // 其他孤例
  "黑影之花", "朝雾内庭", "剑道会友",
];
/** @deprecated 旧名，保留兼容 */
export const OFFICIAL_DEVIATIONS = FORMULA_DEVIATIONS;
/** @deprecated 旧名，保留兼容 */
export const KNOWN_ANOMALY_NAMES = FORMULA_DEVIATIONS;

/**
 * 银行家舍入（round half to even）到 5 的倍数。
 * 例：37.5→40、62.5→60、162.5→160、213.33→215、25→25
 */
export function bankersRound5(x) {
  if (!Number.isFinite(x)) return x;
  const r = x / 5;
  const f = Math.floor(r);
  const d = r - f;
  let n;
  if (Math.abs(d - 0.5) < 1e-9) n = f % 2 === 0 ? f : f + 1; // .5 取偶
  else n = Math.round(r);
  return n * 5;
}

/** 保底：普通盘以外（或成员数为 0/超出 5）时不做预测 */
export function normalMultiplier(n) {
  return NORMAL_MULTIPLIER[n] ?? null;
}
export function destinyStep(n) {
  return DESTINY_STEP[n] ?? null;
}

/**
 * 计算普通盘的命轮值。
 * @param {string[]} rarities 每个成员的品质（UR / SSR / SSR_LIMITED / SR / R）
 * @returns {{ value:number, sumBase:number, multiplier:number, raw:number } | null}
 */
export function computeNormalFateValue(rarities) {
  const n = rarities?.length ?? 0;
  const m = normalMultiplier(n);
  if (!m) return null;
  let sumBase = 0;
  for (const r of rarities) {
    const b = RARITY_BASE[r];
    if (b === undefined) return null;
    sumBase += b;
  }
  const raw = sumBase * m;
  return { value: bankersRound5(raw), sumBase, multiplier: m, raw };
}

/**
 * 宿命之轮：仅校验「命轮值能被 M(n) 整除」，并反推 t。
 * @returns {{ step:number, divisible:boolean, t:number|null } | null}
 */
export function analyzeDestinyFateValue(rarities, value) {
  const n = rarities?.length ?? 0;
  const step = destinyStep(n);
  if (!step || !Number.isFinite(value)) return null;
  let sumBase = 0;
  for (const r of rarities) sumBase += RARITY_BASE[r] ?? 0;
  const divisible = value % step === 0;
  return { step, divisible, t: divisible ? value / step - sumBase / 10 : null };
}

/** 从 workbench 取某盘的成员品质列表 */
export function raritiesOf(wheel, characterById) {
  return (wheel?.members ?? []).map((m) => {
    const c = characterById.get(m.characterId);
    if (!c) return "?";
    return c.rarity === "SSR" && c.isLimited ? "SSR_LIMITED" : c.rarity;
  });
}

/** 取该盘存储的命轮值（per-star 与 per-rank 应一致） */
export function storedFateValue(wheel) {
  const pick = (arr) => arr?.find((g) => g.sourceAttributeId === FATE_VALUE_SOURCE_ID)?.value ?? null;
  return { perStar: pick(wheel?.perStarGains), perRank: pick(wheel?.perRankGains) };
}

export function isDestinyCategory(workbench, categoryId) {
  return !!workbench.wheelCategories?.find((c) => c.id === categoryId)?.isDestiny;
}

/**
 * 全库校验。
 * @returns {{
 *   normal:{ total:number, matched:number, rate:number, mismatches:Array },
 *   destiny:{ total:number, divisible:number, nonDivisible:Array, tRange:[number,number]|null }
 * }}
 */
export function auditWorkbench(workbench) {
  const characterById = new Map((workbench.characters ?? []).map((c) => [c.id, c]));
  const normal = { total: 0, matched: 0, rate: 0, mismatches: [] };
  const destiny = { total: 0, divisible: 0, nonDivisible: [], tRange: null };
  const official = { checked: 0, matched: 0, mismatches: [], missing: [] };

  for (const wheel of workbench.fateWheels ?? []) {
    const rarities = raritiesOf(wheel, characterById);
    const { perStar } = storedFateValue(wheel);
    if (perStar === null) continue;
    const destinyCat = isDestinyCategory(workbench, wheel.wheelCategoryId);

    // 与官方表核对（不分普通/宿命）
    const ov = officialFateValue(wheel.gameEntryId);
    if (ov === null) {
      if (wheel.gameEntryId) official.missing.push({ id: wheel.id, name: wheel.name, gameEntryId: wheel.gameEntryId });
    } else {
      official.checked += 1;
      if (ov === perStar) official.matched += 1;
      else official.mismatches.push({ id: wheel.id, name: wheel.name, gameEntryId: wheel.gameEntryId, actual: perStar, official: ov });
    }

    if (destinyCat) {
      destiny.total += 1;
      const info = analyzeDestinyFateValue(rarities, perStar);
      if (info?.divisible) {
        destiny.divisible += 1;
        if (info.t !== null) {
          if (!destiny.tRange) destiny.tRange = [info.t, info.t];
          else destiny.tRange = [Math.min(destiny.tRange[0], info.t), Math.max(destiny.tRange[1], info.t)];
        }
      } else {
        destiny.nonDivisible.push({ id: wheel.id, name: wheel.name, value: perStar, n: rarities.length });
      }
      continue;
    }

    normal.total += 1;
    const calc = computeNormalFateValue(rarities);
    const expected = calc ? calc.value : null;
    if (expected !== null && expected === perStar) {
      normal.matched += 1;
    } else {
      normal.mismatches.push({
        id: wheel.id,
        name: wheel.name,
        categoryId: wheel.wheelCategoryId,
        n: rarities.length,
        rarities,
        sumBase: calc?.sumBase ?? null,
        raw: calc?.raw ?? null,
        actual: perStar,
        expected,
        delta: expected === null ? null : perStar - expected,
        // 已被官方数据确证为真实值 —— 不可用公式覆盖
        officialConfirmed: officialFateValue(wheel.gameEntryId) === perStar,
        // 属于「公式不适用」清单（官方确证 或 手工确认无误）
        formulaDeviation: FORMULA_DEVIATIONS.includes(wheel.name),
        known: FORMULA_DEVIATIONS.includes(wheel.name),
      });
    }
  }
  normal.rate = normal.total ? normal.matched / normal.total : 0;
  return { normal, destiny, official };
}

/**
 * 用公式补全**缺失**的命轮值（同时补 per-star 与 per-rank）。
 *
 * ⚠️ 安全默认：**只在完全没有命轮值时才写入**。
 * 已有数值的盘一律不动 —— 经官方表逐条核对，数据库与游戏 100% 一致，
 * 且公式只是 95.9% 的近似（已有 13 个盘证明公式不适用），覆盖只会破坏正确数据。
 *
 * @param {object} workbench
 * @param {{ force?: boolean }} [opts] force=true 时连已有数值也覆盖（危险，UI 不暴露）
 * @returns {{ workbench:object, changes:Array<{name:string,from:number|null,to:number}> }}
 */
export function applyFateValueFixes(workbench, { force = false } = {}) {
  const characterById = new Map((workbench.characters ?? []).map((c) => [c.id, c]));
  const changes = [];
  const fateWheels = (workbench.fateWheels ?? []).map((wheel) => {
    if (isDestinyCategory(workbench, wheel.wheelCategoryId)) return wheel;
    const { perStar, perRank } = storedFateValue(wheel);
    if (!force && (perStar !== null || perRank !== null)) return wheel;   // 已有数值：不动
    const rarities = raritiesOf(wheel, characterById);
    const calc = computeNormalFateValue(rarities);
    if (!calc) return wheel;
    if (perStar === calc.value && perRank === calc.value) return wheel;   // 已经等于公式值
    changes.push({ name: wheel.name, from: perStar, to: calc.value });
    const setVal = (arr) => {
      const list = arr ?? [];
      if (list.some((g) => g.sourceAttributeId === FATE_VALUE_SOURCE_ID)) {
        return list.map((g) => (g.sourceAttributeId === FATE_VALUE_SOURCE_ID ? { ...g, value: calc.value } : g));
      }
      return [...list, { sourceAttributeId: FATE_VALUE_SOURCE_ID, valueKind: "flat", value: calc.value }];
    };
    return { ...wheel, perStarGains: setVal(wheel.perStarGains), perRankGains: setVal(wheel.perRankGains) };
  });
  return { workbench: { ...workbench, fateWheels }, changes };
}

/** 为「新增关系盘」草稿算默认命轮值（普通盘可用，宿命之轮返回 null） */
export function suggestFateValueFor(workbench, categoryId, memberIds) {
  if (isDestinyCategory(workbench, categoryId)) return null;
  const characterById = new Map((workbench.characters ?? []).map((c) => [c.id, c]));
  const rarities = (memberIds ?? []).map((id) => {
    const c = characterById.get(id);
    return c ? (c.rarity === "SSR" && c.isLimited ? "SSR_LIMITED" : c.rarity) : "?";
  });
  const calc = computeNormalFateValue(rarities);
  return calc ? calc.value : null;
}
