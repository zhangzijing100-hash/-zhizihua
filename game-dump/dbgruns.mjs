import { readPng, crop } from "./png.mjs";
import { PANEL, detectDigitRuns } from "./ocr-core.mjs";
function loadPanel(file){
  const img = readPng(file);
  const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
  const n = sub.width*sub.height; const gray = new Uint8Array(n);
  for (let i=0;i<n;i++){const s=i*4;gray[i]=(sub.data[s]*299+sub.data[s+1]*587+sub.data[s+2]*114)/1000;}
  return {width:sub.width,height:sub.height,gray};
}
for (const f of ["device/minglun-shots/p00.png","device/shots2/t03.png"]) {
  const p = loadPanel(f);
  const runs = detectDigitRuns(p);
  console.log(`${f}  面板高 ${p.height}  检出 ${runs.length} 条行带:`);
  runs.forEach(r=>console.log(`   top=${r.top} bottom=${r.bottom} h=${r.h}`));
}
