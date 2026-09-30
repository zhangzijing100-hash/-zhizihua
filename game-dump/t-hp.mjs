import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, buildTemplates, readPanelRows, PATCH, EMPTY } from "./ocr2.mjs";
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
const p00 = loadPanel("device/minglun-shots/p00.png");
const tpl = buildTemplates([{ panel: p00, rows: [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]] }]);
let tot=0; for (const v of tpl.values()) tot+=v.length;
console.log("模板数（只 p00）:", tot, Object.entries(Object.fromEntries([...tpl].map(([k,v])=>[k===EMPTY?"空":k,v.length]))).map(([k,v])=>`${k}:${v}`).join(" "));
const TESTS = [
  ["device/shots2/t03.png", [[7,6,9,3,182],[171,160,160,156,159],[176,149,181,200,192],[203,171,158,201,221]]],
  ["device/shots2/t01.png", [[36,17,100,21,30],[37,49,42,30,30],[11,21,20,16,15],[18,18,17,17,34]]],
];
let cok=0,ctot=0;
for (const [f,truth] of TESTS) {
  const rows = readPanelRows(loadPanel(f), tpl);
  console.log(`\n${f.split("/").pop()}:`);
  truth.forEach((w,i)=>{const got=rows[i]??[];for(let j=0;j<5;j++){ctot++;if(got[j]===String(w[j]))cok++;}
    const good=got.length===5&&got.every((v,j)=>v===String(w[j]));
    console.log(`  ${[0,1,2,3,4].map(j=>String(got[j]??"?").padStart(4)).join(" ")}   实际 ${w.map(v=>String(v).padStart(4)).join(" ")}  ${good?"✓":"✗"}`);});
}
console.log(`\n格级 ${cok}/${ctot} (${(cok/ctot*100).toFixed(1)}%)`);
