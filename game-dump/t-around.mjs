import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const { entries } = unpackPng("emu/data.png");
console.log("总条目 " + entries.length);
for (let i = 10603; i <= 10614; i++) {
  const e = entries[i];
  if (!e) continue;
  const head = e.data.subarray(0, 90);
  const asc = Array.from(head).map(x => (x>=32&&x<127)?String.fromCharCode(x):(x===0?"\u00b7":".")).join("");
  console.log(`#${i}  ${String(e.data.length).padStart(8)} B  @0x${e.offset.toString(16)}  ${asc}`);
}
