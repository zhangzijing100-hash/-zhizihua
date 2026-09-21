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

  return changed ? next : stored;
}

export default upgradeWorkbench;
