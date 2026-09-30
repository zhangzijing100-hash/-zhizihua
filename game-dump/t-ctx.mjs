// dump 一段字节，左侧文本右侧 hex
import fs from "node:fs";

const file = process.argv[2];
const off = parseInt(process.argv[3], 0);
const len = parseInt(process.argv[4] ?? "1024", 0);
const buf = fs.readFileSync(file).subarray(off, off + len);
const W = 16;
for (let i = 0; i < buf.length; i += W) {
  const row = buf.subarray(i, i + W);
  const hex = [...row].map((b) => b.toString(16).padStart(2, "0")).join(" ");
  const txt = [...row].map((b) => (b >= 0x20 && b < 0x7f ? String.fromCharCode(b) : ".")).join("");
  console.log(`${(off + i).toString(16).padStart(8, "0")}  ${hex.padEnd(47)}  ${txt}`);
}
