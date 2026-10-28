/* ---------- constants & helpers ---------- */
const WALK = 80;                       // metres per minute
const LAT0 = 43.54, LON0 = -80.25;
const KX = 111320 * Math.cos(LAT0 * Math.PI / 180), KY = 110574;
const CAT = {
  grocery:   {label:"Grocery store",        w:15, full:10, zero:25, color:"#C2452D"},
  park:      {label:"Park",                 w:12, full:5,  zero:15, color:"#5E8C2E"},
  school:    {label:"Elementary school",    w:10, full:10, zero:20, color:"#6A58C9"},
  pharmacy:  {label:"Pharmacy",             w:8,  full:10, zero:25, color:"#1B98A5"},
  health:    {label:"Doctor or clinic",     w:8,  full:15, zero:30, color:"#D94F78"},
  community: {label:"Library or rec centre",w:8,  full:15, zero:30, color:"#D07A22"},
  food:      {label:"Café or restaurant",   w:5,  full:5,  zero:15, color:"#9A6B2F"},
  trail:     {label:"Trail",                w:5,  full:5,  zero:15, color:"#2F7D6D"},
  playground:{label:"Playground",           w:4,  full:5,  zero:15, color:"#D9A400"},
  garden:    {label:"Community garden",     w:1,  full:10, zero:20, color:"#B04F86"},
  restroom:  {label:"Public restroom",      w:1,  full:10, zero:20, color:"#3A78B5"},
  aed:       {label:"Defibrillator (AED)",  w:0,  full:5,  zero:15, color:"#D7263D"},
};
// 24-unit line glyphs drawn white on a coloured badge (canvas via Path2D, panel via inline SVG)
const GLYPH = {
  grocery:   {d:"M3 4h2.2l2.3 10h9.8l2.2-7H6.4 M10.5 19.2a1.4 1.4 0 1 1-2.8 0a1.4 1.4 0 1 1 2.8 0 M18 19.2a1.4 1.4 0 1 1-2.8 0a1.4 1.4 0 1 1 2.8 0"},
  park:      {d:"M12 2.8l5.6 7.4h-2.9l4.1 5.6H5.2l4.1-5.6H6.4z M12 15.8v5.4"},
  school:    {d:"M3 5.6C6 4 9 4 12 6.2c3-2.2 6-2.2 9-.6v13.2c-3-1.6-6-1.6-9 .6-3-2.2-6-2.2-9-.6z M12 6.2v13.2"},
  pharmacy:  {d:"M10.4 4.1l-6.3 6.3a4.6 4.6 0 0 0 6.5 6.5l6.3-6.3a4.6 4.6 0 0 0-6.5-6.5z M7.3 7.2l6.5 6.5"},
  health:    {d:"M9.2 3.5h5.6v5.7h5.7v5.6h-5.7v5.7H9.2v-5.7H3.5V9.2h5.7z", fill:true},
  community: {d:"M3 9l9-5 9 5 M5.5 10v8 M9.8 10v8 M14.2 10v8 M18.5 10v8 M3 20h18"},
  library:   {d:"M4 20V5h3.5v15 M9 20V5h3.5v15 M14 20.2l3.4-15.4 3.4.8-3.4 15.4z M3 20.5h18"},
  food:      {d:"M4 9h11.5v5a5 5 0 0 1-5 5h-1.5a5 5 0 0 1-5-5z M15.5 10.5h1.6a2.6 2.6 0 0 1 0 5.2h-1.6 M8 3.5v2.8 M11.5 3.5v2.8"},
  trail:     {d:"M7.5 21l3-7.5 3.2 2.6V21 M10.5 13.5l1.4-5 3.6 3.2 2.5.4 M9.3 9.5l-2.2 3 M13.6 4.6a1.6 1.6 0 1 1-3.2 0a1.6 1.6 0 1 1 3.2 0 M19 8v13"},
  playground:{d:"M3.5 21L7.5 4h9l4 17 M7.5 4h9 M10.2 4v9.5 M13.8 4v9.5 M9 13.5h6"},
  garden:    {d:"M12 21v-8 M12 13.2C12 8.6 8.6 6.4 4.2 6.4c0 4.6 3.2 6.8 7.8 6.8z M12 11.2c0-3.8 3-5.9 7.8-5.9 0 3.8-3 5.9-7.8 5.9z"},
  restroom:  {d:"M8 6.6a1.7 1.7 0 1 1 0-3.4a1.7 1.7 0 1 1 0 3.4z M16 6.6a1.7 1.7 0 1 1 0-3.4a1.7 1.7 0 1 1 0 3.4z M6 21v-6H4.6V9.5h6.8V15H10v6 M14 21v-4.5h-2.4L14 9h4l2.4 7.5H18V21"},
  bus:       {d:"M6.5 3h11a2 2 0 0 1 2 2v11.5a1.5 1.5 0 0 1-1.5 1.5H6a1.5 1.5 0 0 1-1.5-1.5V5a2 2 0 0 1 2-2z M4.5 11h15 M7.5 21v-3 M16.5 21v-3 M7.8 14.6h.1 M16.1 14.6h.1"},
  aed:       {d:"M12 20s-7.6-4.6-7.6-10.1A4.3 4.3 0 0 1 12 7.4a4.3 4.3 0 0 1 7.6 2.5C19.6 15.4 12 20 12 20z M7.6 12.4h2.3l1.2-2.4 1.7 4.4 1.2-2h2.4"},
  trees:     {d:"M12 3a5.5 5.5 0 0 0-4.3 8.9A4.4 4.4 0 0 0 10 20h4a4.4 4.4 0 0 0 2.3-8.1A5.5 5.5 0 0 0 12 3z M12 13.5v7.5 M12 16.5l-2.2-1.8 M12 15l2.4-2"},
};
const BUS_COLOR = "#1C2A2D";
function iconSVG(g, color, size=22){ const G=GLYPH[g];
  return `<svg class="ico" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="${color}"/><g transform="translate(5 5) scale(.5833)"><path d="${G.d}" fill="${G.fill?"#fff":"none"}" stroke="#fff" stroke-width="${G.fill?0:2.4}" stroke-linecap="round" stroke-linejoin="round"/></g></svg>`; }
