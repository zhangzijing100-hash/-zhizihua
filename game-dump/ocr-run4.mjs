import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, ROWS, COLS, extractCell, buildTemplates, detectRowDys, detectDigitRuns, readPanelRows } from "./ocr-core.mjs";
const P00 = [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]];
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
const p00 = loadPanel("device/minglun-shots/p00.png");
const templates = buildTemplates(p00, P00, detectRowDys(p00));
console.log("模板:", [...templates.keys()].sort().join(" "), `(${[...templates.values()].reduce((s,v)=>s+v.length,0)} 个)`);
const rows0 = readPanelRows(p00, templates);
console.log("\np00 按行带读:", rows0.length, "行");
rows0.forEach((row,i)=>{const want=P00[i].map(String);const ok=row.every((v,k)=>v===want[k]);console.log(`  ${row.map(v=>(v??"?").padStart(4)).join(" ")}   实际 ${want.map(v=>v.padStart(4)).join(" ")}  ${ok?"✓":"✗"}`);});
for (const i of ["00","01","02","03","04","05","06","07","08","09"]) {
  const f=`device/shots2/t${i}.png`; if(!fs.existsSync(f))continue;
  const panel=loadPanel(f);
  const rows=readPanelRows(panel,templates);
  console.log(`\nt${i}  ${rows.length} 行:`);
  rows.forEach(row=>console.log(`  ${row.map(v=>(v??"??").padStart(4)).join(" ")}`));
}
