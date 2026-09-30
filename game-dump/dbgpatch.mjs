import { readPng, crop } from "./png.mjs";
import { PANEL, detectDigitRuns, slotPatch, renderPatch, TILE, PATCH } from "./ocr2.mjs";
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
for (const [f,label,rowIdx,colIdx] of [["device/minglun-shots/p00.png","p00",3,0],["device/shots2/t03.png","t03",1,0]]) {
  const p = loadPanel(f);
  const runs = detectDigitRuns(p);
  const run = runs[rowIdx];
  console.log(`\n### ${label} 行${rowIdx} run.top=${run.top} bottom=${run.bottom}`);
  for (let slot=0; slot<3; slot++) {
    const patch = slotPatch(p, run, colIdx, slot, 0);
    console.log(`--- slot ${slot} (${slot===0?"个位":slot===1?"十位":"百位"}) ---`);
    console.log(renderPatch(patch));
  }
}
