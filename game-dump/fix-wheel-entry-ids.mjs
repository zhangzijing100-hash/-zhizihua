// 修正 workbench.json 里关系盘的两个字段，让它们与游戏配置一致：
//   1) gameEntryId —— 早期数据有 5 个写错、5 个丢了（0）
//   2) order       —— 上面那 10 行的 order 是在 id 错的时候给的，落在了别的轮的区间里
//
// 依据：emu/data.png 里的
//   cfortunewheelentrycfg.bny  -> 记录 id 与名字
//   cfortunewheelcfg.bny       -> 每个轮下列出的盘 id 顺序（= 游戏里的显示顺序）
// 只改这两列，改前自动备份。
//
// 用法：cd game-dump && node fix-wheel-entry-ids.mjs
import fs from "node:fs";
import { readNameRecords, readFile } from "./bny.mjs";

const PACK = "emu/data.png";
const CFG = "cfortunewheelcfg.bny";
const ENTRY = "cfortunewheelentrycfg.bny";
const WB_PATH = "../minglun-mobile/src/data/workbench.json";
const ID_MIN = 422300000;
const ID_MAX = 422399999;

// 轮 -> 分类 id 与 order 前缀
const SECTIONS = [
  { name: "物质之轮", categoryId: "wheel-category.material", prefix: 200000 },
  { name: "执行之轮", categoryId: "wheel-category.execution", prefix: 300000 },
  { name: "创始之轮", categoryId: "wheel-category.creation", prefix: 100000 },
  { name: "宿命之轮", categoryId: "wheel-category.destiny", prefix: 400000 },
];

const readCfg = (suffix) => {
  const rec = readNameRecords(PACK).find((x) => x.name.toLowerCase().includes(suffix));
  if (!rec) { console.error("✗ 包里找不到 " + suffix); process.exit(1); }
  return readFile(PACK, rec);
};

// ---------- 1. 记录 id -> 名字 ----------
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
const idByName = new Map();
for (const [id, n] of nameOf) if (!idByName.has(n)) idByName.set(n, id);
console.log(`记录 id -> 名字：${nameOf.size} 条`);

// ---------- 2. 每轮的盘 id 顺序 ----------
const cfgBuf = readCfg(CFG);
const heads = SECTIONS.map((s) => {
  const at = cfgBuf.indexOf(Buffer.from(s.name, "utf8"));
  if (at < 0) { console.error("✗ 顺序配置里找不到 " + s.name); process.exit(1); }
  return { ...s, at };
}).sort((a, b) => a.at - b.at);

const sections = heads.map((h, i) => {
  const end = heads[i + 1] ? heads[i + 1].at - 1 : cfgBuf.length;
  const ids = [];
  for (let p = h.at; p + 4 <= end; p += 1) {
    const v = cfgBuf.readUInt32BE(p);
    if (v >= ID_MIN && v <= ID_MAX) ids.push(v);
  }
  return { ...h, ids };
});
for (const s of sections) console.log(`  ${s.name}: ${s.ids.length} 个`);

// 每个 id 应有的 order
const wantOrder = new Map();
for (const s of sections) s.ids.forEach((id, i) => wantOrder.set(id, s.prefix + (i + 1) * 10));

// ---------- 3. 改 workbench ----------
const wb = JSON.parse(fs.readFileSync(WB_PATH, "utf8"));
const valid = new Set(nameOf.keys());
const changes = [];
let fixedId = 0, fixedOrder = 0;

for (const w of wb.fateWheels) {
  // 3a) id 不对时按名字纠正
  if (!w.gameEntryId || !valid.has(w.gameEntryId)) {
    const want = idByName.get(w.name);
    if (want && want !== w.gameEntryId) {
      changes.push(`  [id]    ${w.name}：${w.gameEntryId} -> ${want}`);
      w.gameEntryId = want;
      fixedId += 1;
    }
  }
  // 3b) order 与游戏顺序不符时纠正
  const want = wantOrder.get(w.gameEntryId);
  if (want !== undefined && w.order !== want) {
    changes.push(`  [order] ${w.name}：${w.order} -> ${want}`);
    w.order = want;
    fixedOrder += 1;
  }
}

if (!changes.length) { console.log("\n✓ 不用改，id 和 order 都跟游戏一致"); process.exit(0); }

const stamp = new Date().toISOString().slice(0, 10);
const backup = `${WB_PATH}.bak-${stamp}`;
if (!fs.existsSync(backup)) fs.copyFileSync(WB_PATH, backup);
fs.writeFileSync(WB_PATH, JSON.stringify(wb, null, 2), "utf8");

console.log(`\n✓ 改了 ${changes.length} 处（id ${fixedId} 行 / order ${fixedOrder} 行）：`);
for (const c of changes) console.log(c);
console.log(`\n备份：${backup}`);
console.log("→ 接着重跑 node gen-wheel-order.mjs 确认全部自检通过");
