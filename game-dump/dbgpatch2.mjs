import { readPng, crop } from "./png.mjs";
import { PANEL, detectDigitRuns, slotPatch, renderPatch, TILE, findRowAlignment } from "./ocr2.mjs";
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
const p = loadPanel("device/shots2/t03.png");
const runs = detectDigitRuns(p);
console.log("t03 runs:", runs.map(r=>`${r.top}-${r.bottom}(h${r.h})`).join(" "));
// 直接打印第 2 行第 1 列所在区域的原始灰度 ASCII（不做 patch 归一化）
const run = runs[1];
const col = 0;
const right = TILE.left + col*TILE.pitchX + TILE.w - 16;
console.log(`\n列1 个位右缘 x=${right}，run=${run.top}..${run.bottom}`);
for (let y=run.top-6; y<=run.bottom+16; y++){
  let s=`y=${String(y).padStart(3)} `;
  for(let x=right-70;x<=right+4;x++){const v=p.gray[y*p.width+x]; s+= v<50?"#": v>205?"*": v<130?"+":".";}
  console.log(s);
}
