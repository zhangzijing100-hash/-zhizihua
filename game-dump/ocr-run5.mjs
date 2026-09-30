import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, buildTemplates, detectDigitRuns, readPanelRows } from "./ocr-core.mjs";
const P00 = [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]];
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
const p00 = loadPanel("device/minglun-shots/p00.png");
console.log("p00 行带数:", detectDigitRuns(p00).length);
const templates = buildTemplates(p00, P00);
console.log("模板:", [...templates.keys()].sort().join(" "), `(${[...templates.values()].reduce((s,v)=>s+v.length,0)} 个)`);
const rows = readPanelRows(p00, templates);
rows.forEach((row,i)=>{const want=(P00[i]??[]).map(String);const ok=row.every((v,k)=>v===want[k]);console.log(`  p00 ${row.map(v=>(v??"?").padStart(4)).join(" ")}  实际 ${want.map(v=>v.padStart(4)).join(" ")}  ${ok?"✓":"✗"}`);});
// t03 已知真值
const T03 = [[7,6,9,3,182],[171,160,160,156,159],[176,149,181,200,192],[203,171,158,201,221]];
const t03 = loadPanel("device/shots2/t03.png");
const r3 = readPanelRows(t03, templates);
console.log("\nt03:");
r3.forEach((row,i)=>{const want=(T03[i]??[]).map(String);const ok=row.every((v,k)=>v===want[k]);console.log(`  ${row.map(v=>(v??"?").padStart(4)).join(" ")}  实际 ${want.map(v=>v.padStart(4)).join(" ")}  ${ok?"✓":"✗"}`);});
