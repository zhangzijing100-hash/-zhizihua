import fs from "node:fs";
const buf = fs.readFileSync(process.argv[2]);
const little = buf.readUInt32LE(0) === 0xa1b2c3d4 || buf.readUInt32LE(0) === 0xa1b23c4d;
const rd32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const linkType = rd32(20);
const names = new Map();
let offset = 24;
while (offset + 16 <= buf.length) {
  const tsSec = rd32(offset), tsUsec = rd32(offset + 4);
  const inclLen = rd32(offset + 8);
  offset += 16;
  if (inclLen === 0 || offset + inclLen > buf.length) break;
  const pkt = buf.subarray(offset, offset + inclLen);
  offset += inclLen;
  const p = linkType === 1 ? 14 : linkType === 113 ? 16 : 0;
  if (pkt.length < p + 20 || (pkt[p] >> 4) !== 4 || pkt[p + 9] !== 17) continue;
  const ihl = (pkt[p] & 0x0f) * 4;
  const l4 = p + ihl;
  const dport = pkt.readUInt16BE(l4 + 2);
  if (dport !== 53) continue;
  let q = l4 + 8 + 12; // UDP 头 + DNS 头
  const labels = [];
  while (q < pkt.length && pkt[q] !== 0) {
    const len = pkt[q];
    if (len > 63) break;
    labels.push(pkt.subarray(q + 1, q + 1 + len).toString("latin1"));
    q += 1 + len;
  }
  if (labels.length) {
    const name = labels.join(".");
    if (!names.has(name)) names.set(name, tsSec + tsUsec / 1e6);
  }
}
const t0 = Math.min(...names.values());
console.log(`抓到 ${names.size} 个域名解析：\n`);
for (const [n, t] of [...names.entries()].sort((a, b) => a[1] - b[1])) {
  console.log(`  T+${String(Math.round(t - t0)).padStart(4)}s   ${n}`);
}
