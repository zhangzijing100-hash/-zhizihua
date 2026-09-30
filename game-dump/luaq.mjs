import fs from "node:fs";
import path from "node:path";

const dir = process.cwd();
const entries = JSON.parse(fs.readFileSync(path.join(dir, "entries.json"), "utf8"));
const cats = {};
for (const key of ["configs", "lua", "data"]) cats[key] = fs.readFileSync(path.join(dir, `${key}.cat`));
const byKey = {};
for (const key of Object.keys(cats)) byKey[key] = entries.filter((e) => e.key === key);

export function findEntry(sub) {
  const s = sub.toLowerCase();
  const e = entries.find((x) => x.name.toLowerCase().includes(s));
  if (!e) throw new Error("not found: " + sub);
  const arr = byKey[e.key];
  const i = arr.indexOf(e);
  const end = i + 1 < arr.length ? arr[i + 1].off : cats[e.key].length;
  return { ...e, bytes: cats[e.key].subarray(e.off, end) };
}

const printable = (b) => (b >= 0x20 && b < 0x7f) || b === 0x09 || b === 0x0d || b === 0x0a;

function readConst(buf, p) {
  if (p >= buf.length) return null;
  const tag = buf[p];
  if (tag === 0x00) return { len: 1, kind: "nil", value: null };
  if (tag === 0x01) return { len: 1, kind: "bool", value: false };
  if (tag === 0x11) return { len: 1, kind: "bool", value: true };
  if (tag === 0x04) {
    if (p + 5 > buf.length) return null;
    const L = buf.readUInt32LE(p + 1);
    if (L < 1 || L > 2000 || p + 5 + L > buf.length) return null;
    const s = buf.subarray(p + 5, p + 5 + L);
    if (s[L - 1] !== 0) return null;
    for (let i = 0; i < L - 1; i++) if (!printable(s[i])) return null;
    return { len: 5 + L, kind: "str", value: s.subarray(0, L - 1).toString("utf8") };
  }
  if (tag === 0x03) {
    if (p + 9 > buf.length) return null;
    const v = buf.readDoubleLE(p + 1);
    if (!Number.isFinite(v) || Math.abs(v) > 1e15) return null;
    return { len: 9, kind: "num", value: v };
  }
  if (tag === 0x13) {
    if (p + 9 > buf.length) return null;
    const v = buf.readBigInt64LE(p + 1);
    if (v > 1n << 60n || v < -(1n << 60n)) return null;
    return { len: 9, kind: "int", value: v };
  }
  return null;
}

// find the longest maximal run of valid constants, scanning forward
export function extractConstants(buf, minRun = 4) {
  let best = null;
  for (let p = 0; p < buf.length; ) {
    const first = readConst(buf, p);
    if (!first) { p++; continue; }
    const seq = [];
    let q = p;
    while (q < buf.length) {
      const c = readConst(buf, q);
      if (!c) break;
      seq.push(c.value === null ? c : c);
      q += c.len;
    }
    if (seq.length >= minRun && (!best || seq.length > best.seq.length)) best = { start: p, end: q, seq };
    p = q > p ? q : p + 1;
  }
  return best;
}
