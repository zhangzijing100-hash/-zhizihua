// 把客户端→服务器那段摊成十六进制，并检验「4 字节头」的各种假设
import fs from "node:fs";

const d = fs.readFileSync(process.argv[2]);
console.log(`长度 ${d.length} B\n`);
console.log("===== 前 384 字节 =====");
for (let o = 0; o < Math.min(384, d.length); o += 16) {
  const row = d.subarray(o, o + 16);
  const hex = [...row].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const asc = [...row].map((b) => (b >= 32 && b < 127 ? String.fromCharCode(b) : ".")).join("");
  console.log(`${String(o).padStart(6)}  ${hex.padEnd(48)}  |${asc}|`);
}

// 可打印长串的位置
console.log("\n===== 可打印串位置 =====");
let start = -1;
for (let i = 0; i <= d.length; i++) {
  const b = i < d.length ? d[i] : 0;
  const ok = b >= 32 && b < 127;
  if (ok && start < 0) start = i;
  if (!ok && start >= 0) {
    if (i - start >= 8) console.log(`  @${String(start).padStart(6)}  len=${i - start}  |${d.subarray(start, i).toString("latin1").slice(0, 100)}|`);
    start = -1;
  }
}

// 检验假设：前 4 字节是否与载荷有关（异或 / 和 / 长度）
console.log("\n===== 4 字节头假设检验 =====");
function xorAll(b) { let x = 0; for (const v of b) x ^= v; return x; }
function sumAll(b) { let s = 0; for (const v of b) s = (s + v) & 0xff; return s; }
// 按 TCP 分段边界（这里用 pcap 里的段），退而求其次：扫描所有「疑似消息头」位置
// 先假设消息按 4 字节头 + 载荷切；用第一个可打印串的位置反推
const firstText = d.indexOf(Buffer.from("2885150470000000000112108897"));
console.log(`  账号明文起始偏移 = ${firstText}`);
if (firstText > 0) {
  for (let h = Math.max(0, firstText - 8); h < firstText; h++) {
    const head = d.subarray(h, h + 4);
    const rest = d.subarray(h + 4, firstText);
    console.log(`  候选头 @${h}: ${[...head].map((b) => b.toString(16).padStart(2, "0")).join(" ")}` +
      `  head[0]=0x${head[0].toString(16)}  头前载荷 ${rest.length} B` +
      `  xor(全段到此处)=0x${xorAll(d.subarray(h, firstText)).toString(16)}  sum=0x${sumAll(d.subarray(h, firstText)).toString(16)}`);
  }
}
