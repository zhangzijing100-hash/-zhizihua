import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const dir = process.cwd();
console.log("zstd support:", typeof zlib.zstdDecompressSync, "| createZstdDecompress:", typeof zlib.createZstdDecompress);

const ZMAGIC = Buffer.from([0x28, 0xb5, 0x2f, 0xfd]);

function findFrame(buf, from) {
  let i = from;
  while ((i = buf.indexOf(ZMAGIC, i)) !== -1) {
    try {
      const r = zlib.zstdDecompressSync(buf.subarray(i), { info: true });
      return { off: i, data: r.buffer, consumed: r.engine.bytesWritten };
    } catch {
      i += 4;
    }
  }
  return null;
}

for (const name of process.argv.slice(2)) {
  const buf = fs.readFileSync(path.join(dir, `${name}.bin`));
  const frames = [];
  let pos = 0;
  while (pos < buf.length) {
    const f = findFrame(buf, pos);
    if (!f) break;
    frames.push(f);
    pos = f.off + f.consumed;
  }
  const cat = Buffer.concat(frames.map((f) => f.data));
  fs.writeFileSync(path.join(dir, `${name}.zcat`), cat);
  console.log(`\n=== ${name}.bin  len=${buf.length} ===`);
  console.log(`frames=${frames.length}  out=${cat.length}  lastEnd=${pos}  consumedTotal=${frames.reduce((a, f) => a + f.consumed, 0)}`);
  if (frames.length) console.log(`  frame offsets: ${frames.slice(0, 6).map((f) => `${f.off}(${f.consumed}B->${f.data.length}B)`).join(", ")}`);
  console.log("head hex:", cat.subarray(0, 64).toString("hex").replace(/(..)/g, "$1 ").trim());
  console.log("head asc:", cat.subarray(0, 64).toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
