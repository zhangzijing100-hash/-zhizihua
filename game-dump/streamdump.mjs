// 把某条 TCP 流按方向重组，逐段打印长度 + 十六进制 + 可见字符，用来找帧结构
import fs from "node:fs";

const file = process.argv[2];
const matchA = process.argv[3]; // 例如 "55044"
const limit = Number(process.argv[4] ?? 40);
const buf = fs.readFileSync(file);
const little = buf.readUInt32LE(0) === 0xa1b2c3d4 || buf.readUInt32LE(0) === 0xa1b23c4d;
const rd32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const linkType = rd32(20);

const dirs = new Map();
let offset = 24;
while (offset + 16 <= buf.length) {
  const inclLen = rd32(offset + 8);
  offset += 16;
  if (inclLen === 0 || offset + inclLen > buf.length) break;
  const pkt = buf.subarray(offset, offset + inclLen);
  offset += inclLen;
  let p = linkType === 1 ? 14 : linkType === 113 ? 16 : 0;
  if (pkt.length < p + 20 || (pkt[p] >> 4) !== 4) continue;
  const ihl = (pkt[p] & 0x0f) * 4;
  if (pkt[p + 9] !== 6) continue;
  const l4 = p + ihl;
  const sport = pkt.readUInt16BE(l4), dport = pkt.readUInt16BE(l4 + 2);
  if (String(sport) !== matchA && String(dport) !== matchA) continue;
  const seq = pkt.readUInt32BE(l4 + 4);
  const flags = pkt[l4 + 13];
  const dataOff = ((pkt[l4 + 12] >> 4) & 0x0f) * 4;
  const payload = pkt.subarray(l4 + dataOff);
  const dir = String(sport) === matchA ? "OUT ->" : "<- IN ";
  if (!payload.length) continue;
  if (!dirs.has(dir)) dirs.set(dir, []);
  dirs.get(dir).push({ seq, flags, data: Buffer.from(payload) });
}

for (const [dir, segs] of dirs) {
  segs.sort((a, b) => a.seq - b.seq);
  const total = segs.reduce((n, s) => n + s.data.length, 0);
  console.log(`\n############ ${dir}  段数=${segs.length}  载荷=${total} B ############`);
  segs.slice(0, limit).forEach((s, i) => {
    const hex = [...s.data.subarray(0, 48)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    const ascii = [...s.data.subarray(0, 32)].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
    console.log(`  #${String(i).padStart(3)} len=${String(s.data.length).padStart(5)} seq=${String(s.seq).padStart(10)}  ${hex}${s.data.length > 48 ? " …" : ""}`);
    console.log(`        |${ascii}|`);
  });
}
