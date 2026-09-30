import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const { entries } = unpackPng("emu/data.png");
const idx = entries.findIndex(e => e.data.length === 280 && e.data.toString("latin1").toLowerCase().includes("cfortunewheelitemcfg.bny"));
const d = entries[idx].data;
console.log(`名字记录 #${idx} @0x${entries[idx].offset.toString(16)}  全长 ${d.length}`);
for (let off = 0; off < 280; off += 32) {
  const c = d.subarray(off, off+32);
  console.log(`  ${off.toString(16).padStart(3,"0")}  ${Array.from(c).map(x=>x.toString(16).padStart(2,"0")).join(" ")}  ${Array.from(c).map(x=>(x>=32&&x<127)?String.fromCharCode(x):".").join("")}`);
}
