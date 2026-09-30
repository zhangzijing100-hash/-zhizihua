import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, ROWS, COLS, extractCell, buildTemplates, recognizePanel, detectRowDys } from "./ocr-core.mjs";
const P00 = [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]];
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
const p00 = loadPanel("device/minglun-shots/p00.png");
const dys0 = detectRowDys(p00);
const templates = buildTemplates(p00, P00, dys0);
console.log("模板:", [...templates.keys()].sort().join(" "), ` (${[...templates.values()].reduce((s,v)=>s+v.length,0)} 个字形)`);
const back = recognizePanel(p00, templates, dys0);
back.grid.forEach((row,r)=>{const want=P00[r].map(String);const ok=row.every((v,i)=>v===want[i]);console.log(`  p00 行${r+1}: ${row.map(v=>(v??"?").padStart(4)).join(" ")}  实际 ${want.map(v=>v.padStart(4)).join(" ")}  ${ok?"✓":"✗"}`);});
for (const i of ["00","01","02","03","04","05"]) {
  const f=`device/shots2/t${i}.png`; if(!fs.existsSync(f))continue;
  const panel=loadPanel(f); const dys=detectRowDys(panel);
  const res=recognizePanel(panel,templates,dys);
  console.log(`\nt${i}  dy=${dys.map(d=>d.toFixed(0)).join(",")}`);
  res.grid.forEach((row,r)=>console.log(`  行${r+1}: ${row.map(v=>(v??"??").padStart(4)).join(" ")}`));
}
