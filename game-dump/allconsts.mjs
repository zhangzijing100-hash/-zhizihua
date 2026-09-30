import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { findEntry } from "./luaq.mjs";

const dir = process.cwd();

function readConst(buf, p) {
  if (p + 1 > buf.length) return null;
  const tag = buf[p];
  if (tag === 0x00) return { len: 1, kind: "nil", value: null };
  if (tag === 0x01) return { len: 1, kind: "false", value: false };
  if (tag === 0x11) return { len: 1, kind: "true", value: true };
  if (tag === 0x04) {
    if (p + 5 > buf.length) return null;
    const L = buf.readUInt32LE(p + 1);
    if (L < 1 || L > 4000 || p + 5 + L > buf.length) return null;
    const s = buf.subarray(p + 5, p + 5 + L);
    if (s[L - 1] !== 0) return null;
    for (let i = 0; i < L - 1; i++) { const b = s[i]; if (!((b >= 0x20 && b < 0x7f) || b === 9 || b === 10 || b === 13)) return null; }
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

export function allConstants(buf) {
  const out = [];
  let p = 0;
  while (p < buf.length) {
    const c = readConst(buf, p);
    if (!c) { p++; continue; }
    out.push({ at: p, ...c });
    p += c.len;
  }
  return out;
}

const names = process.argv.slice(2);
for (const n of names) {
  let e;
  try { e = findEntry(n); } catch { console.log("MISS " + n); continue; }
  console.log(`\n############ ${e.name.replace(/^@/, "")}  (${e.bytes.length} B) ############`);
  const cs = allConstants(e.bytes);
  const strs = cs.filter((c) => c.kind === "str").map((c) => c.value);
  const nums = cs.filter((c) => c.kind === "num").map((c) => c.value);
  const ints = cs.filter((c) => c.kind === "int").map((c) => c.value.toString());
  console.log("--- 字符串 ---");
  console.log([...new Set(strs)].join(" | "));
  console.log("--- 数字 ---");
  console.log([...new Set(nums.map(String))].join(" "));
  if (ints.length) { console.log("--- 整数 ---"); console.log([...new Set(ints)].join(" ")); }
}
