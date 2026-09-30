import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, buildTemplates, readPanelRows } from "./ocr2.mjs";
const KNOWN = [
  { file: "device/minglun-shots/p00.png", rows: [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]] },
  { file: "device/shots2/t03.png",        rows: [[7,6,9,3,182],[171,160,160,156,159],[176,149,181,200,192],[203,171,158,201,221]] },
];
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
const panels = KNOWN.map(k => ({ panel: loadPanel(k.file), rows: k.rows }));
const templates = buildTemplates(panels);
console.log("模板:", [...templates.keys()].map(k=>`${k==="__EMPTY__"?"空":k}×${templates.get(k).length}`).join(" "));
let okAll=0, totAll=0;
KNOWN.forEach((k, idx) => {
  const rows = readPanelRows(panels[idx].panel, templates);
  console.log(`\n${k.file}:`);
  k.rows.forEach((w,i)=>{const got=rows[i]??[];const good=got.length===5&&got.every((v,j)=>v===String(w[j]));okAll+=good?1:0;totAll++;
    console.log(`  ${got.map(v=>(v??"?").padStart(4)).join(" ")}   实际 ${w.map(v=>String(v).padStart(4)).join(" ")}  ${good?"✓":"✗"}`);});
});
console.log(`\n已知页 = ${okAll}/${totAll}`);
for (const i of ["01","02","04","05","06","07","08","09"]) {
  const f=`device/shots2/t${i}.png`; if(!fs.existsSync(f))continue;
  const p=loadPanel(f);
  const rows=readPanelRows(p,templates);
  console.log(`t${i}: ` + rows.map(r=>r.map(v=>(v??"??").padStart(4)).join(" ")).join("  |  "));
}
