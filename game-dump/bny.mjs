// 解析游戏的 *.bny 配置表，并把它和资源包里的名字表对应起来。
//
// 资源包（*.png）结构（逆向出来的）：
//   [若干 zlib 流 = 文件内容]  +  [若干 280 字节的「名字记录」]
//   名字记录的布局：
//     0x000..0x103  以 NUL 结尾的路径，后面补 0
//     0x104         uint32 数据在包内的偏移
//     0x10C         uint32 数据长度
//     0x110         uint32 数据长度（同上）
//     0x114         uint32 0
//   内容与名字**按顺序一一对应**，但未压缩的条目（.bny 就是）不会被 zlib 扫描器发现，
//   所以必须靠名字记录里的偏移/长度去取。
//
// .bny 结构：一串定长记录，每条以 4 字节标记开头（19 2E D6 XX，XX 是记录序号），
//           字段是**大端 int32**。
import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";

export const BNY_MARK = [0x19, 0x2e, 0xd6];

/** 从资源包里取出「名字记录」数组 */
export function readNameRecords(packPath) {
  const { entries } = unpackPng(packPath);
  const recs = [];
  for (const e of entries) {
    if (e.data.length !== 280) continue;
    const name = e.data.toString("latin1").split("\u0000")[0];
    if (!name) continue;
    recs.push({
      name,
      offset: e.data.readUInt32LE(0x104),
      size: e.data.readUInt32LE(0x10c),
    });
  }
  return recs;
}

/** 取某个文件的内容 */
export function readFile(packPath, rec) {
  const buf = fs.readFileSync(packPath);
  return buf.subarray(rec.offset, rec.offset + rec.size);
}

/** 把一条 bny 记录拆成 int32 数组（大端），跳过开头的 4 字节标记 */
export function parseBny(buf) {
  // 先找所有记录起点
  const starts = [];
  for (let i = 0; i + 4 <= buf.length; i++) {
    if (buf[i] === BNY_MARK[0] && buf[i + 1] === BNY_MARK[1] && buf[i + 2] === BNY_MARK[2]) starts.push(i);
  }
  if (starts.length < 2) return { recordSize: 0, records: [] };
  // 记录长度 = 相邻起点的差（取众数）
  const diffs = new Map();
  for (let i = 1; i < starts.length; i++) {
    const d = starts[i] - starts[i - 1];
    if (d > 4 && d < 4096) diffs.set(d, (diffs.get(d) || 0) + 1);
  }
  let recordSize = 0, best = 0;
  for (const [d, n] of diffs) if (n > best) { best = n; recordSize = d; }
  if (!recordSize) return { recordSize: 0, records: [] };

  const records = [];
  for (const s of starts) {
    if (s + recordSize > buf.length) break;
    const ints = [];
    for (let off = 4; off + 4 <= recordSize; off += 4) ints.push(buf.readInt32BE(s + off));
    records.push({ at: s, index: buf[s + 3], ints });
  }
  return { recordSize, records };
}
