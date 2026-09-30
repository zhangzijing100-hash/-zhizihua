import fs from "node:fs";
import path from "node:path";

const dir = path.join(process.cwd(), "bny");
const f = process.argv[2];
const from = parseInt(process.argv[3] ?? "176", 10);
const len = parseInt(process.argv[4] ?? "640", 10);
const mode = process.argv[5] ?? "i32";
const buf = fs.readFileSync(path.join(dir, f));

if (mode === "hex") {
  for (let o = from; o < Math.min(from + len, buf.length); o += 16) {
    const row = buf.subarray(o, o + 16);
    console.log(String(o).padStart(7), row.toString("hex").replace(/(..)/g, "$1 ").padEnd(48), row.toString("latin1").replace(/[^\x20-\x7e]/g, "."));
  }
} else if (mode === "i32") {
  for (let o = from; o < Math.min(from + len, buf.length); o += 32) {
    const vals = [];
    for (let k = 0; k < 8 && o + k * 4 + 4 <= buf.length; k++) vals.push(String(buf.readInt32LE(o + k * 4)).padStart(8));
    console.log(String(o).padStart(7), vals.join(" "));
  }
} else if (mode === "i16") {
  for (let o = from; o < Math.min(from + len, buf.length); o += 32) {
    const vals = [];
    for (let k = 0; k < 16 && o + k * 2 + 2 <= buf.length; k++) vals.push(String(buf.readUInt16LE(o + k * 2)).padStart(6));
    console.log(String(o).padStart(7), vals.join(""));
  }
}
