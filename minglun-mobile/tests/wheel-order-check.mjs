// 验证「游戏盘序」这条链：
//   game-dump/gen-wheel-order.mjs 从 cfortunewheelcfg.bny 解出顺序 -> src/data/wheelOrder.js
//   -> ResultView 按它分组排序
// 这里只查数据与排序，不碰界面。
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

// ---- 1. 轮的顺序 ----
console.log("\n=== 1. 轮的先后（游戏里：物质 → 执行 → 创始 → 宿命）===");
eq(WHEEL_CATEGORY_ORDER.length, 4, "四个轮");
eq(WHEEL_CATEGORY_ORDER[0], "wheel-category.material", "第 1 个是物质之轮");
eq(WHEEL_CATEGORY_ORDER[1], "wheel-category.execution", "第 2 个是执行之轮");
eq(WHEEL_CATEGORY_ORDER[2], "wheel-category.creation", "第 3 个是创始之轮");
eq(WHEEL_CATEGORY_ORDER[3], "wheel-category.destiny", "第 4 个是宿命之轮");
eq(categoryOrderOf("wheel-category.creation"), 2, "创始之轮排第 3");
eq(categoryOrderOf("没这个轮"), Number.POSITIVE_INFINITY, "未知轮返回 Infinity");

// ---- 2. 覆盖度 ----
console.log("\n=== 2. 顺序表覆盖度 ===");
const wheels = workbench.fateWheels;
eq(wheels.length, 485, "workbench 485 个盘");
eq(Object.keys(WHEEL_ENTRY_ORDER).length, 485, "顺序表 485 条");
const missing = wheels.filter((w) => wheelOrderOf(w.gameEntryId) === Number.POSITIVE_INFINITY);
eq(missing.length, 0, "每个盘都查得到顺序（没有 gameEntryId 为 0 的）");
const idCount = new Set(wheels.map((w) => w.gameEntryId)).size;
eq(idCount, 485, "485 个盘的 gameEntryId 互不重复");
ok(wheels.every((w) => w.gameEntryId > 422300000 && w.gameEntryId < 422400000), "gameEntryId 都在 4223xxxxx 段");

// ---- 3. 每轮条数 ----
console.log("\n=== 3. 每个轮的盘数 ===");
const byCat = {};
for (const w of wheels) byCat[w.wheelCategoryId] = (byCat[w.wheelCategoryId] ?? 0) + 1;
eq(byCat["wheel-category.material"], 65, "物质之轮 65 个");
eq(byCat["wheel-category.execution"], 95, "执行之轮 95 个");
eq(byCat["wheel-category.creation"], 155, "创始之轮 155 个");
eq(byCat["wheel-category.destiny"], 170, "宿命之轮 170 个");

// ---- 4. 抽样：物质之轮前 5 个 ----
console.log("\n=== 4. 物质之轮前 5 个（游戏里的头几条）===");
const matHead = wheels
  .filter((w) => w.wheelCategoryId === "wheel-category.material")
  .sort((a, b) => wheelOrderOf(a.gameEntryId) - wheelOrderOf(b.gameEntryId))
  .slice(0, 5)
  .map((w) => w.name);
eq(matHead.join("、"), "鬼皇弈终、冥白归虚烬、不屈命途、逆命龙皇、皇刃同归", "前 5 个盘名");

// ---- 5. 整体排序 ----
console.log("\n=== 5. 整体排序（分组 + 组内单调）===");
const sorted = [...wheels].sort((a, b) => {
  const ca = categoryOrderOf(a.wheelCategoryId);
  const cb = categoryOrderOf(b.wheelCategoryId);
  if (ca !== cb) return ca - cb;
  return wheelOrderOf(a.gameEntryId) - wheelOrderOf(b.gameEntryId);
});
eq(sorted.length, wheels.length, "排序不丢盘");
let monotonic = true;
for (let i = 1; i < sorted.length; i += 1) {
  const ca = categoryOrderOf(sorted[i - 1].wheelCategoryId);
  const cb = categoryOrderOf(sorted[i].wheelCategoryId);
  if (cb < ca) { monotonic = false; break; }
  if (cb === ca && wheelOrderOf(sorted[i].gameEntryId) < wheelOrderOf(sorted[i - 1].gameEntryId)) { monotonic = false; break; }
}
ok(monotonic, "轮序递增，且组内序号单调不减");
const catSeq = sorted.map((w) => categoryOrderOf(w.wheelCategoryId));
eq(catSeq[0], 0, "第一条属于物质之轮");
eq(catSeq[catSeq.length - 1], 3, "最后一条属于宿命之轮");

// ---- 6. workbench.order 与游戏顺序一致 ----
console.log("\n=== 6. workbench.order 与游戏顺序一致 ===");
let mismatch = 0;
for (const cid of WHEEL_CATEGORY_ORDER) {
  const list = wheels
    .filter((w) => w.wheelCategoryId === cid)
    .sort((a, b) => wheelOrderOf(a.gameEntryId) - wheelOrderOf(b.gameEntryId));
  for (let i = 1; i < list.length; i += 1) if (list[i].order <= list[i - 1].order) mismatch += 1;
}
eq(mismatch, 0, "四个轮里 order 都随游戏顺序递增");

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
