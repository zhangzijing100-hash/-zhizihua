import fs from "node:fs";
import zlib from "node:zlib";
import path from "node:path";

const dir = process.cwd();

for (const name of ["configs", "lua", "data"]) {
  const src = path.join(dir, `${name}.bin`);
  const buf = fs.readFileSync(src);
  console.log(`\n=== ${name}.bin  (${buf.length} bytes) ===`);
  console.log("magic      :", buf.subarray(0, 4).toString("hex"));
  console.log("field4     :", buf.readUInt32LE(4), "(file size =", buf.length, ")");
  console.log("field8     :", buf.readUInt32LE(8));
  console.log("field12    :", buf.readUInt32LE(12).toString(16));
  console.log("zlib magic :", buf.subarray(16, 18).toString("hex"));

  let out;
  try {
    out = zlib.inflateSync(buf.subarray(16));
    console.log("inflate OK :", out.length, "bytes");
  } catch (e) {
    console.log("inflate FAIL (zlib):", e.message);
    try {
      out = zlib.inflateRawSync(buf.subarray(18));
      console.log("inflateRaw OK:", out.length, "bytes");
    } catch (e2) {
      console.log("inflateRaw FAIL:", e2.message);
      continue;
    }
  }
  const dst = path.join(dir, `${name}.raw`);
  fs.writeFileSync(dst, out);
  const head = out.subarray(0, 48);
  console.log("out head HEX:", head.toString("hex").replace(/(..)/g, "$1 ").trim());
  console.log("out head ASC:", head.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
}
