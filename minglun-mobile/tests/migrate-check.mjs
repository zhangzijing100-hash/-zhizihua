// 数据库补齐验证：用你真实导出的旧数据库（缺 currencies / extraPercents）当输入
// 运行： node tests/migrate-check.mjs
import { readFileSync } from "node:fs";
import { upgradeWorkbench } from "../src/core/migrate.js";

const read = (rel) => JSON.parse(readFileSync(new URL(rel, import.meta.url), "utf8"));
const bundled = read("../src/data/workbench.json");
const oldExportRaw = read("../../_archive/db-snapshots/栀子花数据库-2026-09-15.json");
const oldExport = oldExportRaw.workbench ?? oldExportRaw;

console.log("输入 = 你导出的旧库:", oldExportRaw.format ?? "(裸 workbench)");
console.log("  角色/盘:", oldExport.characters.length, "/", oldExport.fateWheels.length);
console.log("  currencies      :", oldExport.globalSettings.currencies?.length ?? "❌ 无");
console.log("  extraPercents   :", oldExport.defaults.userBaseAttributeTemplate.extraPercents ? "有" : "❌ 无");
const oldAllStats = oldExport.sourceAttributes.find((s) => s.id === "source.global.all-stats");
console.log("  全属性% 目标数   :", oldAllStats.targetMetricIds.length);

const upgraded = upgradeWorkbench(oldExport, bundled);
console.log("\n补齐后:");
console.log("  是新对象（会被写回本机）:", upgraded !== oldExport);
console.log("  currencies      :", upgraded.globalSettings.currencies?.length, upgraded.globalSettings.currencies?.map((c) => c.name).join(" / "));
console.log("  extraPercents   :", upgraded.defaults.userBaseAttributeTemplate.extraPercents?.length, "项");
const newAllStats = upgraded.sourceAttributes.find((s) => s.id === "source.global.all-stats");
console.log("  全属性% 目标数   :", newAllStats.targetMetricIds.length, newAllStats.targetMetricIds.map((m) => m.replace("metric.global.", "")).join(","));

// 功能是否真的会出现
const currencyList = (upgraded.globalSettings.currencies ?? []).filter((c) => c.isEnabled);
console.log("  → 「兑换资源」区块会显示:", currencyList.length > 0 ? "✅" : "❌");
console.log("  → 「额外%」输入框会出现  :", (upgraded.defaults.userBaseAttributeTemplate.extraPercents ?? []).length > 0 ? "✅" : "❌");

// 关键：不能动用户自己的数据
const checks = [];
checks.push(["角色数不变 63", upgraded.characters.length === 63]);
checks.push(["盘数不变 485", upgraded.fateWheels.length === 485]);
checks.push(["自定义角色仍在", upgraded.characters.some((c) => c.id === "character.custom.3c83ca6f")]);
const huang = upgraded.fateWheels.find((w) => w.id === "fate-wheel.custom.fecd585a");
checks.push(["皇命双生 收益/星 未被改", JSON.stringify(huang.perStarGains) === JSON.stringify(oldExport.fateWheels.find((w) => w.id === "fate-wheel.custom.fecd585a").perStarGains)]);
checks.push(["皇命双生 收益/阶 未被改", JSON.stringify(huang.perRankGains) === JSON.stringify(oldExport.fateWheels.find((w) => w.id === "fate-wheel.custom.fecd585a").perRankGains)]);
checks.push(["角色碎片成本未被改", JSON.stringify(upgraded.characters) === JSON.stringify(oldExport.characters)]);
checks.push(["求解器参数未被改", JSON.stringify(upgraded.defaults.solverAlgorithms) === JSON.stringify(oldExport.defaults.solverAlgorithms)]);
checks.push(["globalSettings.maxRank 未被改", upgraded.globalSettings.maxRank === oldExport.globalSettings.maxRank]);

// 幂等 / 无变化时返回原对象
const again = upgradeWorkbench(upgraded, bundled);
checks.push(["再次补齐返回同一对象（幂等）", again === upgraded]);
const fresh = upgradeWorkbench(bundled, bundled);
checks.push(["已是最新时不动（同一对象）", fresh === bundled]);

// 纠正：已经拿到「9 个目标」错误映射的设备，必须被改回 4 个基础属性
const badTargets = [...bundled.sourceAttributes.find((s) => s.id === "source.global.all-stats").targetMetricIds,
                    "metric.global.fire", "metric.global.wind", "metric.global.water", "metric.global.earth", "metric.global.spirit"];
const misMigrated = JSON.parse(JSON.stringify(oldExport));
misMigrated.sourceAttributes = misMigrated.sourceAttributes.map((s) =>
  s.id === "source.global.all-stats" ? { ...s, targetMetricIds: [...badTargets] } : s);
const fixed = upgradeWorkbench(misMigrated, bundled);
const fixedAllStats = fixed.sourceAttributes.find((s) => s.id === "source.global.all-stats");
checks.push(["已误迁移为 9 个目标的库被纠正回 4 个", fixedAllStats.targetMetricIds.length === 4 && !fixedAllStats.targetMetricIds.includes("metric.global.fire")]);
checks.push(["被纠正的是新对象（会写回本机）", fixed !== misMigrated]);

console.log("\n===== 断言 =====");
let ok = true;
for (const [label, pass] of checks) {
  console.log(`  ${pass ? "✅" : "❌"} ${label}`);
  if (!pass) ok = false;
}
console.log(`\n${ok ? "✅ 全部通过：旧库能被安全补齐，用户数据零改动" : "❌ 有失败项"}`);
process.exit(ok ? 0 : 1);
