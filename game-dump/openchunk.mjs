import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const dir = process.cwd();
const MARK = Buffer.from([0x4d, 0x25, 0xed, 0xbc]);
const HDR = 22;

for (const name of process.argv.slice(2)) {
  const buf = fs.readFileSync(path.join(dir, `${name}.bin`));
  const parts = [];
  const flags = {};
  let pos = 16, chunks = 0, bad = 0;
  const t0 = Date.now();
  while (pos + HDR <= buf.length) {
    if (!buf.subarray(pos, pos + 4).equals(MARK)) { bad++; break; }
    const flag = buf.readUInt16LE(pos + 4);
    const usize = buf.readUInt32LE(pos + 6);
    const csize = buf.readUInt32LE(pos + 18);
    if (pos + HDR + csize > buf.length) { bad++; break; }
    if (csize === 0 && usize === 0) break;
    const raw = buf.subarray(pos + HDR, pos + HDR + csize);
    let data;
    if (flag === 1) {
      try { data = zlib.zstdDecompressSync(raw); } catch { try { data = zlib.inflateSync(raw); } catch { bad++; break; } }
    } else {
      data = Buffer.from(raw);
    }
    parts.push(data);
    flags[flag] = (flags[flag] || 0) + 1;
    chunks++;
    pos += HDR + csize;
  }
  const cat = Buffer.concat(parts);
  fs.writeFileSync(path.join(dir, `${name}.dat`), cat);
  console.log(`\n=== ${name}.bin ===`);
  console.log(`chunks=${chunks} bad=${bad} endedPos=${pos}/${buf.length} out=${cat.length} (${Date.now() - t0}ms)`);
  console.log(`flags:`, JSON.stringify(flags));
  console.log("head:", cat.subarray(0, 96).toString("hex").replace(/(..)/g, "$1 ").trim());
  console.log("asc :", cat.subarray(0, 96).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
