// 从游戏配置解出「命轮盘」在游戏里的显示顺序，并生成 App 用的顺序表。
//
// 数据结构（逆向出来的）：
//   emu/data.png 里的 bny/drc.gsp.fortunewheel.confbean.cfortunewheelcfg.bny
//   文件按「轮」分段。每段段头 = int32 类型 + 1 字节名字长度 + 轮名(UTF-8)，
//   紧随其后的是一串 4 字节大端 int32 的盘 id（4223xxxxx）。
//   **这串 id 的排列就是游戏里的显示顺序**，段的先后就是轮在游戏里的先后。
//
//   盘 id -> 名字 的对照表来自同包的 cfortunewheelentrycfg.bny
//   （记录头 4 字节 = 记录 id，随后 1 字节长度 + 名字 UTF-8，与 bny.mjs 的「跳过 4 字节头」一致）。
//
// 实测：段内盘数 65 / 95 / 155 / 170 = 485。
//
// 用法：cd game-dump && node gen-wheel-order.mjs
import fs from "node:fs";
import { readNameRecords, readFile } from "./bny.mjs";

const PACK = "emu/data.png";
const CFG = "cfortunewheelcfg.bny";
const ENTRY = "cfortunewheelentrycfg.bny";
const WB_PATH = "../minglun-mobile/src/data/workbench.json";
const OUT_PATH = "../minglun-mobile/src/data/wheelOrder.js";

const SECTIONS = [
  { name: "物质之轮", categoryId: "wheel-category.material" },
  { name: "执行之轮", categoryId: "wheel-category.execution" },
  { name: "创始之轮", categoryId: "wheel-category.creation" },
  { name: "宿命之轮", categoryId: "wheel-category.destiny" },
];
const EXPECT_COUNT = { 物质之轮: 65, 执行之轮: 95, 创始之轮: 155, 宿命之轮: 170 };
const ID_MIN = 422300000;
const ID_MAX = 422399999;

const fail = (msg) => { console.error("✗ " + msg); process.exit(1); };
const readCfg = (suffix) => {
  const rec = readNameRecords(PACK).find((x) => x.name.toLowerCase().includes(suffix));
  if (!rec) fail(`包里找不到 ${suffix}`);
  return readFile(PACK, rec);
};

// ---------- 1. 盘 id -> 名字 ----------
const entryBuf = readCfg(ENTRY);
const nameOf = new Map();
for (let i = 0; i + 5 <= entryBuf.length; i += 1) {
  const id = entryBuf.readUInt32BE(i);
  if (id < ID_MIN || id > ID_MAX) continue;
  const len = entryBuf[i + 4];
  if (len < 1 || len > 40) continue;
  const s = entryBuf.subarray(i + 5, i + 5 + len).toString("utf8");
  if (s && !nameOf.has(id)) nameOf.set(id, s);
}
console.log(`entry 配置解出名字：${nameOf.size} 条`);

// ---------- 2. 配置里按段取出盘 id ----------
const buf = readCfg(CFG);
console.log(`顺序配置：${buf.length} 字节`);
const heads = SECTIONS.map((s) => {
  const at = buf.indexOf(Buffer.from(s.name, "utf8"));
  if (at < 0) fail(`顺序配置里找不到段名「${s.name}」`);
  const len = buf[at - 1];
  if (len !== Buffer.byteLength(s.name, "utf8")) fail(`「${s.name}」段头长度字节对不上`);
  return { ...s, at };
}).sort((a, b) => a.at - b.at);

const sections = heads.map((h, i) => {
  const end = heads[i + 1] ? heads[i + 1].at - 1 : buf.length;
  const ids = [];
  for (let p = h.at; p + 4 <= end; p += 1) {
    const v = buf.readUInt32BE(p);
    if (v >= ID_MIN && v <= ID_MAX) ids.push(v);
  }
  return { ...h, ids };
});

console.log("\n段内盘数：");
for (const s of sections) {
  const want = EXPECT_COUNT[s.name];
  console.log(`  ${s.ids.length === want ? "✓" : "✗"} ${s.name}  ${s.ids.length}（期望 ${want}）`);
  if (s.ids.length !== want) fail(`「${s.name}」段内盘数不对，配置结构可能变了`);
}
const cfgIds = sections.flatMap((s) => s.ids);
if (new Set(cfgIds).size !== cfgIds.length) fail("配置里出现重复 id");

// ---------- 3. 与 workbench 对账 ----------
const wb = JSON.parse(fs.readFileSync(WB_PATH, "utf8"));
const cfgSet = new Set(cfgIds);
const wbById = new Map(wb.fateWheels.map((w) => [w.gameEntryId, w]));
const configNameToId = new Map();
for (const id of cfgIds) {
  const n = nameOf.get(id);
  if (n && !configNameToId.has(n)) configNameToId.set(n, id);
}

