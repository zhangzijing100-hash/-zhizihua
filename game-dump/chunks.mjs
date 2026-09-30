import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const dir = process.cwd();

function tryInflate(buf, off, k) {
  try {
    return zlib.inflateSync(buf.subarray(off, off + k));
  } catch {
    return null;
  }
}

function streamLen(buf, off) {
  const rem = buf.length - off;
  let hi = rem;
  let k = 128;
  let found = false;
  while (k <= rem) {
    if (tryInflate(buf, off, k)) { hi = k; found = true; break; }
    k *= 2;
  }
  if (!found) {
    if (!tryInflate(buf, off, rem)) return -1;
    hi = rem;
  }
  let lo = Math.max(1, hi >> 1);
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (tryInflate(buf, off, mid)) hi = mid; else lo = mid + 1;
  }
  return lo;
}

for (const name of ["configs", "data", "lua"]) {
  const buf = fs.readFileSync(path.join(dir, `${name}.bin`));
  const t0 = Date.now();
  const outs = [];
  const lens = [];
  let pos = 16;
  let fail = 0;
  while (pos < buf.length) {
    const len = streamLen(buf, pos);
    if (len <= 0) { fail++; break; }
    const out = tryInflate(buf, pos, len);
    outs.push(out);
    lens.push(out.length);
    pos += len;
  }
  const total = lens.reduce((a, b) => a + b, 0);
  console.log(`\n=== ${name}.bin ===`);
  console.log(`streams=${outs.length} fail=${fail} endedAt=${pos}/${buf.length} inflatedTotal=${total} (${Date.now() - t0}ms)`);
  if (lens.length) {
    const sorted = [...lens].sort((a, b) => a - b);
    console.log(`stream out: min=${sorted[0]} p50=${sorted[sorted.length >> 1]} max=${sorted[sorted.length - 1]}`);
  }
  const cat = Buffer.concat(outs);
  fs.writeFileSync(path.join(dir, `${name}.cat`), cat);
  console.log("cat head:", cat.subarray(0, 32).toString("hex").replace(/(..)/g, "$1 ").trim());
}
