// 列出某方向所有 TCP 段（≈协议消息）的长度与前 8 字节，用来反推消息头格式
import fs from "node:fs";

const file = process.argv[2];
const port = process.argv[3];
const want = process.argv[4] ?? "out";
const buf = fs.readFileSync(file);
const little = buf.readUInt32LE(0) === 0xa1b2c3d4 || buf.readUInt32LE(0) === 0xa1b23c4d;
const rd32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const linkType = rd32(20);

const rows = [];
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
  const isOut = String(sport) === port;
  if ((want === "out") !== isOut) continue;
  const seq = pkt.readUInt32BE(l4 + 4);
  const dataOff = ((pkt[l4 + 12] >> 4) & 0x0f) * 4;
  const payload = pkt.subarray(l4 + dataOff);
  if (payload.length) rows.push({ seq, t: tsSec + tsUsec / 1e6, data: Buffer.from(payload) });
}
rows.sort((a, b) => a.seq - b.seq);

console.log(`${want} 方向共 ${rows.length} 段\n`);
console.log("   #   len   head[0..7]                         head 当作 BE/LE int32      前几个载荷字节");
rows.forEach((r, i) => {
  const h = r.data.subarray(0, 8);
  const hex = [...h].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const be = r.data.length >= 4 ? r.data.readUInt32BE(0) : 0;
  const le = r.data.length >= 4 ? r.data.readUInt32LE(0) : 0;
  const rest = [...r.data.subarray(4, 14)].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
  console.log(`  ${String(i).padStart(3)} ${String(r.data.length).padStart(5)}  ${hex.padEnd(24)}  BE=${String(be).padStart(11)} LE=${String(le).padStart(11)}  |${rest}|`);
});
