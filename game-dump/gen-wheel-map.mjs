// 生成 App 用的静态映射：命轮 itemId -> 伙伴名
//   4225[034]* 三段合计 63 个 = App 的 63 个伙伴；42255* 是另一套（忽略）
import { readFileSync, writeFileSync } from "node:fs";

const inv = JSON.parse(readFileSync("fortune-inventory.json", "utf8"));
const wb = JSON.parse(readFileSync("../minglun-mobile/src/data/workbench.json", "utf8"));
const names = new Set(wb.characters.map((c) => c.name));

// 日志名 -> App 伙伴名 的特殊改名
const RENAME = {
  "命轮·绘梨衣": "上杉绘梨衣",
  "命轮·须佐之男命源稚女": "须佐之男源稚女",
};

const rows = inv.total
  .filter((r) => /^4225[034]/.test(r.id))
  .map((r) => {
    const target = RENAME[r.name] ?? r.name.replace(/^命轮·/, "");
    return { id: r.id, wheel: r.name.replace(/^命轮·/, ""), partner: target, ok: names.has(target) };
  });

const bad = rows.filter((r) => !r.ok);
console.log(`映射 ${rows.length} 条，未命中伙伴 ${bad.length} 条`);
if (bad.length) console.log("  " + bad.map((b) => `${b.id} ${b.partner}`).join("\n  "));

// App 里没被覆盖到的伙伴
const covered = new Set(rows.map((r) => r.partner));
const missing = wb.characters.filter((c) => !covered.has(c.name)).map((c) => c.name);
console.log(`App 63 个伙伴中未被覆盖：${missing.length}${missing.length ? " -> " + missing.join("、") : ""}`);

const body = rows
  .map((r) => `  "${r.id}": ${JSON.stringify(r.partner)},   // ${r.wheel}`)
  .join("\n");

const out = `// 自动生成，勿手改（由 game-dump/gen-wheel-map.mjs 产出）
//
// 命轮 itemId -> App 伙伴名。
// 依据：游戏 CFortuneWheelItemCfg.GetAllRecords() 的 97 条记录里，
//   422500001-422500037（37 条）基础命轮
//   422530025-422530042（18 条）限定/特殊命轮
//   422540001-422540008（ 8 条）UR 命轮
// 合计 63 条，正好对应 App 的 63 个伙伴。
// 422550000-422550033（34 条）是另一套命轮（与基础命轮同名），不计入本表。
export const WHEEL_ITEM_TO_PARTNER = {
${body}
};

/** 命轮 itemId -> 伙伴名；不认识的返回 null */
export function partnerOfWheelItem(itemId) {
  return WHEEL_ITEM_TO_PARTNER[String(itemId)] ?? null;
}
`;

writeFileSync("../minglun-mobile/src/data/wheelInventoryMap.js", out, "utf8");
console.log("\n→ minglun-mobile/src/data/wheelInventoryMap.js");
