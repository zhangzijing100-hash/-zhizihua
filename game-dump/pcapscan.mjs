// PCAPdroid 抓到的 pcap 拆包分析
//   1. 列出所有 TCP/UDP 流（谁跟谁说话、各多少字节）
//   2. 对指定流把两个方向的载荷按序号重组成文本，打印可读片段
//   3. 判断是否为 TLS（看头几个字节）
import fs from "node:fs";

const file = process.argv[2];
const buf = fs.readFileSync(file);

// ---- pcap 全局头 ----
const magic = buf.readUInt32LE(0);
let little;
if (magic === 0xa1b2c3d4) little = true;         // 文件里是小端写的大端魔数
else if (magic === 0xd4c3b2a1) little = false;
else if (magic === 0xa1b23c4d || magic === 0x4d3cb2a1) little = true;
else throw new Error("不是 pcap 文件，magic=0x" + magic.toString(16));

const rd32 = (o) => (little ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
const rd16 = (o) => (little ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
const linkType = rd32(20);
const snaplen = rd32(16);
console.log(`pcap  版本=${rd16(4)}.${rd16(6)}  snaplen=${snaplen}  linkType=${linkType}  文件=${(buf.length/1048576).toFixed(2)} MB`);
console.log(`linkType 101=RAW(IP)  1=Ethernet  113=LinuxSLL`);

// ---- 逐包 ----
const flows = new Map();
let offset = 24, packets = 0, ipv4 = 0, tcp = 0, udp = 0;
let firstTs = null, lastTs = null;

function flowKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

while (offset + 16 <= buf.length) {
  const tsSec = rd32(offset), tsUsec = rd32(offset + 4);
  const inclLen = rd32(offset + 8);
  offset += 16;
  if (inclLen === 0 || offset + inclLen > buf.length) break;
  const pkt = buf.subarray(offset, offset + inclLen);
  offset += inclLen;
  packets += 1;
  if (firstTs === null) firstTs = tsSec + tsUsec / 1e6;
  lastTs = tsSec + tsUsec / 1e6;

  let p = 0;
  if (linkType === 1) p = 14;                                  // Ethernet
  else if (linkType === 113) p = 16;                            // Linux SLL
  else if (linkType === 101 || linkType === 228 || linkType === 12) p = 0; // RAW / IPv4
  if (pkt.length < p + 20) continue;
  const vihl = pkt[p];
  if ((vihl >> 4) !== 4) continue;
  ipv4 += 1;
  const ihl = (vihl & 0x0f) * 4;
  const proto = pkt[p + 9];
  const srcIp = `${pkt[p+12]}.${pkt[p+13]}.${pkt[p+14]}.${pkt[p+15]}`;
  const dstIp = `${pkt[p+16]}.${pkt[p+17]}.${pkt[p+18]}.${pkt[p+19]}`;
  const l4 = p + ihl;
  if (proto === 6) {
    tcp += 1;
    if (pkt.length < l4 + 20) continue;
    const sport = pkt.readUInt16BE(l4), dport = pkt.readUInt16BE(l4 + 2);
    const seq = pkt.readUInt32BE(l4 + 4);
    const dataOff = ((pkt[l4 + 12] >> 4) & 0x0f) * 4;
    const payload = pkt.subarray(l4 + dataOff);
    const a = `${srcIp}:${sport}`, b = `${dstIp}:${dport}`;
    const key = flowKey(a, b);
    let f = flows.get(key);
    if (!f) { f = { a, b, proto: "TCP", segs: [], bytes: 0, packets: 0 }; flows.set(key, f); }
    f.packets += 1;
    if (payload.length) {
      f.bytes += payload.length;
      f.segs.push({ from: a, seq, data: Buffer.from(payload) });
    }
  } else if (proto === 17) {
    udp += 1;
    if (pkt.length < l4 + 8) continue;
    const sport = pkt.readUInt16BE(l4), dport = pkt.readUInt16BE(l4 + 2);
    const len = pkt.readUInt16BE(l4 + 4);
    const payload = pkt.subarray(l4 + 8, l4 + Math.max(8, len));
    const a = `${srcIp}:${sport}`, b = `${dstIp}:${dport}`;
    const key = `UDP ${flowKey(a, b)}`;
    let f = flows.get(key);
    if (!f) { f = { a, b, proto: "UDP", segs: [], bytes: 0, packets: 0 }; flows.set(key, f); }
    f.packets += 1;
    if (payload.length) {
      f.bytes += payload.length;
      f.segs.push({ from: a, seq: 0, data: Buffer.from(payload) });
    }
  }
}

console.log(`\n包数=${packets}  IPv4=${ipv4}  TCP=${tcp}  UDP=${udp}  时长=${((lastTs-firstTs)||0).toFixed(1)}秒`);
console.log(`\n===== 流列表（按载荷字节排序）=====`);
const list = [...flows.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
for (const [key, f] of list) {
  console.log(`  ${String(f.bytes).padStart(8)} B  ${String(f.packets).padStart(5)} pkts  ${f.proto.padEnd(3)}  ${f.a}  <->  ${f.b}`);
}

// ---- 判断每个流是不是 TLS ----
console.log(`\n===== 协议判别（看每流首个载荷的前几字节）=====`);
for (const [, f] of list) {
  if (!f.bytes) continue;
  const segs = [...f.segs].sort((x, y) => x.seq - y.seq);
  const head = segs[0].data.subarray(0, 16);
  const hex = [...head].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  let kind = "未知(自定义?)";
  if (head[0] === 0x16 && head[1] === 0x03) kind = "★ TLS ClientHello";
  else if (head[0] === 0x17 && head[1] === 0x03) kind = "★ TLS ApplicationData";
  else if (head[0] === 0x15 && head[1] === 0x03) kind = "TLS Alert";
  else if (/^(47 45 54|50 4f 53 54|48 54 54 50)/.test(hex.replace(/ /g, " ").toUpperCase())) kind = "HTTP";
  console.log(`  ${f.a} <-> ${f.b}\n      ${hex}   ${kind}`);
}
