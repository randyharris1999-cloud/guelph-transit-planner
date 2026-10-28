/* ---------- labels: water, parks, streets (screen-space, collision-checked) ---------- */
const _tw = new Map();
function drawLabels(ctx,X,Y,z,size,C){
  if(z<14) return;
  const boxes = [];
  const hit = (x0,y0,x1,y1) => { for(const b of boxes) if(x0<b[2]&&x1>b[0]&&y0<b[3]&&y1>b[1]) return true; return false; };
  const put = (txt,x,y,ang,font,fill) => { ctx.font=font; const key=font+txt; let w=_tw.get(key); if(w==null){ w=ctx.measureText(txt).width; _tw.set(key,w); }
    const c=Math.abs(Math.cos(ang)), sn=Math.abs(Math.sin(ang)), hw=(w*c+12*sn)/2+3, hh=(w*sn+12*c)/2+2;
    if(x-hw<0||y-hh<0||x+hw>size.x||y+hh>size.y||hit(x-hw,y-hh,x+hw,y+hh)) return false; boxes.push([x-hw,y-hh,x+hw,y+hh]);
    ctx.save(); ctx.translate(x,y); ctx.rotate(ang); ctx.textAlign="center"; ctx.textBaseline="middle"; ctx.lineJoin="round";
    ctx.strokeStyle=C.halo; ctx.lineWidth=3.5; ctx.strokeText(txt,0,0); ctx.fillStyle=fill; ctx.fillText(txt,0,0); ctx.restore(); return true; };
  // water names at the polygon centre when it falls inside the water
  for(const w of [...D.wat].sort((a,b)=>b.area-a.area)){ if(!w.name) continue;
    // label point: midway between the bank nearest the screen centre and the facing bank
    const [xs,ys]=w.rings[0], n=xs.length, sx=size.x/2, sy=size.y/2; let bi=0, bd=Infinity;
    for(let j=0;j<n;j++){ const d=(X(xs[j])-sx)**2+(Y(ys[j])-sy)**2; if(d<bd){bd=d;bi=j;} }
    let oj=-1, od=Infinity; const gap=Math.max(3,Math.floor(n/10));
    for(let j=0;j<n;j++){ const k=Math.abs(j-bi); if(Math.min(k,n-k)<gap) continue; const d=(X(xs[j])-X(xs[bi]))**2+(Y(ys[j])-Y(ys[bi]))**2; if(d<od){od=d;oj=j;} }
    if(oj<0) continue; const cx=(X(xs[bi])+X(xs[oj]))/2, cy=(Y(ys[bi])+Y(ys[oj]))/2; if(cx<0||cy<0||cx>size.x||cy>size.y) continue;
    ctx.beginPath(); for(const [xs,ys] of w.rings){ ctx.moveTo(X(xs[0]),Y(ys[0])); for(let j=1;j<xs.length;j++) ctx.lineTo(X(xs[j]),Y(ys[j])); ctx.closePath(); }
    if(ctx.isPointInPath(cx*(window.devicePixelRatio||1),cy*(window.devicePixelRatio||1),"evenodd")) put(w.name,cx,cy,0,"italic 500 12px "+css("--f-body"),C.waterInk); }
  if(z>=15){ // street names along straight-enough stretches
    const font = (z>=17? "600 12px ":"500 11px ") + css("--f-body"); ctx.font=font; const placed = new Map();
    for(const s of D.sseg){ if(z<16 && s.cls<2) continue;
      const n=s.xs.length, px=new Array(n), py=new Array(n); let x0=1e9,x1=-1e9,y0=1e9,y1=-1e9;
      for(let j=0;j<n;j++){ px[j]=X(s.xs[j]); py[j]=Y(s.ys[j]); if(px[j]<x0)x0=px[j]; if(px[j]>x1)x1=px[j]; if(py[j]<y0)y0=py[j]; if(py[j]>y1)y1=py[j]; }
      if(x1<0||x0>size.x||y1<0||y0>size.y) continue;
      const cum=[0]; for(let j=1;j<n;j++) cum.push(cum[j-1]+Math.hypot(px[j]-px[j-1],py[j]-py[j-1])); const L=cum[n-1];
      let w=_tw.get(font+s.name); if(w==null){ w=ctx.measureText(s.name).width; _tw.set(font+s.name,w); } if(L < w+24) continue;
      const at = d => { let j=1; while(j<n-1 && cum[j]<d) j++; const t=(d-cum[j-1])/Math.max(1e-6,cum[j]-cum[j-1]); return [px[j-1]+(px[j]-px[j-1])*t, py[j-1]+(py[j]-py[j-1])*t]; };
      const [ax,ay]=at(L/2-w/2-4), [bx,by]=at(L/2+w/2+4), mx=(ax+bx)/2, my=(ay+by)/2;
      const dx=bx-ax, dy=by-ay, dl=Math.hypot(dx,dy)||1; let bent=false;
      for(let j=0;j<n;j++) if(cum[j]>L/2-w/2 && cum[j]<L/2+w/2 && Math.abs((px[j]-ax)*dy-(py[j]-ay)*dx)/dl>3){ bent=true; break; }
      if(bent) continue;
      const prev=placed.get(s.name); if(prev && prev.some(([qx,qy])=>Math.hypot(qx-mx,qy-my)<260)) continue;
      let ang=Math.atan2(dy,dx); if(ang>Math.PI/2) ang-=Math.PI; if(ang<-Math.PI/2) ang+=Math.PI;
      if(put(s.name,mx,my,ang,font,C.label)){ if(!prev) placed.set(s.name,[[mx,my]]); else prev.push([mx,my]); } }
  }
  if(z>=15 && !cityWide()){ for(const p of D.parks){ const x=X(p.mx), y=Y(p.my); if(x<0||y<0||x>size.x||y>size.y) continue; if(p.area < (z>=16? 2000 : 15000)) continue;
      put(p.name, x, y, 0, "italic 500 11px "+css("--f-body"), C.trail); } }
}
