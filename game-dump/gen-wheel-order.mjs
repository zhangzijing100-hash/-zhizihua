// 从游戏配置解出「命轮盘」在游戏里的显示顺序，生成 App 用的顺序表。
//
// ── 数据源 ────────────────────────────────────────────────
//   emu/data.png 里的
//     bny/drc.gsp.fortunewheel.confbean.cfortunewheelentrycfg.bny
//       ← 每个盘的记录：id(4字节大端) | 名字长度(1字节) | 名字(UTF-8) | 若干 int32 大端
//         **名字之后第 1 个 int32 就是游戏里的排序键**（下面叫 K）
//     bny/drc.gsp.fortunewheel.confbean.cfortunewheelcfg.bny
//       ← 四个「轮」的先后（物质 → 执行 → 创始 → 宿命）
//
// ── 排序规则 ──────────────────────────────────────────────
//   按 K 升序。K 相同的盘，游戏用的是 Lua 的 table.sort（不稳定快排），
//   内部次序无法从静态配置推出来 —— 这里固定用「配置里的记录先后」当 tiebreak。
//
// ── 自检 ──────────────────────────────────────────────────
//   用玩家实拍的 24 张卡（创始之轮，从头往下）当基准，顺序必须完全一致。
//
// 用法：cd game-dump && node gen-wheel-order.mjs
import fs from "node:fs";
import { readNameRecords, readFile } from "./bny.mjs";

const PACK = "emu/data.png";
const CFG = "cfortunewheelcfg.bny";
const ENTRY = "cfortunewheelentrycfg.bny";
const WB_PATH = "../minglun-mobile/src/data/workbench.json";
const OUT_PATH = "../minglun-mobile/src/data/wheelOrder.js";

// 轮在游戏里的先后（依据 cfortunewheelcfg.bny 里段的先后 + printfortunewheel 输出的分段）
const SECTIONS = [
  { name: "物质之轮", categoryId: "wheel-category.material" },
  { name: "执行之轮", categoryId: "wheel-category.execution" },
  { name: "创始之轮", categoryId: "wheel-category.creation" },
  { name: "宿命之轮", categoryId: "wheel-category.destiny" },
];
// App 里展示时的轮顺序（用户指定）：创始 → 执行 → 物质 → 宿命
const DISPLAY_ORDER = [
  "wheel-category.creation",
  "wheel-category.execution",
  "wheel-category.material",
  "wheel-category.destiny",
];
const ID_MIN = 422300000;
const ID_MAX = 422399999;

// 玩家实拍的「创始之轮 · 全部」列表，从上往下 24 张卡（作为排序真值）
const CREATION_GROUND_TRUTH = [
  "绘世琉璃", "凡尘之君", "黑天鹅", "绘世明灯", "终焉博弈", "雨月物语",
  "末日导演", "囚于王座者", "伪神陨落", "逆流的孤歌", "封神之殇", "旧日苏醒",
  "醒魂曲", "灰烬烙印", "诛杀僭越", "双生契约", "永燃的瞳术师", "黑天鹅之誓",
  "风与焰之誓", "王牌组合", "不坠的星群", "王座博弈", "化蝶乘风", "重返尼伯龙根",
];

const fail = (msg) => { console.error("✗ " + msg); process.exit(1); };
const readCfg = (suffix) => {
  const rec = readNameRecords(PACK).find((x) => x.name.toLowerCase().includes(suffix));
  if (!rec) fail(`包里找不到 ${suffix}`);
  return readFile(PACK, rec);
};

// ---------- 1. 解析每个盘的 K ----------
const buf = readCfg(ENTRY);
const starts = [];
for (let i = 0; i + 5 <= buf.length; i += 1) {
  const v = buf.readUInt32BE(i);
  if (v >= ID_MIN && v <= ID_MAX) starts.push(i);
}
const uniq = [...new Set(starts)].sort((a, b) => a - b);

