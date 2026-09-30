import fs from "node:fs";
import { readPng, crop } from "./png.mjs";
import { PANEL, detectDigitRuns, slotPatch, correlation, findRowAlignment, EMPTY, PATCH } from "./ocr2.mjs";
// 只加载导出的模板（模拟 App 里打包的那份）
const doc = JSON.parse(fs.readFileSync("ocr-templates.json","utf8"));
const templates = new Map();
for (const [k,list] of Object.entries(doc.t)) {
  templates.set(k === "" ? EMPTY : k, list.map(b64 => {
    const buf = Buffer.from(b64,"base64"); const p = new Float64Array(buf.length);
    for (let i=0;i<buf.length;i++){ const v = buf[i] > 127 ? buf[i]-256 : buf[i]; p[i] = v/127; }
    return p;
  }));
}
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
function readPage(panel){
  return detectDigitRuns(panel).map(run => {
    const { dy } = findRowAlignment(panel, run, templates);
    const row = [];
    for (let c=0;c<5;c++){
      const digits=[];
      for (let slot=0; slot<3; slot++){
        const patch = slotPatch(panel, run, c, slot, dy);
        let best=EMPTY, bs=-Infinity;
        for (const [ch,list] of templates) for (const t of list){ const s=correlation(patch,t); if(s>bs){bs=s;best=ch;} }
        if (best===EMPTY) break;
        digits.push(best);
      }
      row.push(digits.length?digits.reverse().join(""):null);
    }
    return row;
  });
}
const TRUTH = {
  "device/minglun-shots/p00.png": [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]],
  "device/shots2/t00.png": [[7,4,3,6,3],[51,44,64,34,17],[84,38,58,28,31],[34,17,100,21,30]],
  "device/shots2/t03.png": [[7,6,9,3,182],[171,160,160,156,159],[176,149,181,200,192],[203,171,158,201,221]],
  "device/shots2/t01.png": [[36,17,100,21,30],[37,49,42,30,30],[11,21,20,16,15],[18,18,17,17,34]],
};
let ok=0, tot=0, cellOk=0, cellTot=0;
for (const [f, truth] of Object.entries(TRUTH)) {
  const rows = readPage(loadPanel(f));
  console.log(`\n${f.split("/").pop()}:`);
  truth.forEach((w,i)=>{
    const got = rows[i] ?? [];
    let mark = "";
    for (let j=0;j<5;j++){ cellTot++; if (got[j]===String(w[j])) cellOk++; }
    const good = got.length===5 && got.every((v,j)=>v===String(w[j]));
    if(good) ok++; tot++;
    console.log(`  ${[0,1,2,3,4].map(j=>String(got[j]??"?").padStart(4)).join(" ")}   实际 ${w.map(v=>String(v).padStart(4)).join(" ")}  ${good?"✓":"✗"}`);
  });
}
console.log(`\n行级 ${ok}/${tot}   格级 ${cellOk}/${cellTot} (${(cellOk/cellTot*100).toFixed(1)}%)`);
