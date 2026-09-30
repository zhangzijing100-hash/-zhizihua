// 在解包出来的二进制/文本里搜 ASCII 字符串，并打印上下文
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const needle = Buffer.from(process.argv[2] ?? "add_free_voucher", "utf8");

const files = process.argv.slice(3);
if (!files.length) {
  console.error("用法: node t-findcmd.mjs <needle> <file...>");
  process.exit(1);
}

for (const rel of files) {
  const p = path.isAbsolute(rel) ? rel : path.join(root, rel);
  let buf;
  try { buf = fs.readFileSync(p); } catch (e) { console.log(`!! ${rel}: ${e.message}`); continue; }
  let hits = 0;
  let idx = buf.indexOf(needle);
  while (idx !== -1 && hits < 40) {
    hits++;
    const a = Math.max(0, idx - 80), b = Math.min(buf.length, idx + needle.length + 120);
    const ctx = buf.subarray(a, b).toString("latin1").replace(/[^\x20-\x7e\n\r\t]/g, ".");
    console.log(`--- ${rel} @0x${idx.toString(16)} ---`);
    console.log(ctx);
    idx = buf.indexOf(needle, idx + 1);
  }
  console.log(`== ${rel}: ${hits} 处`);
}
