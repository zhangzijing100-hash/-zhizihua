// 重组整条 TCP 流（两个方向各一份），然后做特征扫描：
//   · zlib / gzip / zstd 魔数
//   · 可打印 ASCII 长串
//   · 中文 UTF-8 串
//   · 伙伴 id（220003xxx）的大端 / 小端 / ASCII 三种写法
//   · 命轮 entryId（4223xxxxx）
import fs from "node:fs";

const file = process.argv[2];
const port = process.argv[3] ?? "55044";
const outPrefix = process.argv[4] ?? "game-dump/device/gamestream";
const buf = fs.readFileSync(file);
const little = buf.readUInt32LE(0) === 0xa1b2c3d4 || buf.readUInt32LE(0) === 0xa1b23c4d;
const rd32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const linkType = rd32(20);

const segs = { out: [], in: [] };
let offset = 24;
while (offset + 16 <= buf.length) {
  const tsSec = rd32(offset), tsUsec = rd32(offset + 4);
  const inclLen = rd32(offset + 8);
  offset += 16;
  if (inclLen === 0 || offset + inclLen > buf.length) break;
  const pkt = buf.subarray(offset, offset + inclLen);
  offset += inclLen;
  const p = linkType === 1 ? 14 : linkType === 113 ? 16 : 0;
  if (pkt.length < p + 20 || (pkt[p] >> 4) !== 4 || pkt[p + 9] !== 6) continue;
  const ihl = (pkt[p] & 0x0f) * 4;
  const l4 = p + ihl;
  const sport = pkt.readUInt16BE(l4), dport = pkt.readUInt16BE(l4 + 2);
  if (String(sport) !== port && String(dport) !== port) continue;
  const seq = pkt.readUInt32BE(l4 + 4);
  const dataOff = ((pkt[l4 + 12] >> 4) & 0x0f) * 4;
  const payload = pkt.subarray(l4 + dataOff);
  if (!payload.length) continue;
  const dir = String(sport) === port ? "out" : "in";
  segs[dir].push({ seq, t: tsSec + tsUsec / 1e6, data: Buffer.from(payload) });
}

const result = {};
for (const dir of ["out", "in"]) {
  segs[dir].sort((a, b) => a.seq - b.seq);
  const chunks = [];
  let expected = null;
  for (const s of segs[dir]) {
    if (expected !== null && s.seq !== expected) {
      chunks.push({ gap: true, from: expected, to: s.seq, t: s.t });
    }
    chunks.push({ seq: s.seq, t: s.t, data: s.data });
    expected = (s.seq + s.data.length) >>> 0;
  }
  const merged = Buffer.concat(chunks.filter((c) => !c.gap).map((c) => c.data));
  fs.writeFileSync(`${outPrefix}.${dir}.bin`, merged);
  result[dir] = { merged, chunks, segs: segs[dir].length };
  const gaps = chunks.filter((c) => c.gap).length;
  console.log(`${dir}: 段=${segs[dir].length} 缺口=${gaps} 重组后=${merged.length} B  -> ${outPrefix}.${dir}.bin`);
}

// ---------------- 扫描 ----------------
function be32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n >>> 0); return b; }
function le32(n) { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; }

const partnerIds = [220003001, 220003002, 220003003, 220003004, 220003005, 220003012, 220003013, 220003037];
const entryIds = [422310011, 422310185, 422330011, 422320082];
const wheelVals = [30, 75, 105, 170, 180, 210, 225, 315];

for (const dir of ["out", "in"]) {
  const d = result[dir].merged;
  console.log(`\n===== 方向 ${dir}（${d.length} B）=====`);
  if (!d.length) continue;

  for (const [name, magic] of [["zlib", Buffer.from([0x78, 0x9c])], ["zlib-low", Buffer.from([0x78, 0x01])],
                               ["gzip", Buffer.from([0x1f, 0x8b])], ["zstd", Buffer.from([0x28, 0xb5, 0x2f, 0xfd])]]) {
    let n = 0, i = 0;
    while ((i = d.indexOf(magic, i)) !== -1) { n++; i++; }
    if (n) console.log(`  ${name} 魔数出现 ${n} 次`);
  }

  let hit = 0;
  for (const id of partnerIds) {
    const be = d.indexOf(be32(id)), le = d.indexOf(le32(id)), as = d.indexOf(Buffer.from(String(id)));
    if (be >= 0 || le >= 0 || as >= 0) { hit++; console.log(`  伙伴 ${id}: BE@${be} LE@${le} ASCII@${as}`); }
  }
  for (const id of entryIds) {
    const be = d.indexOf(be32(id)), le = d.indexOf(le32(id)), as = d.indexOf(Buffer.from(String(id)));
    if (be >= 0 || le >= 0 || as >= 0) console.log(`  命轮 ${id}: BE@${be} LE@${le} ASCII@${as}`);
  }
  if (!hit) console.log(`  （没找到伙伴 id 的 BE/LE/ASCII 写法）`);

  // 可打印 ASCII 长串
  const runs = [];
  let start = -1;
  for (let i = 0; i <= d.length; i++) {
    const b = i < d.length ? d[i] : 0;
    const ok = b >= 32 && b < 127;
    if (ok && start < 0) start = i;
    if (!ok && start >= 0) {
      if (i - start >= 12) runs.push(d.subarray(start, i).toString("latin1"));
      start = -1;
    }
  }
  console.log(`  可打印 ASCII(≥12) 共 ${runs.length} 段，样本：`);
  runs.slice(0, 12).forEach((r) => console.log(`    |${r.slice(0, 90)}|`));

  // 中文
  const zh = d.toString("utf8").match(/[\u4e00-\u9fff]{3,}/g) ?? [];
  console.log(`  中文串(≥3字) ${zh.length} 段，样本: ${zh.slice(0, 12).join(" / ")}`);
}
