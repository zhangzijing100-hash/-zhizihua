import fs from "node:fs";
function entropy(b) {
  if (!b.length) return 0;
  const c = new Array(256).fill(0);
  for (const v of b) c[v]++;
  let h = 0;
  for (const n of c) if (n) { const p = n / b.length; h -= p * Math.log2(p); }
  return h;
}
// 宽容的 protobuf 扫描：连续能解析成「合法 tag」的最长游程
function pbRun(b) {
  let i = 0, best = 0, cur = 0;
  while (i < b.length) {
    const tag = b[i];
    const field = tag >> 3, wire = tag & 7;
    if (field >= 1 && field <= 2000 && (wire === 0 || wire === 1 || wire === 2 || wire === 5)) {
      i++;
      if (wire === 0) { while (i < b.length && b[i] & 0x80) i++; i++; }
      else if (wire === 1) i += 8;
      else if (wire === 5) i += 4;
      else { if (i >= b.length) break; let len = 0, sh = 0; while (i < b.length && b[i] & 0x80) { len |= (b[i] & 0x7f) << sh; sh += 7; i++; } if (i >= b.length) break; len |= b[i] << sh; i++; i += len; }
      cur++;
      if (i > b.length) break;
      if (cur > best) best = cur;
    } else { cur = 0; i++; }
  }
  return best;
}
for (const name of ["device/gamestream.out.bin", "device/gamestream.in.bin"]) {
  const d = fs.readFileSync(name);
  console.log(`${name}  ${d.length} B`);
  console.log(`   整体熵 = ${entropy(d).toFixed(3)} bits/byte   （8.0=全随机/加密，5-6=结构化二进制）`);
  // 从第 200 字节开始（跳过握手明文）
  const body = d.subarray(200);
  console.log(`   body(跳过前200B) 熵 = ${entropy(body).toFixed(3)}   最长连续合法 protobuf tag 游程 = ${pbRun(body)} 个字段`);
  // 分块熵，看是否有明文区
  const chunk = Math.floor(d.length / 12) || 1;
  const parts = [];
  for (let o = 0; o < d.length; o += chunk) parts.push(entropy(d.subarray(o, o + chunk)).toFixed(2));
  console.log(`   分块熵(12块) = ${parts.join(" ")}`);
}