const _sprites = new Map(), _p2d = {};
function sprite(g, color, px, square=false){ const key=g+color+px+square; let c=_sprites.get(key); if(c) return c;
  const dpr=window.devicePixelRatio||1, n=Math.ceil((px+4)*dpr); c=document.createElement("canvas"); c.width=c.height=n; const x=c.getContext("2d"); x.scale(dpr,dpr);
  const r=px/2, o=(px+4)/2; x.beginPath(); if(square){ x.roundRect ? x.roundRect(o-r,o-r,px,px,px*.22) : x.rect(o-r,o-r,px,px); } else x.arc(o,o,r,0,6.2832);
  x.fillStyle=color; x.fill(); x.lineWidth=1.6; x.strokeStyle="rgba(255,255,255,.95)"; x.stroke();
  const G=GLYPH[g], path=_p2d[g]||(_p2d[g]=new Path2D(G.d)), s=px*.62/24; x.translate(o-12*s,o-12*s); x.scale(s,s);
  if(G.fill){ x.fillStyle="#fff"; x.fill(path); } else { x.strokeStyle="#fff"; x.lineWidth=2.4; x.lineCap="round"; x.lineJoin="round"; x.stroke(path); }
  _sprites.set(key,c); return c; }
const glyphFor = (cat, it) => cat==="community" && it && it.extra==="Library" ? "library" : cat;
const OSM_CATS = ["grocery","pharmacy","health","food","playground"];
const BUS_W = 20, TREE_W = 3;
// travel-time colours by absolute minutes, the same in every view
const TBANDS = [[0,5,"#00729E"],[5,10,"#00A6E5"],[10,15,"#85B24A"],[15,20,"#C3BE45"],[20,30,"#E9A94E"],[30,45,"#E5794A"],[45,60,"#C9504A"]];  // City blue -> City green -> warm
const SCORE_RAMP = ["#B8432F","#E07B39","#E9C46A","#8AB17D","#2A9D8F","#0B6E69"];
const lin = (t, f, z) => t <= f ? 1 : t >= z ? 0 : (z - t) / (z - f);
const $ = id => document.getElementById(id);
const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
const fmtT = s => { s = Math.round(s/60)*60; let h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60); const ap = h % 24 >= 12 ? "pm" : "am"; h = h % 12 || 12; return h + ":" + String(m).padStart(2, "0") + ap; };
const mercX = lon => (lon + 180) / 360;
const mercY = lat => { const s = Math.sin(lat * Math.PI / 180); return 0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI); };
function gradeOf(s){ return s>=85?["Walker's paradise",SCORE_RAMP[5]]:s>=70?["Very walkable",SCORE_RAMP[4]]:s>=50?["Somewhat walkable",SCORE_RAMP[3]]:s>=30?["Car helpful",SCORE_RAMP[1]]:["Car dependent",SCORE_RAMP[0]]; }
function scoreColor(s){ return SCORE_RAMP[Math.min(5, Math.floor(s / 100 * 6))]; }

/* ---------- min-heap ---------- */
class Heap{ constructor(){this.k=[];this.v=[];}
  push(key,val){const k=this.k,v=this.v;let i=k.length;k.push(key);v.push(val);while(i>0){const p=(i-1)>>1;if(k[p]<=key)break;k[i]=k[p];v[i]=v[p];i=p;}k[i]=key;v[i]=val;}
  pop(){const k=this.k,v=this.v,top=v[0],tk=k[0];const lk=k.pop(),lv=v.pop();const n=k.length;if(n){let i=0;while(true){let c=2*i+1;if(c>=n)break;if(c+1<n&&k[c+1]<k[c])c++;if(k[c]>=lk)break;k[i]=k[c];v[i]=v[c];i=c;}k[i]=lk;v[i]=lv;}this.lastKey=tk;return top;}
  get size(){return this.k.length;} }
