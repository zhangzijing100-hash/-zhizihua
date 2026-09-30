import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const dir = process.cwd();
const name = process.argv[2];
const buf = fs.readFileSync(path.join(dir, name));

function streamLenAt(off) {
  const rem = buf.length - off;
  let hi = rem, k = 128, found = false;
  while (k <= rem) { try { if (zlib.inflateSync(buf.subarray(off, off + k))) { hi = k; found = true; break; } } catch {} k *= 2; }
  if (!found) { try { zlib.inflateSync(buf.subarray(off)); hi = rem; } catch { return -1; } }
  let lo = Math.max(1, hi >> 1);
  while (lo < hi) { const mid = (lo + hi) >> 1; let ok = false; try { zlib.inflateSync(buf.subarray(off, off + mid)); ok = true; } catch {} if (ok) hi = mid; else lo = mid + 1; }
  return lo;
}

const candidates = [];
let i = 16;
while ((i = buf.indexOf(Buffer.from([0x78, 0x01]), i)) !== -1) { candidates.push(i); i += 2; }
console.log(`${name}: len=${buf.length} candidates=${candidates.length}`);

const parts = [];
let pos = 16;
let ok = 0, miss = 0;
const gaps = [];
while (pos < buf.length) {
  let p = pos;
  while (p < buf.length && !(buf[p] === 0x78 && buf[p + 1] === 0x01)) p++;
  if (p >= buf.length) break;
  const len = streamLenAt(p);
  if (len <= 0) { miss++; pos = p + 2; continue; }
  let out = null;
  try { out = zlib.inflateSync(buf.subarray(p, p + len)); } catch { miss++; pos = p + 2; continue; }
  if (p > pos) gaps.push(p - pos);
  parts.push({ at: p, len, out });
  ok++;
  pos = p + len;
}
const cat = Buffer.concat(parts.map((x) => x.out));
fs.writeFileSync(path.join(dir, name + ".full"), cat);
console.log(`streams=${ok} miss=${miss} out=${cat.length}`);
console.log(`gap sizes (top):`, [...gaps].sort((a, b) => b - a).slice(0, 10).join(", "));

const sb = [];
let cur = "";
for (const b of cat) { if (b >= 32 && b < 127) cur += String.fromCharCode(b); else { if (cur.length >= 6) sb.push(cur); cur = ""; } }
if (cur.length >= 6) sb.push(cur);
console.log(`strings=${sb.length}`);
const kw = sb.filter((s) => /FateCore|fatecore|\.bny|holycore/i.test(s));
console.log(`keyword hits=${kw.length}`);
console.log(kw.slice(0, 20));
console.log("samples:", sb.slice(0, 10));
