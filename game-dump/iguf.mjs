import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const dir = process.cwd();
const MARK = Buffer.from([0x4d, 0x25, 0xed, 0xbc]);
const HDR = 22;

function openChunks(buf, startAt) {
  const parts = [];
  let pos = startAt, chunks = 0, flags = {};
  const stops = [];
  while (pos + HDR <= buf.length) {
    if (!buf.subarray(pos, pos + 4).equals(MARK)) { stops.push({ at: pos, why: "no-mark", bytes: buf.subarray(pos, pos + 16).toString("hex") }); break; }
    const flag = buf.readUInt16LE(pos + 4);
    const usize = buf.readUInt32LE(pos + 6);
    const csize = buf.readUInt32LE(pos + 18);
    if (pos + HDR + csize > buf.length) { stops.push({ at: pos, why: "truncated", usize, csize }); break; }
    const raw = buf.subarray(pos + HDR, pos + HDR + csize);
    let data;
    if (flag === 1) {
      try { data = zlib.zstdDecompressSync(raw); } catch (e) { stops.push({ at: pos, why: "zstd:" + e.message, flag, usize, csize }); break; }
    } else if (flag === 0) { data = Buffer.from(raw); }
    else { stops.push({ at: pos, why: "flag" + flag, flag, usize, csize }); break; }
    parts.push({ data, at: pos, flag, usize, csize });
    flags[flag] = (flags[flag] || 0) + 1;
    chunks++;
    pos += HDR + csize;
  }
  return { parts, chunks, flags, pos, stops };
}

const name = process.argv[2];
const startAtArg = process.argv[3] ? parseInt(process.argv[3], 10) : null;
const buf = fs.readFileSync(path.join(dir, name));
const startAt = startAtArg ?? buf.indexOf(MARK);
console.log(`${name}: len=${buf.length} firstMark=${buf.indexOf(MARK)} startAt=${startAt}`);
const r = openChunks(buf, startAt);
console.log(`chunks=${r.chunks} flags=${JSON.stringify(r.flags)} endPos=${r.pos}`);
for (const s of r.stops) console.log("  stop:", JSON.stringify(s));
const cat = Buffer.concat(r.parts.map((p) => p.data));
fs.writeFileSync(path.join(dir, name + ".cat"), cat);
console.log(`out=${cat.length}`);
console.log("head hex:", cat.subarray(0, 128).toString("hex").replace(/(..)/g, "$1 ").trim());
console.log("head asc:", cat.subarray(0, 128).toString("latin1").replace(/[^\x20-\x7e]/g, "."));

const sb = [];
let cur = "";
for (const b of cat) {
  if (b >= 32 && b < 127) cur += String.fromCharCode(b);
  else { if (cur.length >= 6) sb.push(cur); cur = ""; }
}
if (cur.length >= 6) sb.push(cur);
console.log(`strings=${sb.length}`);
const hit = sb.filter((s) => /bny|FateCore|fatecore|\.lua/i.test(s));
console.log("keyword hits:", hit.slice(0, 20));
console.log("samples:", sb.slice(0, 12));
