import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const dir = process.cwd();

function tryInflate(buf, off, k) {
  try { return zlib.inflateSync(buf.subarray(off, off + k)); } catch { return null; }
}
function streamLen(buf, off) {
  const rem = buf.length - off;
  let hi = rem, k = 128, found = false;
  while (k <= rem) { if (tryInflate(buf, off, k)) { hi = k; found = true; break; } k *= 2; }
  if (!found) { if (!tryInflate(buf, off, rem)) return -1; hi = rem; }
  let lo = Math.max(1, hi >> 1);
  while (lo < hi) { const mid = (lo + hi) >> 1; if (tryInflate(buf, off, mid)) hi = mid; else lo = mid + 1; }
  return lo;
}

for (const name of process.argv.slice(2)) {
  const buf = fs.readFileSync(path.join(dir, `${name}.bin`));
  const magic = buf.subarray(0, 4).toString("hex");
  console.log(`\n=== ${name}.bin  len=${buf.length}  magic=${magic} ===`);
  if (magic !== "ef23ca4d") {
    console.log("head:", buf.subarray(0, 64).toString("hex").replace(/(..)/g, "$1 ").trim());
    console.log("asc :", buf.subarray(0, 64).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
    continue;
  }
  console.log("hdr fields:", buf.readUInt32LE(4), buf.readUInt32LE(8), buf.readUInt32LE(12).toString(16));
  const outs = [];
  let pos = 16, fail = 0;
  while (pos < buf.length) {
    const len = streamLen(buf, pos);
    if (len <= 0) { fail++; break; }
    outs.push(tryInflate(buf, pos, len));
    pos += len;
  }
  const cat = Buffer.concat(outs);
  fs.writeFileSync(path.join(dir, `${name}.cat`), cat);
  console.log(`streams=${outs.length} fail=${fail} endedAt=${pos}/${buf.length} out=${cat.length}`);
  console.log("head:", cat.subarray(0, 64).toString("hex").replace(/(..)/g, "$1 ").trim());
  console.log("asc :", cat.subarray(0, 64).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
