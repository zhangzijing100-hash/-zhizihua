import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const f = process.argv[2] ?? "Azure-Android_ASTC.pak";
const buf = fs.readFileSync(path.join(dir, f));
console.log(`${f}  ${buf.length} bytes`);

// UE4 pak footer magic 0x5A6F12E1
const MAGIC = Buffer.from([0xe1, 0x12, 0x6f, 0x5a]);
const positions = [];
let i = 0;
while ((i = buf.indexOf(MAGIC, i)) !== -1) { positions.push(i); i += 4; }
console.log("pak magic 0x5A6F12E1 at:", positions.join(", ") || "(none)");

// also check for zlib/zstd/gzip/custom
for (const [name, m] of [["zlib 78 01", [0x78, 0x01]], ["zlib 78 9c", [0x78, 0x9c]], ["zlib 78 da", [0x78, 0xda]], ["zstd", [0x28, 0xb5, 0x2f, 0xfd]], ["gzip", [0x1f, 0x8b]], ["uasset", [0xc1, 0x83, 0x2a, 0x9e]]]) {
  const mb = Buffer.from(m);
  let c = 0, first = -1, p = 0;
  while ((p = buf.indexOf(mb, p)) !== -1) { c++; if (first < 0) first = p; p += 1; }
  console.log(`  ${name}: ${c} 次, 首次 @${first}`);
}

if (positions.length) {
  const pos = positions[positions.length - 1];
  console.log(`\n=== 末位 footer @${pos} 起 64 字节 ===`);
  for (let o = pos - 0; o < Math.min(pos + 64, buf.length); o += 16) {
    const row = buf.subarray(o, o + 16);
    console.log(String(o).padStart(10), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48), row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
  }
  const tail = buf.length - pos;
  console.log("footer 距文件尾:", tail, "字节");
  if (tail >= 44) {
    const p = buf.length - 44;
    console.log("standard footer fields @", p);
    console.log("  EncryptionKeyGuid:", buf.subarray(p, p + 16).toString("hex"));
    console.log("  bEncryptedIndex  :", buf.readUInt8(p + 16));
    console.log("  Magic            :", buf.readUInt32LE(p + 17).toString(16));
    console.log("  Version          :", buf.readUInt32LE(p + 21));
    console.log("  IndexOffset      :", buf.readBigInt64LE(p + 25).toString());
    console.log("  IndexSize        :", buf.readBigInt64LE(p + 33).toString());
    console.log("  IndexHash(20)    :", buf.subarray(p + 41, p + 61).toString("hex"));
  }
}
