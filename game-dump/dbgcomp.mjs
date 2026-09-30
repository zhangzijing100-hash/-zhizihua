import { readPng, crop } from "./png.mjs";
import { PANEL, cellWindow } from "./ocr-core.mjs";
const img = readPng("device/minglun-shots/p00.png");
const sub = crop(img, PANEL.x, PANEL.y, PANEL.w, PANEL.h);
const g = new Uint8Array(sub.width*sub.height);
for (let y=0;y<sub.height;y++) for (let x=0;x<sub.width;x++){const i=(y*sub.width+x)*4;g[y*sub.width+x]=(sub.data[i]*299+sub.data[i+1]*587+sub.data[i+2]*114)/1000;}
function comps(row,col){
  const w = cellWindow(row,col);
  const W=w.x1-w.x0+1,H=w.y1-w.y0+1;
  const m=new Uint8Array(W*H);
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){const v=g[(w.y0+y)*sub.width+w.x0+x];m[y*W+x]=v<78?1:0;}
  const lab=new Int32Array(W*H).fill(-1),out=[],st=[];
  for(let i=0;i<m.length;i++){ if(!m[i]||lab[i]>=0)continue; const id=out.length;
    let a=1e9,b=-1,c=1e9,d=-1,n=0; st.length=0;st.push(i);lab[i]=id;
    while(st.length){const p=st.pop();const x=p%W,y=(p-x)/W;n++;
      if(x<a)a=x;if(x>b)b=x;if(y<c)c=y;if(y>d)d=y;
      if(x>0&&m[p-1]&&lab[p-1]<0){lab[p-1]=id;st.push(p-1);}
      if(x<W-1&&m[p+1]&&lab[p+1]<0){lab[p+1]=id;st.push(p+1);}
      if(y>0&&m[p-W]&&lab[p-W]<0){lab[p-W]=id;st.push(p-W);}
      if(y<H-1&&m[p+W]&&lab[p+W]<0){lab[p+W]=id;st.push(p+W);}}
    out.push({minX:a,maxX:b,minY:c,maxY:d,w:b-a+1,h:d-c+1,n});}
  return {W,H,out};
}
for (const [r,c] of [[1,2],[2,2],[3,0]]) {
  const {W,H,out} = comps(r,c);
  console.log(`\n### 行${r+1}列${c+1}  窗口 ${W}x${H}  连通域 ${out.length} 个`);
  out.sort((a,b)=>b.n-a.n).slice(0,8).forEach(o=>console.log(`   x${o.minX}-${o.maxX} y${o.minY}-${o.maxY}  ${o.w}x${o.h}  n=${o.n}  ${(o.h>=20&&o.h<=38&&o.w<=60&&o.n>=20)?"←候选":""}`));
}
