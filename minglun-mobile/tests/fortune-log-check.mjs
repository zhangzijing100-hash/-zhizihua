// 用真实日志验证「printfortunewheel 输出 → 63 个伙伴的命轮数量」这条链
import { readFileSync } from "node:fs";
import { parseFortuneLog, parseSections, timeFromLogName } from "../src/features/read/fortuneLog.js";
import { WHEEL_ITEM_TO_PARTNER, partnerOfWheelItem } from "../src/features/read/wheelInventoryMap.js";
import workbench from "../src/data/workbench.json" with { type: "json" };

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  if (a === b) { pass++; console.log(`  ✅ ${msg}  (${a})`); }
  else { fail++; console.log(`  ❌ ${msg}  期望 ${b}，实际 ${a}`); }
};
const ok = (c, msg) => eq(!!c, true, msg);

const LOG = process.argv[2] ?? "../../game-dump/device/fortune-debug.log";
const text = readFileSync(new URL(LOG, import.meta.url), "utf8");

console.log("\n=== 1. 分段 ===");
const sections = parseSections(text);
const names = sections.map((s) => s.name);
console.log("  段：" + names.join(" / "));
ok(names.includes("物质之轮") && names.includes("执行之轮") && names.includes("创始之轮"), "四个方案段都在");
ok(names.includes("总计"), "有总计段");

console.log("\n=== 2. 总计段 ===");
const total = sections.find((s) => s.name === "总计");
eq(total.rows.length, 97, "总计 97 条命轮");
ok(total.rows.every((r) => r.wheelName.startsWith("命轮·")), "全是命轮项");
ok(total.rows.every((r) => /^\d{9}$/.test(r.itemId)), "itemId 都是 9 位");

console.log("\n=== 3. 映射表 ===");
eq(Object.keys(WHEEL_ITEM_TO_PARTNER).length, 63, "映射表 63 条");
eq(workbench.characters.length, 63, "App 63 个伙伴");
const covered = new Set(Object.values(WHEEL_ITEM_TO_PARTNER));
eq(workbench.characters.filter((c) => !covered.has(c.name)).length, 0, "所有伙伴都被覆盖");
eq(partnerOfWheelItem("422550000"), null, "42255* 那一套不映射（返回 null）");
eq(partnerOfWheelItem("422500015"), "上杉绘梨衣", "命轮·绘梨衣 → 上杉绘梨衣");
eq(partnerOfWheelItem("422540008"), "须佐之男源稚女", "命轮·须佐之男命源稚女 → 须佐之男源稚女");
eq(partnerOfWheelItem("422530025"), "芬里厄", "命轮·芬里厄 → 芬里厄");

console.log("\n=== 4. 解析（默认：包裹 + 已存入方案）===");
const parsed = parseFortuneLog(text);
ok(parsed.ok, "解析成功");
eq(parsed.entries.length, 63, "解析出 63 个伙伴");
ok(parsed.entries.every((e) => WHEEL_ITEM_TO_PARTNER[e.itemId] === e.partner), "每条 itemId↔伙伴 都对得上");

const bagSum = parsed.entries.reduce((a, e) => a + e.bag, 0);
const depSum = parsed.entries.reduce((a, e) => a + e.deposit, 0);
const cntSum = parsed.entries.reduce((a, e) => a + e.count, 0);
eq(bagSum, 805, "「包裹内未用」合计 805");
console.log(`     「多方案总用量」合计 = ${depSum}`);
eq(cntSum, bagSum + depSum, "count = bag + deposit");

const pick = (p) => parsed.byPartner.get(p);
eq(pick("奇兰"), 137, "奇兰 112 + 25 = 137");
eq(pick("恺撒"), 25, "恺撒 0 + 25 = 25（只看包裹会是 0，这就是之前偏低的原因）");
eq(pick("矢吹樱"), 148, "矢吹樱 79 + 69 = 148");
eq(pick("叶胜"), 126, "叶胜 13 + 113 = 126");
eq(pick("皇女零"), 0, "皇女零 0 + 0 = 0");
ok(parsed.entries.every((e) => e.count === e.bag + e.deposit), "每条的 count 都等于 bag+deposit");

console.log("\n=== 5. 只看包裹（includeDeposit:false）===");
const bagOnly = parseFortuneLog(text, { includeDeposit: false });
eq(bagOnly.entries.filter((e) => e.count > 0).length, 21, "只看包裹：21 个有货");
eq(bagOnly.entries.reduce((a, e) => a + e.count, 0), 805, "只看包裹：合计 805");
eq(bagOnly.byPartner.get("奇兰"), 112, "只看包裹：奇兰 112");
eq(bagOnly.byPartner.get("恺撒"), 0, "只看包裹：恺撒 0");

console.log("\n=== 6. 文件名时间 ===");
eq(timeFromLogName("Debug-09-20-18-39-40.log"), "09-20 18:39:40", "从文件名取时间");
eq(timeFromLogName("xxx.log"), null, "不认识的返回 null");

console.log("\n=== 7. 坏输入 ===");
eq(parseFortuneLog("").ok, false, "空文本 → 失败");
eq(parseFortuneLog("随便写点东西").ok, false, "没有总计段 → 失败");

console.log(`\n════════════════════════════════\n  通过 ${pass} / 失败 ${fail}\n════════════════════════════════`);
process.exit(fail ? 1 : 0);
