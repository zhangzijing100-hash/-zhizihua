// 命轮值规则回归测试：对全部 485 个盘校验公式与官方数据
import fs from "node:fs";
import path from "node:path";
import {
  auditWorkbench,
  bankersRound5,
  computeNormalFateValue,
  analyzeDestinyFateValue,
  applyFateValueFixes,
  officialFateValue,
  FORMULA_DEVIATIONS,
} from "../src/fate-value.js";

const workbench = JSON.parse(
  fs.readFileSync(path.join(import.meta.dirname, "../src/data/workbench.json"), "utf8")
);

let pass = 0;
let fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log(`  ✅ ${msg}`); }
  else { fail++; console.log(`  ❌ ${msg}`); }
};
const eq = (a, b, msg) => ok(a === b, `${msg}  (期望 ${b}, 实际 ${a})`);

console.log("=== 1. 银行家舍入单元用例 ===");
eq(bankersRound5(25), 25, "25 → 25");
eq(bankersRound5(37.5), 40, "37.5 → 40（.5 取偶，7 为奇进 8）");
eq(bankersRound5(62.5), 60, "62.5 → 60（.5 取偶，12 为偶留 12）");
eq(bankersRound5(162.5), 160, "162.5 → 160");
eq(bankersRound5(75), 75, "75 → 75");
eq(bankersRound5(213.33333333333334), 215, "213.33 → 215");
eq(bankersRound5(170), 170, "170 → 170");

console.log("\n=== 2. 单盘公式（纯同品质，无歧义）===");
for (const [n, expect] of [[1, 30], [2, 75], [3, 120], [4, 170], [5, 225]]) {
  const r = computeNormalFateValue(Array(n).fill("SSR"));
  eq(r?.value, expect, `${n}×SSR → ${expect}`);
}
eq(computeNormalFateValue(["R", "SR"])?.value, 40, "R+SR (n=2) → 40");
eq(computeNormalFateValue(["SR", "SSR"])?.value, 60, "SR+SSR (n=2) → 60");
eq(computeNormalFateValue(["SSR", "SSR", "UR"])?.value, 215, "SSR+SSR+UR (n=3) → 215");
eq(computeNormalFateValue(["SSR", "SSR", "SSR", "UR"])?.value, 270, "SSR×3+UR (n=4) → 270");
eq(computeNormalFateValue(["UR"])?.value, 100, "UR (n=1) → 100");
eq(computeNormalFateValue(["SSR_LIMITED"])?.value, 30, "限定SSR (n=1) → 30（与普通 SSR 相同）");

console.log("\n=== 3. 宿命之轮整除性 ===");
eq(analyzeDestinyFateValue(["SSR", "SSR"], 96)?.divisible, true, "SSR+SSR=96 可被 M(2)=12 整除");
eq(analyzeDestinyFateValue(["SSR", "SSR"], 96)?.t, 2, "SSR+SSR=96 → t=2");
eq(analyzeDestinyFateValue(["SSR", "SSR", "SSR"], 169)?.t, 4, "SSR×3=169 → t=4");

console.log("\n=== 4. 全 485 盘审计 ===");
const audit = auditWorkbench(workbench);

eq(audit.normal.total, 315, "普通盘数量");
eq(audit.destiny.total, 170, "宿命之轮数量");
eq(audit.normal.matched, 302, "普通盘公式命中数");
ok(Math.abs(audit.normal.rate - 302 / 315) < 1e-9, `命中率 ${(audit.normal.rate * 100).toFixed(2)}% == 95.87%`);
eq(audit.destiny.divisible, 170, "宿命之轮 M(n) 整除命中数");

console.log("\n=== 5. 13 个公式例外 ===");
const byDelta = { minus5: [], plus: [] };
for (const m of audit.normal.mismatches) {
  if (m.delta === -5) byDelta.minus5.push(m.name);
  else byDelta.plus.push(m);
}
eq(audit.normal.mismatches.length, 13, "例外总数");
eq(byDelta.minus5.length, 8, "「-5」类例外数（全部含 UR，n=3）");
ok(true, `-5 类名单: ${byDelta.minus5.sort().join(" / ")}`);
const bigOnes = byDelta.plus.map((m) => `${m.name}(${m.delta > 0 ? "+" : ""}${m.delta})`).sort();
eq(byDelta.plus.length, 5, "其余 5 个例外");
ok(true, `其余名单: ${bigOnes.join(" / ")}`);

console.log("\n=== 6. 「公式不适用」清单 ===");
eq(FORMULA_DEVIATIONS.length, 13, "清单条目数");
for (const name of FORMULA_DEVIATIONS) {
  ok(audit.normal.mismatches.some((m) => m.name === name && m.formulaDeviation), `「${name}」被标记为公式不适用`);
}

console.log("\n=== 7. 游戏官方数据核对（.bny 解出的 475 条）===");
eq(audit.official.checked, 475, "已核对的盘数");
eq(audit.official.matched, 475, "与官方一致的盘数");
eq(audit.official.mismatches.length, 0, "与官方不一致的盘数");
eq(audit.official.missing.length, 5, "有 entryId 但官方表未收录的盘数");
const custom = workbench.fateWheels.filter((w) => !w.gameEntryId);
eq(custom.length, 5, "手工新增盘数（gameEntryId=0）");

const confirmed = audit.normal.mismatches.filter((m) => m.officialConfirmed);
const manual = audit.normal.mismatches.filter((m) => !m.officialConfirmed);
eq(confirmed.length, 11, "公式不符且被官方确证的盘数");
eq(manual.length, 2, "公式不符且为手工录入的盘数");
ok(manual.every((m) => !workbench.fateWheels.find((w) => w.id === m.id).gameEntryId), "这 2 个确实没有 gameEntryId");
ok(officialFateValue(422310185) === 330, "officialFateValue(422310185) == 330");

console.log("\n=== 8. 安全修正（绝不覆盖已有数值）===");
const { workbench: fixed, changes } = applyFateValueFixes(workbench);
eq(changes.length, 0, "默认修正盘数（没有任何盘缺命轮值）");
ok(JSON.stringify(fixed.fateWheels) === JSON.stringify(workbench.fateWheels), "默认模式对数据零改动");
eq(auditWorkbench(fixed).official.matched, 475, "修正后官方一致数不变");

const { workbench: fixedAll, changes: allChanges } = applyFateValueFixes(workbench, { force: true });
eq(allChanges.length, 13, "force 模式覆盖盘数（即 13 个公式例外）");
eq(auditWorkbench(fixedAll).normal.matched, 315, "force 后公式命中数");
eq(auditWorkbench(fixedAll).official.mismatches.length, 11, "force 后与官方不一致的盘数（证实会破坏数据）");

console.log(`\n════════════════════════════════`);
console.log(`  通过 ${pass} / 失败 ${fail}`);
console.log(`════════════════════════════════`);
process.exit(fail ? 1 : 0);
