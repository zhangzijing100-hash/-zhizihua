import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const { entries } = unpackPng("emu/data.png");
console.log("前 6 条:", entries.slice(0,6).map(e=>e.data.length).join(", "));
const sz = entries.map(e=>e.data.length);
// 找「连续 280」的最长尾段，以及它前面那条的大小
let i = sz.length;
while (i > 0 && sz[i-1] === 280) i--;
console.log(`尾部连续 280 的记录从 #${i} 开始，共 ${sz.length - i} 条`);
console.log(`它前面 6 条大小: ${sz.slice(Math.max(0,i-6), i).join(", ")}`);
// 统计 280 出现在哪些位置（前 40 个）
const p280 = [];
sz.forEach((s, k) => { if (s === 280) p280.push(k); });
console.log(`总共 ${p280.length} 条 280 字节，前 20 个位置: ${p280.slice(0,20).join(", ")}`);
console.log(`后 20 个位置: ${p280.slice(-20).join(", ")}`);
// 名字段里是否混着非 280
const nonName = [];
for (let k = i; k < sz.length; k++) if (sz[k] !== 280) nonName.push(k);
console.log(`名字段里非 280 的: ${nonName.length ? nonName.slice(0,10).join(", ") : "无"}`);