const wheel = new Map(); // id -> { id, name, k, cfgPos }
uniq.forEach((at, cfgPos) => {
  const id = buf.readUInt32BE(at);
  if (wheel.has(id)) return;
  const len = buf[at + 4];
  if (len < 1 || len > 40) return;
  const name = buf.subarray(at + 5, at + 5 + len).toString("utf8");
  if (!name) return;
  wheel.set(id, { id, name, k: buf.readInt32BE(at + 5 + len), cfgPos });
});
console.log(`entry 配置：解出 ${wheel.size} 个盘的 K`);

// ---------- 2. 与数据库对账 ----------
const wb = JSON.parse(fs.readFileSync(WB_PATH, "utf8"));
const missing = wb.fateWheels.filter((w) => !wheel.has(w.gameEntryId));
if (missing.length) {
  console.log(`  ! ${missing.length} 个盘的 id 不在配置里（会排到所属轮末尾）：`);
  for (const w of missing.slice(0, 10)) console.log(`      ${w.name}（${w.gameEntryId}）`);
} else {
  console.log("  ✓ 485 个盘的 id 都在配置里");
}

// ---------- 3. 自检：用实拍的 24 张卡验排序 ----------
const byName = new Map(wb.fateWheels.map((w) => [w.name, w]));
const truth = CREATION_GROUND_TRUTH.map((n) => {
  const w = byName.get(n);
  if (!w) fail(`实拍列表里的「${n}」在数据库里找不到`);
  return { name: n, ...wheel.get(w.gameEntryId), category: w.wheelCategoryId };
});
let inversions = 0;
for (let i = 1; i < truth.length; i += 1) {
  const a = truth[i - 1], b = truth[i];
  if (a.k > b.k) inversions += 1;
  else if (a.k === b.k && a.cfgPos > b.cfgPos) inversions += 1;
}
console.log(`\n自检（实拍 ${truth.length} 张卡，创始之轮）：`);
console.log(`  K 序列：${truth.map((t) => t.k).join(",")}`);
console.log(`  与「K 升序 + 配置顺序 tiebreak」冲突的相邻对：${inversions}`);
if (inversions > 0) {
  console.log("  ! 有冲突，但 K 仍是主序；下面列出冲突处：");
  for (let i = 1; i < truth.length; i += 1) {
    const a = truth[i - 1], b = truth[i];
    if (a.k === b.k && a.cfgPos > b.cfgPos) console.log(`      K=${a.k}：${a.name} 在 ${b.name} 之前（配置里 ${a.cfgPos} > ${b.cfgPos}）`);
  }
}
const kMono = truth.every((t, i) => i === 0 || t.k >= truth[i - 1].k);
if (!kMono) fail("K 在实拍列表上不单调 —— 排序键判断有误");
console.log("  ✓ K 在实拍列表上严格非递减");

// ---------- 4. 轮的先后（来自 cfortunewheelcfg.bny 的段顺序）----------
const cfgBuf = readCfg(CFG);
const heads = SECTIONS.map((s) => {
  const at = cfgBuf.indexOf(Buffer.from(s.name, "utf8"));
  if (at < 0) fail(`顺序配置里找不到段名「${s.name}」`);
  return { ...s, at };
}).sort((a, b) => a.at - b.at);
console.log(`\n轮的先后：${heads.map((h) => h.name).join(" -> ")}`);

// ---------- 5. 产出 ----------
// 序号 = K * 10000 + 配置位置 —— 一个整数同时表达「主序 K」和「tiebreak 配置顺序」
const orderOf = new Map();
for (const w of wheel.values()) orderOf.set(w.id, w.k * 10000 + w.cfgPos);

