import fs from "node:fs";
import { unpackPng } from "./unpackpng.mjs";
const { entries } = unpackPng("emu/configs.png");
console.log(`configs.png：${entries.length} 条`);
entries.forEach((e, i) => {
  const head = e.data.subarray(0, 48);
  const asc = Array.from(head).map(x => (x>=32&&x<127)?String.fromCharCode(x):".").join("");
  console.log(`#${String(i).padStart(2)}  ${String(e.data.length).padStart(9)} B  ${head.subarray(0,16).toString("hex").replace(/(..)/g,"$1 ")}  ${asc}`);
});
