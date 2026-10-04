// 验证「游戏盘序」这条链：
//   game-dump/gen-wheel-order.mjs 从 cfortunewheelentrycfg.bny 解出排序键 K
//   -> src/data/wheelOrder.js -> ResultView 按它分组排序
//
// 真值来源：玩家实拍的「创始之轮 · 全部」列表前 24 张卡（见生成脚本里的 CREATION_GROUND_TRUTH）。
import workbench from "../src/data/workbench.json" with { type: "json" };
import {
  WHEEL_CATEGORY_ORDER,
  WHEEL_ENTRY_ORDER,
  wheelOrderOf,
  categoryOrderOf,
} from "../src/data/wheelOrder.js";

let pass = 0, fail = 0;
const eq = (a, b, msg) => {
  if (a === b) { pass++; console.log(`  ✅ ${msg}  (${a})`); }
  else { fail++; console.log(`  ❌ ${msg}  期望 ${b}，实际 ${a}`); }
};
const ok = (c, msg) => eq(!!c, true, msg);

// 玩家实拍顺序（创始之轮「全部」，从上往下 24 张卡）
const SHOT = [
  "绘世琉璃", "凡尘之君", "黑天鹅", "绘世明灯", "终焉博弈", "雨月物语",
  "末日导演", "囚于王座者", "伪神陨落", "逆流的孤歌", "封神之殇", "旧日苏醒",
  "醒魂曲", "灰烬烙印", "诛杀僭越", "双生契约", "永燃的瞳术师", "黑天鹅之誓",
  "风与焰之誓", "王牌组合", "不坠的星群", "王座博弈", "化蝶乘风", "重返尼伯龙根",
];

// ---- 1. 轮的先后 ----
console.log("\n=== 1. 轮的先后（App 展示顺序：创始 → 执行 → 物质 → 宿命）===");
eq(WHEEL_CATEGORY_ORDER.length, 4, "四个轮");
eq(WHEEL_CATEGORY_ORDER[0], "wheel-category.creation", "第 1 个是创始之轮");
eq(WHEEL_CATEGORY_ORDER[1], "wheel-category.execution", "第 2 个是执行之轮");
eq(WHEEL_CATEGORY_ORDER[2], "wheel-category.material", "第 3 个是物质之轮");
eq(WHEEL_CATEGORY_ORDER[3], "wheel-category.destiny", "第 4 个是宿命之轮");
eq(categoryOrderOf("wheel-category.creation"), 0, "创始之轮排第 1");
eq(categoryOrderOf("没这个轮"), Number.POSITIVE_INFINITY, "未知轮返回 Infinity");

// ---- 2. 覆盖度 ----
console.log("\n=== 2. 顺序表覆盖度 ===");
const wheels = workbench.fateWheels;
eq(wheels.length, 490, "workbench 490 个盘（485 游戏盘 + 5 自定义盘）");
eq(Object.keys(WHEEL_ENTRY_ORDER).length, 485, "顺序表 485 条");
eq(wheels.filter((w) => wheelOrderOf(w.gameEntryId) === Number.POSITIVE_INFINITY).length, 5, "5 个自定义盘没有游戏顺序（预期）");
eq(new Set(wheels.map((w) => w.gameEntryId).filter((id) => id != null)).size, 485, "485 个游戏盘的 gameEntryId 互不重复");

// ---- 3. 每轮条数 ----
console.log("\n=== 3. 每个轮的盘数 ===");
const byCat = {};
for (const w of wheels) byCat[w.wheelCategoryId] = (byCat[w.wheelCategoryId] ?? 0) + 1;
eq(byCat["wheel-category.material"], 65, "物质之轮 65 个");
eq(byCat["wheel-category.execution"], 95, "执行之轮 95 个");
eq(byCat["wheel-category.creation"], 160, "创始之轮 160 个（含 5 个自定义盘）");
eq(byCat["wheel-category.destiny"], 170, "宿命之轮 170 个");

// ---- 4. 实拍真值（最关键） ----
console.log("\n=== 4. 与玩家实拍的 24 张卡对比 ===");
const byName = new Map(wheels.map((w) => [w.name, w]));
const shotIds = SHOT.map((n) => byName.get(n)?.gameEntryId);
ok(shotIds.every(Boolean), "24 个盘名都能在数据库里找到");
const shotKeys = shotIds.map((id) => Math.floor(wheelOrderOf(id) / 10000));
console.log("     实拍顺序的 K：" + shotKeys.join(","));
ok(shotKeys.every((v, i) => i === 0 || v >= shotKeys[i - 1]), "实拍顺序的 K 非递减（主序正确）");
// 生成的顺序：这 24 个盘按 wheelOrderOf 排出来的 K 序列，必须与实拍一模一样
const genKeys = [...shotIds]
  .sort((a, b) => wheelOrderOf(a) - wheelOrderOf(b))
  .map((id) => Math.floor(wheelOrderOf(id) / 10000));
eq(genKeys.join(","), shotKeys.join(","), "生成顺序的 K 序列与实拍完全一致");
// 说明：K 相同的盘，游戏用 Lua 不稳定排序，内部次序无法从静态配置推出 ——
// 这里固定用「配置里的记录先后」，所以同值组内允许相邻互换。
const genNames = [...shotIds]
  .sort((a, b) => wheelOrderOf(a) - wheelOrderOf(b))
  .map((id) => wheels.find((w) => w.gameEntryId === id).name);
const swapped = genNames.filter((n, i) => n !== SHOT[i]).length;
console.log(`     同值组内与实拍不同的卡：${swapped}/24（同值组内相邻互换，属预期）`);
ok(swapped % 2 === 0, "差异成对出现（同值组内相邻互换）");

// ---- 5. 整体排序 ----
console.log("\n=== 5. 整体排序 ===");
const sorted = [...wheels].sort((a, b) => {
  const ca = categoryOrderOf(a.wheelCategoryId);
  const cb = categoryOrderOf(b.wheelCategoryId);
  if (ca !== cb) return ca - cb;
  return wheelOrderOf(a.gameEntryId) - wheelOrderOf(b.gameEntryId);
});
eq(sorted.length, wheels.length, "排序不丢盘");
let bad = 0;
for (let i = 1; i < sorted.length; i += 1) {
  const ca = categoryOrderOf(sorted[i - 1].wheelCategoryId);
  const cb = categoryOrderOf(sorted[i].wheelCategoryId);
  if (cb < ca) bad += 1;
  else if (cb === ca && wheelOrderOf(sorted[i].gameEntryId) < wheelOrderOf(sorted[i - 1].gameEntryId)) bad += 1;
}
eq(bad, 0, "轮序递增且组内单调");
eq(categoryOrderOf(sorted[0].wheelCategoryId), 0, "第一条属于创始之轮");
eq(categoryOrderOf(sorted[sorted.length - 1].wheelCategoryId), 3, "最后一条属于宿命之轮");

// ---- 6. 每个轮的 K 都非递减 ----
console.log("\n=== 6. 每个轮内 K 非递减 ===");
for (const cid of WHEEL_CATEGORY_ORDER) {
  const list = sorted.filter((w) => w.wheelCategoryId === cid);
  const ks = list.map((w) => Math.floor(wheelOrderOf(w.gameEntryId) / 10000));
  const okk = ks.every((v, i) => i === 0 || v >= ks[i - 1]);
  ok(okk, `${cid}（${list.length} 个）K 非递减，范围 ${ks[0]}..${ks[ks.length - 1]}`);
}

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
