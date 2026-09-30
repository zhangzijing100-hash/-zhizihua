import { readPng, crop } from "./png.mjs";
import { PANEL, TILE, SLOT, slotRect } from "./ocr-core.mjs";
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
const p = loadPanel("device/shots2/t03.png");
const dy = 272 - (TILE.top + TILE.h - SLOT.baselineOffset);
console.log("dy =", dy);
for (const c of [0,1]) {
  const r = slotRect(0, c, 0, dy);
  console.log(`\n列${c+1} 个位槽 x=${r.x0}..${r.x1} y=${r.y0}..${r.y1}`);
  for (let y=r.y0;y<=r.y1;y++){
    let s="  ";
    for(let x=r.x0;x<=r.x1;x++){const v=p.gray[y*p.width+x];s+= v<50?"#": v<130?"+":".";}
    console.log(s);
  }
}
