/* ---------- basemap (identical to 15-Minute Guelph): parks, water, buildings, streets, trails, trees ---------- */
function drawBase(ctx,X,Y,z,size){
  const C = {water:css("--water"), waterEdge:css("--water-edge"), waterInk:css("--water-ink"), bldg:css("--bldg"), bldgEdge:css("--bldg-edge"), label:css("--label"), halo:css("--halo"), park:css("--park"), parkEdge:css("--park-edge"), street:css("--street"), cas:css("--case"), trail:css("--trail"), tree:css("--tree"), dim:css("--dim"), ink:css("--ink"), panel:css("--panel"), accent:css("--accent")};
  const sc = Math.pow(2, z-15);
  // parks
  ctx.fillStyle=C.park; ctx.strokeStyle=C.parkEdge; ctx.lineWidth=1;
  for(const p of D.parks){ ctx.beginPath(); for(const [xs,ys] of p.rings){ ctx.moveTo(X(xs[0]),Y(ys[0])); for(let j=1;j<xs.length;j++) ctx.lineTo(X(xs[j]),Y(ys[j])); ctx.closePath(); } ctx.fill(); if(z>=14) ctx.stroke(); }
  if(typeof drawHills==="function") drawHills(ctx,X,Y,z);
  // watercourses
  const vis = o => !(X(o.x1)<0 || X(o.x0)>size.x || Y(o.y1)<0 || Y(o.y0)>size.y);   // y0 = north edge in mercator
  ctx.beginPath(); for(const w of D.wat){ if(!vis(w)) continue; for(const [xs,ys] of w.rings){ ctx.moveTo(X(xs[0]),Y(ys[0])); for(let j=1;j<xs.length;j++) ctx.lineTo(X(xs[j]),Y(ys[j])); ctx.closePath(); } }
  ctx.fillStyle=C.water; ctx.fill("evenodd"); ctx.strokeStyle=C.waterEdge; ctx.lineWidth=.8; ctx.stroke();
  // buildings
  if(z>=14){ ctx.fillStyle=C.bldg; ctx.strokeStyle=C.bldgEdge; ctx.lineWidth=.7; let k=0; ctx.beginPath();
    const flush = () => { ctx.fill(); if(z>=16) ctx.stroke(); ctx.beginPath(); k=0; };
    for(const b of D.bld){ if(!vis(b)) continue; const x0=X(b.x0), x1=X(b.x1); if(x1-x0 < 1.2) continue;
      ctx.moveTo(X(b.xs[0]),Y(b.ys[0])); for(let j=1;j<b.xs.length;j++) ctx.lineTo(X(b.xs[j]),Y(b.ys[j])); ctx.closePath(); if(++k>=300) flush(); }
    flush(); }
  // streets: casing then fill, by class
  const widths = [0, Math.max(1, 3.2*sc), Math.max(1.4, 4.4*sc), Math.max(2, 6*sc)];
  ctx.lineCap="round"; ctx.lineJoin="round";
  // expressways and ramps (not walkable, drawn for context: buses use them)
  for(const pass of [0,1]){ for(const ramp of [1,0]){ ctx.beginPath(); for(const h of D.hwy){ if(h.ramp!==ramp) continue; ctx.moveTo(X(h.xs[0]),Y(h.ys[0])); for(let j=1;j<h.xs.length;j++) ctx.lineTo(X(h.xs[j]),Y(h.ys[j])); }
      ctx.strokeStyle = pass? C.street : C.cas; ctx.lineWidth = Math.min(18, (ramp? widths[1] : widths[3]*1.25) + (pass? 0 : 1.6)); ctx.stroke(); } }
  for(const pass of [0,1]){ for(let cls=1; cls<=3; cls++){ ctx.beginPath(); for(let e=0;e<D.E;e++) if(D.ec[e]===cls) strokeEdge(ctx,X,Y,e);
      ctx.strokeStyle = pass? C.street : C.cas; ctx.lineWidth = Math.min(16, widths[cls] + (pass? 0 : 1.6)); ctx.stroke(); } }
  // trails
  ctx.beginPath(); for(let e=0;e<D.E;e++) if(D.ec[e]===0) strokeEdge(ctx,X,Y,e);
  ctx.setLineDash([Math.max(2,3*sc),Math.max(2,2.5*sc)]); ctx.strokeStyle=C.trail; ctx.lineWidth=Math.max(1,1.6*sc); ctx.stroke(); ctx.setLineDash([]);
  // trees (zoomed in)
  if(z>=16){ ctx.fillStyle=C.tree; ctx.globalAlpha=.55; const r=Math.max(1.5, 2.2*sc/2);
    for(let i=0;i<D.NT;i++){ const x=X(D.tmx[i]), y=Y(D.tmy[i]); if(x<-5||y<-5||x>size.x+5||y>size.y+5) continue; ctx.beginPath(); ctx.arc(x,y,r,0,6.2832); ctx.fill(); } ctx.globalAlpha=1; }
  return C;
}