const wrongId = [];   // workbench 的 id 不在配置里，但名字能对上 -> 应改成正确 id
const noId = [];      // workbench 没有 id，但名字能对上
const unknown = [];   // 既不在配置里、名字也对不上
for (const w of wb.fateWheels) {
  if (w.gameEntryId && cfgSet.has(w.gameEntryId)) continue;
  const want = configNameToId.get(w.name);
  if (!want) { unknown.push(w); continue; }
  (w.gameEntryId ? wrongId : noId).push({ wheel: w, want });
}

console.log("\n与 workbench 对账：");
console.log(`  workbench ${wb.fateWheels.length} 行 / 配置 ${cfgIds.length} 条`);
if (wrongId.length) {
  console.log(`  ! ${wrongId.length} 行 gameEntryId 写错了（名字能对上）：`);
  for (const x of wrongId) console.log(`      ${x.wheel.name}：${x.wheel.gameEntryId} -> ${x.want}`);
}
if (noId.length) {
  console.log(`  ! ${noId.length} 行 gameEntryId 丢了（为 0）：`);
  for (const x of noId) console.log(`      ${x.wheel.name}：0 -> ${x.want}`);
}
if (unknown.length) {
  console.log(`  ? ${unknown.length} 行两头都对不上（会排到所属轮末尾）：`);
  for (const w of unknown) console.log(`      ${w.name}（id=${w.gameEntryId}）`);
}
if (!wrongId.length && !noId.length && !unknown.length) console.log("  ✓ 完全一致");

// 段内顺序 vs workbench 现有 order（只对 id 正确的行做）
console.log("\n段内顺序 vs workbench 现有 order：");
for (const s of sections) {
  const list = s.ids.map((id) => wbById.get(id)).filter(Boolean);
  let good = 0;
  for (let i = 1; i < list.length; i += 1) if (list[i].order > list[i - 1].order) good += 1;
  const total = list.length - 1;
  console.log(`  ${good === total ? "✓" : "!"} ${s.name}  ${good}/${total}`);
  if (good !== total) {
    for (let i = 1; i < list.length; i += 1) {
      if (list[i].order <= list[i - 1].order) console.log(`      逆序: ${list[i - 1].name}(${list[i - 1].order}) -> ${list[i].name}(${list[i].order})`);
    }
  }
}

// ---------- 4. 产出 ----------
const orderByEntry = new Map();
let seq = 0;
for (const s of sections) for (const id of s.ids) orderByEntry.set(id, seq++);

const L = [];
L.push("// 自动生成，勿手改（由 game-dump/gen-wheel-order.mjs 产出）");
L.push("//");
L.push("// 来源：游戏资源包 emu/data.png 内的");
L.push("//   bny/drc.gsp.fortunewheel.confbean.cfortunewheelcfg.bny");
L.push("// 结构：文件按「轮」分段，段头 = int32 类型 + 1 字节名字长度 + 轮名(UTF-8)，");
L.push("//   紧随其后的是一串 4 字节大端 int32 的盘 id（4223xxxxx）。");
L.push("//   **这串 id 的排列就是游戏里的显示顺序**，段的先后就是轮在游戏里的先后。");
L.push("//");
L.push(`// 生成时间：${new Date().toISOString()}`);
L.push("// 自检：段内盘数 65 / 95 / 155 / 170 = 485。");
L.push("");
L.push("// 游戏里「轮」的先后（ResultView 分组按这个来）");
L.push("export const WHEEL_CATEGORY_ORDER = [");
for (const s of sections) L.push(`  "${s.categoryId}", // ${s.name}`);
L.push("];");
L.push("");
L.push("// gameEntryId -> 游戏里的全局序号（越小越靠前）");
L.push("export const WHEEL_ENTRY_ORDER = {");
for (const s of sections) {
  L.push(`  // ---- ${s.name}（${s.ids.length} 个）----`);
  for (const id of s.ids) L.push(`  ${id}: ${orderByEntry.get(id)},`);
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
console.log(`\n✓ 已写出 ${OUT_PATH}（${orderByEntry.size} 条）`);
console.log(`  轮顺序：${sections.map((s) => s.name).join(" -> ")}`);
if (wrongId.length || noId.length) {
  console.log(`\n→ 另有 ${wrongId.length + noId.length} 行 workbench 的 gameEntryId 需要修正，`);
  console.log("  跑 node fix-wheel-entry-ids.mjs 修（App 侧由 migrate.js 自动补）。");
}