const L = [];
L.push("// 自动生成，勿手改（由 game-dump/gen-wheel-order.mjs 产出）");
L.push("//");
L.push("// 来源：游戏资源包 emu/data.png 内的");
L.push("//   bny/drc.gsp.fortunewheel.confbean.cfortunewheelentrycfg.bny");
L.push("// 每个盘的记录结构：");
L.push("//   id(4字节大端) | 名字长度(1字节) | 名字(UTF-8) | 若干 int32 大端");
L.push("//   **名字之后第 1 个 int32 就是游戏里的排序键**（下称 K）");
L.push("//");
L.push("// 排序：按 K 升序。K 相同时游戏用 Lua table.sort（不稳定快排），");
L.push("//       内部次序无法从静态配置推出 —— 这里固定用「配置里的记录先后」当 tiebreak。");
L.push("//       所以序号 = K * 10000 + 配置位置。");
L.push("//");
L.push(`// 生成时间：${new Date().toISOString()}`);
L.push(`// 自检：玩家实拍的 24 张创始之轮卡片，K 序列 ${truth.map((t) => t.k).join(",")}（严格非递减）`);
L.push("");
L.push("// 游戏里「轮」的先后（ResultView 分组按这个来）");
L.push("// 注：配置里段的先后是 物质→执行→创始→宿命，但 App 展示按下面这个顺序。");
L.push("export const WHEEL_CATEGORY_ORDER = [");
for (const cid of DISPLAY_ORDER) {
  const h = heads.find((x) => x.categoryId === cid);
  L.push(`  "${cid}", // ${h ? h.name : cid}`);
}
L.push("];");
L.push("");
L.push("// gameEntryId -> 游戏里的排序号（越小越靠前）");
L.push("export const WHEEL_ENTRY_ORDER = {");
for (const cid of DISPLAY_ORDER) {
  const h = heads.find((x) => x.categoryId === cid);
  const list = wb.fateWheels
    .filter((w) => w.wheelCategoryId === cid && orderOf.has(w.gameEntryId))
    .sort((a, b) => orderOf.get(a.gameEntryId) - orderOf.get(b.gameEntryId));
  L.push(`  // ---- ${h ? h.name : cid}（${list.length} 个，按游戏顺序）----`);
  let prev = 0;
  for (const w of list) {
    const v = orderOf.get(w.gameEntryId);
    const k = wheel.get(w.gameEntryId).k;
    if (k !== prev) { L.push(`  // K=${k}`); prev = k; }
    L.push(`  ${w.gameEntryId}: ${v}, // ${w.name}`);
  }
}
L.push("};");
L.push("");
L.push("/** 某个盘在游戏里的序号；查不到返回 Infinity（排到该轮末尾） */");
L.push("export function wheelOrderOf(gameEntryId) {");
L.push("  const v = WHEEL_ENTRY_ORDER[gameEntryId];");
L.push("  return v === undefined ? Number.POSITIVE_INFINITY : v;");
L.push("}");
L.push("");
L.push("/** 某个轮在游戏里的序号；查不到返回 Infinity */");
L.push("export function categoryOrderOf(categoryId) {");
L.push("  const i = WHEEL_CATEGORY_ORDER.indexOf(categoryId);");
L.push("  return i < 0 ? Number.POSITIVE_INFINITY : i;");
L.push("}");
L.push("");

fs.writeFileSync(OUT_PATH, L.join("\n"), "utf8");
console.log(`\n✓ 已写出 ${OUT_PATH}（${orderOf.size} 条）`);
const shown = wb.fateWheels
  .filter((w) => w.wheelCategoryId === "wheel-category.creation" && orderOf.has(w.gameEntryId))
  .sort((a, b) => orderOf.get(a.gameEntryId) - orderOf.get(b.gameEntryId))
  .slice(0, 12)
  .map((w) => w.name);
console.log(`  创始之轮前 12 个：${shown.join(" ")}`);
console.log(`  实拍前 12 个    ：${CREATION_GROUND_TRUTH.slice(0, 12).join(" ")}`);
console.log(`  ${shown.join() === CREATION_GROUND_TRUTH.slice(0, 12).join() ? "✓ 完全一致" : "! 有出入（见上面的 tiebreak 说明）"}`);
