import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const dir = process.cwd();
const buf = fs.readFileSync(path.join(dir, "Azure-Android_ASTC.pak"));

const idxOff = Number(buf.readBigInt64LE(10287964 + 8));
const idxSize = Number(buf.readBigInt64LE(10287964 + 16));
console.log(`index @${idxOff} size=${idxSize}`);

let p = idxOff;
function i32() { const v = buf.readInt32LE(p); p += 4; return v; }
function i64() { const v = Number(buf.readBigInt64LE(p)); p += 8; return v; }
function fstr() { const n = i32(); const s = buf.subarray(p, p + n); p += n; return s.toString("utf8").replace(/\0$/, ""); }
function u8() { return buf[p++]; }

const mount = fstr();
const numEntries = i32();
const seed = i64();
const hasPathHash = u8();
let phi = null;
if (hasPathHash) { phi = { off: i64(), size: i64(), hash: buf.subarray(p, p + 20).toString("hex") }; p += 20; }
const hasFullDir = u8();
let fdi = null;
if (hasFullDir) { fdi = { off: i64(), size: i64(), hash: buf.subarray(p, p + 20).toString("hex") }; p += 20; }

console.log(`mountPoint = "${mount}"`);
console.log(`numEntries = ${numEntries}`);
console.log(`pathHashSeed = ${seed}`);
console.log(`pathHashIndex = ${JSON.stringify(phi)}`);
console.log(`fullDirectoryIndex = ${JSON.stringify(fdi)}`);

const encSize = i32();
const encStart = p;
console.log(`encodedPakEntries size=${encSize}`);
const files = i32();
console.log(`files section count=${files} entries (size ${files * 32} bytes)`);

// decode the "Files" directory index (each entry: FString filename + FFilePakFileEntry)
let q = p + files * 32;
const names = [];
for (let i = 0; i < files && q < idxOff + idxSize; i++) {
  try {
    const n = buf.readInt32LE(q); q += 4;
    if (n <= 0 || n > 4096 || q + n > buf.length) break;
    const nm = buf.subarray(q, q + n).toString("utf8").replace(/\0$/, ""); q += n;
    const loc = buf.readInt32LE(q); q += 4;
    const comp = buf.readInt32LE(q); q += 4;
    const usize = buf.readInt32LE(q); q += 4;
    const csize = buf.readInt32LE(q); q += 4;
    const method = buf.readInt32LE(q); q += 4;
    names.push({ nm, loc, usize, csize, method, comp });
  } catch { break; }
}
console.log(`\n解析出 ${names.length} 个文件名`);
const dirs = {};
for (const n of names) { const d = n.nm.split("/").slice(0, 3).join("/"); dirs[d] = (dirs[d] || 0) + 1; }
console.log("顶层分布:");
for (const [k, v] of Object.entries(dirs).sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(`   ${String(v).padStart(5)}  ${k}`);
const bny = names.filter((n) => /bny/i.test(n.nm));
console.log(`\n含 "bny" 的条目: ${bny.length}`);
for (const n of bny.slice(0, 20)) console.log(`   ${n.nm}  u=${n.usize} c=${n.csize} m=${n.method}`);
console.log("\n前 15 个文件名:");
for (const n of names.slice(0, 15)) console.log(`   ${n.nm}  u=${n.usize} c=${n.csize} m=${n.method}`);
