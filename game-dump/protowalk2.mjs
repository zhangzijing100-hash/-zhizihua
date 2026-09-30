import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bny");
const f = process.argv[2] ?? "drc.gsp.fatecore.confbean.fatecorerankexpcfg.bny";
const buf = fs.readFileSync(path.join(process.cwd(), "bny-raw", f));
console.log(`${f}  ${buf.length} bytes\n`);

function walk(start) {
  let p = start;
  const fields = [];
  let steps = 0;
  while (p < buf.length && steps < 4000) {
    steps++;
    // varint tag
    let tag = 0, shift = 0, ok = false;
    while (p < buf.length && shift < 35) {
      const b = buf[p++];
      tag |= (b & 0x7f) << shift;
      shift += 7;
      if (!(b & 0x80)) { ok = true; break; }
    }
    if (!ok || tag === 0) return { fields, p, reason: "bad tag" };
    const field = tag >>> 3, wt = tag & 7;
    let val, size = 0;
    if (wt === 0) { // varint
      let v = 0n, s = 0n;
      while (p < buf.length) { const b = buf[p++]; v |= BigInt(b & 0x7f) << s; if (!(b & 0x80)) break; s += 7n; }
      val = v; size = 0;
    } else if (wt === 1) { if (p + 8 > buf.length) return { fields, p, reason: "trunc64" }; val = buf.readBigUInt64LE(p); size = 8; p += 8; }
    else if (wt === 2) { let L = 0, s = 0; while (p < buf.length) { const b = buf[p++]; L |= (b & 0x7f) << s; s += 7; if (!(b & 0x80)) break; } if (p + L > buf.length) return { fields, p, reason: "trunc len" }; val = `len=${L}`; size = L; p += L; }
    else if (wt === 5) { if (p + 4 > buf.length) return { fields, p, reason: "trunc32" }; val = buf.readUInt32LE(p); size = 4; p += 4; }
    else return { fields, p, reason: `bad wt ${wt} field ${field}` };
    if (fields.length < 60) fields.push({ p: p - size, field, wt, val });
  }
  return { fields, p, reason: "limit" };
}

let best = null;
for (let s = 0; s < Math.min(buf.length, 4096); s++) {
  const r = walk(s);
  const consumed = r.p - s;
  if (!best || consumed > best.consumed) best = { s, ...r, consumed };
}
console.log(`最佳起�?offset=${best.s}  消费 ${best.consumed}/${buf.length - best.s} 字节  停止原因=${best.reason}`);
console.log("\n�?40 个字�?");
for (const x of best.fields.slice(0, 40)) console.log(`   @${String(x.p).padStart(6)}  field=${String(x.field).padStart(4)} wt=${x.wt}  ${x.val}`);
