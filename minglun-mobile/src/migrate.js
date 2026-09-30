// 数据库补齐（只增不改）
//
// 手机里保存的数据库（localStorage）会覆盖 APK 内置数据，所以新版本往内置数据里
// 加的字段会「缺」在旧库里 —— 结果是新功能整块不显示（兑换货币块直接不渲染、
// 「额外百分比」输入框不出现、全属性% 不提升元素值）。
//
// 这里做一次只增不改的补齐：只填缺失项，不动用户自己填的任何数值。
export function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function upgradeWorkbench(stored, bundled) {
  if (!isPlainObject(stored) || !isPlainObject(bundled) || stored === bundled) return stored;
  let changed = false;
  const next = { ...stored };

  // 1) 兑换货币单价表
  const bundledCurrencies = bundled.globalSettings?.currencies;
  if (Array.isArray(bundledCurrencies) && bundledCurrencies.length && !next.globalSettings?.currencies?.length) {
    next.globalSettings = { ...next.globalSettings, currencies: bundledCurrencies };
    changed = true;
  }

  // 2) 「额外百分比」模板（元素总值公式用）
  const template = next.defaults?.userBaseAttributeTemplate;
  const bundledExtra = bundled.defaults?.userBaseAttributeTemplate?.extraPercents;
  if (isPlainObject(template) && Array.isArray(bundledExtra) && bundledExtra.length && !template.extraPercents?.length) {
    next.defaults = { ...next.defaults, userBaseAttributeTemplate: { ...template, extraPercents: bundledExtra } };
    changed = true;
  }

  // 3) 「全属性%」的目标指标：必须与内置数据完全一致
  //    （曾一度被扩到 9 个指标 / 含 5 元素，属于错误映射，这里会把它纠正回 4 个基础属性）
  const bundledAllStats = bundled.sourceAttributes?.find((s) => s.id === "source.global.all-stats");
  if (bundledAllStats && Array.isArray(next.sourceAttributes)) {
    const current = next.sourceAttributes.find((s) => s.id === "source.global.all-stats");
    const want = bundledAllStats.targetMetricIds ?? [];
    if (current && JSON.stringify(current.targetMetricIds ?? []) !== JSON.stringify(want)) {
      next.sourceAttributes = next.sourceAttributes.map((s) =>
        s.id === "source.global.all-stats" ? { ...s, targetMetricIds: [...want] } : s
      );
      changed = true;
    }
  }

  // 4) 关系盘的 gameEntryId 与 order：早期数据里 5 个 id 写错、5 个丢了（0），
  //    连带着这些行的 order 落在了别的轮的区间里 —— 结果是它们排不进游戏的盘序。
  //    按名字从内置数据里把 id 找回来，order 也照内置数据对齐。
  //    （内置数据的这两列由 game-dump/gen-wheel-order.mjs 对着游戏配置校过）
  const bundledWheels = bundled.fateWheels;
  if (Array.isArray(bundledWheels) && Array.isArray(next.fateWheels)) {
    const bundledIdSet = new Set(bundledWheels.map((w) => w.gameEntryId).filter(Boolean));
    const idByName = new Map();
    for (const w of bundledWheels) if (w.gameEntryId) idByName.set(w.name, w.gameEntryId);
    const bundledByEntry = new Map(bundledWheels.map((w) => [w.gameEntryId, w]));
    let wheelTouched = false;
    const patched = next.fateWheels.map((w) => {
      let entry = w.gameEntryId;
      if (!entry || !bundledIdSet.has(entry)) {
        const want = idByName.get(w.name);
        if (want) entry = want;
      }
      const ref = bundledByEntry.get(entry);
      const order = ref ? ref.order : w.order;
      if (entry === w.gameEntryId && order === w.order) return w;
      wheelTouched = true;
      return { ...w, gameEntryId: entry, order };
    });
    if (wheelTouched) {
      next.fateWheels = patched;
      changed = true;
    }
  }

  // 5) 四个「轮」的先后：早期元数据写的是 创始 < 物质 < 执行 < 宿命，
  //    但游戏里是 物质 → 执行 → 创始 → 宿命（依据 cfortunewheelcfg.bny 里段的先后）。
  //    这个字段目前只影响展示，照内置数据对齐即可。
  const bundledCats = bundled.wheelCategories;
  if (Array.isArray(bundledCats) && Array.isArray(next.wheelCategories)) {
    const orderById = new Map(bundledCats.map((c) => [c.id, c.order]));
    let catTouched = false;
    const patchedCats = next.wheelCategories.map((c) => {
      const want = orderById.get(c.id);
      if (want === undefined || want === c.order) return c;
      catTouched = true;
      return { ...c, order: want };
    });
    if (catTouched) {
      next.wheelCategories = patchedCats;
      changed = true;
    }
  }

  return changed ? next : stored;
}

export default upgradeWorkbench;
