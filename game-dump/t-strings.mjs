// 打印一段区间里的可打印字符串（含 UTF-8 中文）
import fs from "node:fs";

const file = process.argv[2];
const start = parseInt(process.argv[3], 0);
const end = parseInt(process.argv[4], 0);
const min = parseInt(process.argv[5] ?? "3", 0);
const buf = fs.readFileSync(file).subarray(start, end);
const dec = new TextDecoder("utf-8", { fatal: false });

let pos = start;
let i = 0;
while (i < buf.length) {
  // 收集一个连续的可打印区段：ASCII 可见 + UTF-8 多字节
  const s = i;
  while (i < buf.length) {
    const b = buf[i];
    if (b >= 0x20 && b < 0x7f) { i++; continue; }
    if (b >= 0xc2 && b <= 0xf4) { i++; continue; } // UTF-8 前导字节
    if (b >= 0x80 && b < 0xc0) { i++; continue; }  // 续字节
    break;
  }
  if (i - s >= min) {
    const raw = buf.subarray(s, i);
    const txt = dec.decode(raw);
    if (!txt.includes("\ufffd") || /[\u4e00-\u9fff]/.test(txt)) {
      console.log(`${(start + s).toString(16).padStart(8, "0")}  ${txt}`);
    }
  }
  i = i === s ? s + 1 : i;
}
