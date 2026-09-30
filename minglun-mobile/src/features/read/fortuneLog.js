// 解析游戏调试控制台命令 `printfortunewheel` 的输出。
//
// 流程（游戏里做）：停在命轮界面 → 命令行执行 `printfortunewheel` → 日志面板点「保存」
//   → 游戏把日志写到 /sdcard/Android/data/<包名>/files/DebugLog/Debug-<时间>.log
//
// 文件结构：
//   命轮方案
//   ================
//   物质之轮 / 执行之轮 / 创始之轮 / 宿命之轮
//   命轮物品\t\t\t\t使用数量\t\t使用上限
//   <名字><itemId>\t\t\t\t<已用>\t\t<上限>
//   ================
//   总计
//   命轮物品\t\t\t\t多方案总用量\t\t包裹内未用
//   <名字><itemId>\t\t\t\t<多方案总用量>\t\t<包裹内未用>   ← 这一列才是背包里实际有多少
//
// 只有「总计」段是全量（命令里遍历 CFortuneWheelItemCfg.GetAllRecords()）。

import { partnerOfWheelItem } from "./wheelInventoryMap.js";

const ROW_RE = /^(.+?)(\d{6,})\t+(\d+)\t+(\d+)$/;
const SECTION_RE = /^(物质之轮|执行之轮|创始之轮|宿命之轮|总计)$/;

/** 把日志文本切成若干段 */
export function parseSections(text) {
  const sections = [];
  let cur = null;
  for (const line of String(text ?? "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith("========")) { cur = null; continue; }
    if (SECTION_RE.test(t)) { cur = { name: t, rows: [] }; sections.push(cur); continue; }
    if (t.startsWith("命轮物品") || t === "命轮方案") continue;
    const m = line.match(ROW_RE);
    if (m && cur) cur.rows.push({ wheelName: m[1], itemId: m[2], used: Number(m[3]), left: Number(m[4]) });
  }
  return sections;
}

/**
 * 解析成「伙伴 -> 命轮数量」。
 *
 * 关键口径（来自 wheeloffortunemgr.lua 的 GetItemCanConsumeNumber）：
 *   玩家实际持有 = GetItemNumber(id)              ← 总计段第三列「包裹内未用」
 *                + GetFortuneWheelDepositeItemNum(id) ← 总计段第二列「多方案总用量」
 * 第二列是**单独一个池子**（已存入命轮方案系统的数量），不在背包里。
 * 只看第三列的话，玩家一旦往方案里存过命轮，读出来就会偏低。
 *
 * @param {string} text 日志原文
 * @param {{includeDeposit?: boolean}} [opts] includeDeposit=false 时只算包裹内（默认 true）
 */
export function parseFortuneLog(text, opts = {}) {
  const includeDeposit = opts.includeDeposit !== false;
  const sections = parseSections(text);
  const total = sections.find((s) => s.name === "总计");
  if (!total || !total.rows.length) {
    return { ok: false, reason: "日志里没有找到「总计」段 —— 确认游戏里执行的是 printfortunewheel", entries: [], byPartner: new Map(), raw: { sections } };
  }
  const entries = [];
  const byPartner = new Map();
  for (const r of total.rows) {
    const partner = partnerOfWheelItem(r.itemId);
    if (!partner) continue;                       // 42255* 那一套忽略
    const bag = r.left;                           // 包裹内未用
    const deposit = r.used;                       // 多方案总用量（已存入方案）
    const count = includeDeposit ? bag + deposit : bag;
    entries.push({ partner, itemId: r.itemId, wheelName: r.wheelName, count, bag, deposit });
    const prev = byPartner.get(partner);
    if (prev == null || count > prev) byPartner.set(partner, count);
  }
  return { ok: true, includeDeposit, updatedAt: null, entries, byPartner, raw: { sections } };
}

/** 从文件名 Debug-09-20-18-39-40.log 里拿时间（仅用于展示） */
export function timeFromLogName(name) {
  const m = String(name ?? "").match(/^Debug-(\d{2})-(\d{2})-(\d{2})-(\d{2})-(\d{2})\.log$/);
  return m ? `${m[1]}-${m[2]} ${m[3]}:${m[4]}:${m[5]}` : null;
}
