import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, buildTemplates, detectDigitRuns, readPanelRows } from "./ocr2.mjs";
const P00 = [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]];
const T03 = [[7,6,9,3,182],[171,160,160,156,159],[176,149,181,200,192],[203,171,158,201,221]];
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
function check(panel, want, label){
  const rows = readPanelRows(panel, templates);
  console.log(`\n${label}  读出 ${rows.length} 行`);
  let ok=0, tot=0;
  want.forEach((w,i)=>{
    const got = rows[i] ?? [];
    const line = got.map(v=>(v??"?").padStart(4)).join(" ");
    const good = got.length===5 && got.every((v,k)=>v===String(w[k]));
    if(good)ok++; tot++;
    console.log(`  ${line}   实际 ${w.map(v=>String(v).padStart(4)).join(" ")}  ${good?"✓":"✗"}`);
  });
  return `${ok}/${tot}`;
}
const p00 = loadPanel("device/minglun-shots/p00.png");
console.log("p00 行带:", detectDigitRuns(p00).length);
const templates = buildTemplates(p00, P00);
console.log("模板:", [...templates.keys()].map(k=>`${k==="__EMPTY__"?"空":k}×${templates.get(k).length}`).join(" "));
console.log("p00 =", check(p00, P00, "p00 回认"));
const t03 = loadPanel("device/shots2/t03.png");
console.log("t03 =", check(t03, T03, "t03"));
for (const i of ["00","01","02","04","06","08"]) {
  const f=`device/shots2/t${i}.png`; if(!fs.existsSync(f))continue;
  const p=loadPanel(f);
  const rows=readPanelRows(p,templates);
  console.log(`\nt${i}: ` + rows.map(r=>r.map(v=>(v??"?").padStart(4)).join(" ")).join("  |  "));
}
