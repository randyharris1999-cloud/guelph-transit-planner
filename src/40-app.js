/* ======================= Guelph Transit Planner ======================= */
const WALK_AREA = 10;                  // minutes, the walk area around the start
const MAXW = 15 * WALK;                // longest walk to or from a bus, metres
const cityWide = () => false;          // (labels module asks)
const S = { mode:"map", tab:"plan", from:null, to:null, walk:null, opts:null, opt:0, route:null, rhub:null, rdir:null, stop:null, bus:null, when:"now", day:"weekday", t:8*3600, showWalk:true };
let D = {}, map, base, legend, pins = {}, meMarker = null, meCircle = null;

/* ---------- data ---------- */
async function load(){
  const names = ["graph","places","addresses","trees","transit","buildings","water","streetnames"];
  const res = await Promise.all(names.map(n => fetch("data/" + n + ".json").then(r => { if(!r.ok) throw new Error(n); return r.json(); })));
  names.forEach((n,i) => D[n] = res[i]);
  decode();
  // hills (LIDAR): optional, the app works on flat ground without them
  try { const ev = await fetch("data/elev.json").then(r => { if(!r.ok) throw 0; return r.json(); });
    if(ev.cab.length === D.E){ D.cAB = Float64Array.from(ev.cab, v => v/10); D.cBA = Float64Array.from(ev.cba, v => v/10);
      D.eup = Float32Array.from(ev.up, v => v/10); D.edn = Float32Array.from(ev.dn, v => v/10); D.hill = ev.hillshade; loadHillshade(); } } catch(e){}
}
/* ---------- hillshade (from the LIDAR ground model) ---------- */
let HILL = null, _hillKey = "";
function loadHillshade(){ const img = new Image(); img.onload = () => { HILL = {img, cv:null}; if(base) base.draw(); }; img.src = D.hill.file; }
function hillCanvas(dark){ const key = dark ? "d" : "l"; if(HILL.cv && _hillKey===key) return HILL.cv;
  const {img} = HILL, c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext("2d"); x.drawImage(img, 0, 0); const id = x.getImageData(0, 0, c.width, c.height), p = id.data;
  const SH = dark ? 0.6 : 0.34, HI = dark ? 0.08 : 0.26;      // shadow and sunlit strength
  for(let i=0;i<p.length;i+=4){ const d = (p[i]-128)/127;
    if(d < 0){ p[i]=p[i+1]=p[i+2]=dark? 0 : 40; p[i+3] = Math.min(255, -d*SH*255); } else { p[i]=p[i+1]=p[i+2]=255; p[i+3] = Math.min(255, d*HI*255); } }
  x.putImageData(id, 0, 0); HILL.cv = c; _hillKey = key; return c; }
function drawHills(ctx,X,Y,z){ if(!HILL || !SHOWP.has("hills")) return; const [w,s,e,n] = D.hill.bounds;
  const x0=X(mercX(w)), x1=X(mercX(e)), y0=Y(mercY(n)), y1=Y(mercY(s));
  ctx.save(); ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high"; ctx.globalAlpha = z>=17 ? .35 : z>=16 ? .55 : z>=15 ? .8 : 1;
  ctx.drawImage(hillCanvas(matchMedia("(prefers-color-scheme: dark)").matches), x0, y0, x1-x0, y1-y0); ctx.restore(); }
function decode(){
  const g = D.graph; const N = g.nodes.length / 2; D.N = N;
  D.nlon = new Float64Array(N); D.nlat = new Float64Array(N); D.nmx = new Float64Array(N); D.nmy = new Float64Array(N);
  for(let i=0;i<N;i++){ const lon=g.nodes[2*i]/1e5, lat=g.nodes[2*i+1]/1e5; D.nlon[i]=lon; D.nlat[i]=lat; D.nmx[i]=mercX(lon); D.nmy[i]=mercY(lat); }
  const E = g.edges.length / 4; D.E = E;
  D.ea = new Int32Array(E); D.eb = new Int32Array(E); D.el = new Float64Array(E); D.ec = new Uint8Array(E);
  const deg = new Int32Array(N);
  for(let e=0;e<E;e++){ D.ea[e]=g.edges[4*e]; D.eb[e]=g.edges[4*e+1]; D.el[e]=g.edges[4*e+2]; D.ec[e]=g.edges[4*e+3]; deg[D.ea[e]]++; deg[D.eb[e]]++; }
  D.off = new Int32Array(N+1); for(let i=0;i<N;i++) D.off[i+1]=D.off[i]+deg[i];
  D.adjN = new Int32Array(D.off[N]); D.adjE = new Int32Array(D.off[N]); const fill = D.off.slice(0,N);
  for(let e=0;e<E;e++){ const a=D.ea[e],b=D.eb[e]; D.adjN[fill[a]]=b; D.adjE[fill[a]++]=e; D.adjN[fill[b]]=a; D.adjE[fill[b]++]=e; }
  D.eoff = new Int32Array(E+1); let tot=0;
  for(let e=0;e<E;e++){ tot += 2 + g.geom[e].length/2; D.eoff[e+1]=tot; }
  D.gx = new Float64Array(tot); D.gy = new Float64Array(tot);
  for(let e=0;e<E;e++){ let k=D.eoff[e]; D.gx[k]=D.nmx[D.ea[e]]; D.gy[k++]=D.nmy[D.ea[e]];
    const gg=g.geom[e]; for(let j=0;j<gg.length;j+=2){ D.gx[k]=mercX(gg[j]/1e5); D.gy[k++]=mercY(gg[j+1]/1e5); }
    D.gx[k]=D.nmx[D.eb[e]]; D.gy[k]=D.nmy[D.eb[e]]; }
  // places (searchable, and drawn as small icons when zoomed in)
  const P = D.places; D.pts = {};
  const mk = r => ({name:r[0], addr:r[1], lon:r[2]/1e5, lat:r[3]/1e5, node:r[4], conn:r[5], extra:r[6], mx:mercX(r[2]/1e5), my:mercY(r[3]/1e5)});
  for(const k of ["school","facility","restroom","garden","aed",...OSM_CATS]) D.pts[k] = (P[k]||[]).map(mk);
  D.parks = P.parks.map(p => { const rings = p[4].map(fl => { const xs=[],ys=[]; for(let j=0;j<fl.length;j+=2){ xs.push(mercX(fl[j]/1e5)); ys.push(mercY(fl[j+1]/1e5)); } return [xs,ys]; });
    let cx=0,cy=0,n=0; rings.forEach(r=>{ r[0].forEach((x,i)=>{cx+=x;cy+=r[1][i];n++;}); });
    return {name:p[0], addr:p[1], area:p[2], access:p[3], rings, mx:cx/n, my:cy/n}; });
  // addresses
  const A = D.addresses; const NA = A.text.length; D.NA = NA;
  D.amx = new Float64Array(NA); D.amy = new Float64Array(NA); D.ax = new Float64Array(NA); D.ay = new Float64Array(NA);
  for(let i=0;i<NA;i++){ const lon=A.lon[i]/1e5, lat=A.lat[i]/1e5; D.amx[i]=mercX(lon); D.amy[i]=mercY(lat); D.ax[i]=(lon-LON0)*KX; D.ay[i]=(lat-LAT0)*KY; }
  D.akey = A.text.map(t => t.toLowerCase());
  D.agrid = new Map(); for(let i=0;i<NA;i++){ const k=Math.floor(D.ax[i]/100)+":"+Math.floor(D.ay[i]/100); let a=D.agrid.get(k); if(!a) D.agrid.set(k,a=[]); a.push(i); }
  // trees (basemap)
  const T = D.trees; const NT = T.lon.length; D.NT = NT; D.tmx = new Float64Array(NT); D.tmy = new Float64Array(NT);
  for(let i=0;i<NT;i++){ D.tmx[i]=mercX(T.lon[i]/1e5); D.tmy[i]=mercY(T.lat[i]/1e5); }
  // transit
  const R = D.transit;
  D.stops = R.stops.map((s,i) => ({i, code:s[0], name:s[1], lon:s[2]/1e5, lat:s[3]/1e5, node:s[4], conn:s[5], mx:mercX(s[2]/1e5), my:mercY(s[3]/1e5), key:s[1].toLowerCase()}));
  D.foot = Array.from({length:D.stops.length}, () => []);
  for(let i=0;i<R.foot.length;i+=3) D.foot[R.foot[i]].push([R.foot[i+1], R.foot[i+2]]);
  D.days = {};
  for(const [k,v] of Object.entries(R.days)) D.days[k] = { trips:v.trips, ids:v.ids || [], shape:v.shape || null, head:v.head, headsigns:v.headsigns, c:Int32Array.from(v.conns) };
  D.shapes = R.shapes.map(([ri, fl]) => { const xs=[],ys=[]; for(let j=0;j<fl.length;j+=2){ xs.push(mercX(fl[j]/1e5)); ys.push(mercY(fl[j+1]/1e5)); } return {route:ri, xs, ys}; });
  // basemap
  const decRing = fl => { const xs=[],ys=[]; let x=0,y=0; for(let j=0;j<fl.length;j+=2){ x+=fl[j]; y+=fl[j+1]; xs.push(mercX(x/1e5)); ys.push(mercY(y/1e5)); } return [xs,ys]; };
  D.bld = D.buildings.map(fl => { const [xs,ys]=decRing(fl); return {xs,ys,x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}; });
  D.wat = D.water.map(([name,area,rings]) => { const rr=rings.map(decRing); const [xs,ys]=rr[0]; return {name:name.replace(/\s*\(.*\)/,""), area, rings:rr, x0:Math.min(...xs),x1:Math.max(...xs),y0:Math.min(...ys),y1:Math.max(...ys)}; });
  D.snames = D.streetnames.names;
  D.hwy = (D.streetnames.hwy||[]).map(([ramp,fl]) => { const [xs,ys]=decRing(fl); return {ramp, xs, ys}; });
  D.sseg = D.streetnames.segs.map(([ni,cls,fl]) => { const [xs,ys]=decRing(fl); return {name:D.snames[ni], cls, xs, ys}; }).sort((a,b)=>b.cls-a.cls);
  D.trailNodes = [];
}

/* ---------- transit lookups ---------- */
const RT = ri => D.transit.routes[ri];
const regular = ri => /^\d+$/.test(RT(ri)[0]) || /^\d+ U$/.test(RT(ri)[0]);
const chip = (ri, extra="") => { const R=RT(ri); return `<span class="rchip" style="background:${R[2]};color:${routeInk(R)}${extra}">${esc(R[0])}</span>`; };
const headText = (day, h) => (D.days[day].headsigns[h] || "").replace(/^\S+\s/, "");
const _rs2 = {};
// per day: route -> Set(stops), stop -> Set(routes), route -> Map(head -> trip count)
function idx(day){ if(_rs2[day]) return _rs2[day]; const d=D.days[day], c=d.c, rStops=new Map(), sRoutes=Array.from({length:D.stops.length},()=>new Set()), heads=new Map();
  for(let k=0;k<c.length;k+=5){ const ri=d.trips[c[k+4]]; let s=rStops.get(ri); if(!s) rStops.set(ri, s=new Set()); s.add(c[k+2]); s.add(c[k+3]); sRoutes[c[k+2]].add(ri); sRoutes[c[k+3]].add(ri); }
  d.trips.forEach((ri,ti) => { let m=heads.get(ri); if(!m) heads.set(ri, m=new Map()); m.set(d.head[ti], (m.get(d.head[ti])||0)+1); });
  return _rs2[day] = {rStops, sRoutes, heads}; }
function firstAt(c, t){ let lo=0, hi=c.length/5; while(lo<hi){ const m=(lo+hi)>>1; if(c[m*5] < t) lo=m+1; else hi=m; } return lo*5; }
const liveDay = () => todayType();
const liveOK = day => (LIVE && (LIVE.relay || PREVIEW)) && day === todayType();
// departures at stops (Set) between t0 and t1, grouped by route + headsign: [{route, head, si, items:[{t, sched, delay, ti}]}]
function departures(stopSet, day, t0, t1, rankOf){
  const d=D.days[day], c=d.c, groups=new Map(), live=liveOK(day), from = t0 - (live? 900 : 0);
  for(let k=firstAt(c, from); k<c.length && c[k] < t1; k+=5){ const si=c[k+2]; if(!stopSet.has(si)) continue; const ti=c[k+4], key=d.trips[ti]+"|"+d.head[ti];
    let g=groups.get(key); const rank = rankOf ? rankOf(si) : 0;
    if(!g || rank < g.rank){ g={route:d.trips[ti], head:d.head[ti], si, rank, items:[]}; groups.set(key,g); }
    if(si===g.si) g.items.push({sched:c[k], ti}); }
  for(const g of groups.values()) g.items = g.items.map(it => { const p = live? predict(day, it.ti, g.si, it.sched) : null; return {...it, t: p? p.t : it.sched, delay: p? p.delay : null}; })
      .filter(it => it.t >= t0 - 30 && it.t < t1 + (live? 900 : 0)).sort((a,b) => a.t-b.t);
  return [...groups.values()].filter(g => g.items.length).sort((a,b) => a.items[0].t - b.items[0].t); }
const delayBadge = it => it.delay == null ? "" : Math.abs(it.delay) < 60 ? `<span class="ontime">on time</span>` : it.delay > 0 ? `<span class="late">+${Math.round(it.delay/60)}</span>` : `<span class="ontime">${Math.round(it.delay/60)}</span>`;
/* ---------- countdowns: any <span class="cd" data-t="…"> ticks every second ---------- */
// buses: "14 min", then "4m 32s" in the last 10 minutes, "Due" in the last 30 s; "leave" countdowns end at "now"
function cdText(t, k){ const s = Math.round(t - nowSec());
  if(k==="leave") return s <= 15 ? "now" : "in " + cdSpan(s);
  if(k==="in") return s < -30 ? "has left" : s <= 30 ? "due now" : "in " + cdSpan(s);
  if(s < -30) return "left"; if(s <= 30) return "Due"; return cdSpan(s); }
function cdSpan(s){ return s < 60 ? s + "s" : s < 600 ? Math.floor(s/60) + "m " + String(s%60).padStart(2,"0") + "s" : s < 3600 ? Math.round(s/60) + " min" : Math.floor(s/3600) + " h " + Math.round(s%3600/60) + " min"; }
function cdState(t){ const s = t - nowSec(); return s < -30 ? "gone" : s <= 30 ? "due" : s < 120 ? "soon" : ""; }
const cd = (t, k="") => `<span class="cd ${cdState(t)}" data-t="${Math.round(t)}"${k ? ` data-k="${k}"` : ""}>${cdText(t, k)}</span>`;
function tickCD(){ let stale = false;
  for(const el of document.querySelectorAll(".cd[data-t]")){ const t=+el.dataset.t, k=el.dataset.k, st=cdState(t);
    const txt=cdText(t, k); if(el.textContent!==txt) el.textContent=txt;
    if(!el.classList.contains(st || "x")) { el.classList.remove("soon","due","gone"); if(st) el.classList.add(st); if(st==="gone" && !k && !el.closest("#planOut .opt")) stale = true; } }
  if(stale) refreshPanel(); }   // a departure has gone: refresh the list so the next bus moves up
// trip countdowns only make sense when the trip is for today and starts in the next two hours
const tripCD = o => !o.walkOnly && S.planDay===todayType() && o.leave - nowSec() > -600 && o.leave - nowSec() < 7200;
const minsAway = t => { const m = Math.round((t - nowSec())/60); return m <= 0 ? "now" : m < 60 ? m + " min" : fmtT(t); };
function depRows(list, opts={}){
  return list.slice(0, opts.max||8).map((g,gi) => { const R=RT(g.route);
    return `<div class="dep"><button class="rchips" data-route="${g.route}" data-head="${g.head}" style="all:unset;cursor:pointer">${chip(g.route)}</button><span class="lbl">${esc(headText(opts.day, g.head) || R[1])}<div>${opts.sub ? opts.sub(g) : ""}</div></span><span class="times">${g.items.slice(0,3).map((it,ii) => (opts.arrives ? (ii===0 && it.t - nowSec() < 3600 ? `<span class="arr">Arrives in: ${cd(it.t)}</span>` : fmtT(it.t)) : opts.rel && it.t - nowSec() < 3600 ? minsAway(it.t) : fmtT(it.t)) + delayBadge(it)).join("<br>")}</span></div>`; }).join(""); }
function alertHTML(al){ if(!al.length) return ""; const one = a => `<details class="alert"><summary>${WARN_SVG}<span>${esc(a.head)}</span></summary>${a.desc ? `<p>${esc(a.desc)}</p>` : ""}</details>`;
  if(al.length <= 2) return `<div class="alerts">${al.map(one).join("")}</div>`;
  return `<div class="alerts"><details class="alert"><summary>${WARN_SVG}<span>${al.length} service alerts for these buses</span></summary><div class="alerts" style="margin:8px 0 0">${al.map(one).join("")}</div></details></div>`; }

/* ---------- places, endpoints and search ---------- */
function nearestNodeLL(lon, lat){ const x=(lon-LON0)*KX, y=(lat-LAT0)*KY;
  if(!D.ngrid){ D.ngrid=new Map(); D.nxp=new Float64Array(D.N); D.nyp=new Float64Array(D.N);
    for(let i=0;i<D.N;i++){ D.nxp[i]=(D.nlon[i]-LON0)*KX; D.nyp[i]=(D.nlat[i]-LAT0)*KY; const k=Math.floor(D.nxp[i]/100)+":"+Math.floor(D.nyp[i]/100); let a=D.ngrid.get(k); if(!a) D.ngrid.set(k,a=[]); a.push(i); } }
  let best=-1, bd=Infinity; for(let r=1;r<=8 && (best<0 || bd > (r-1)*100*(r-1)*100);r++){ for(let gx=-r;gx<=r;gx++) for(let gy=-r;gy<=r;gy++){ const a=D.ngrid.get((Math.floor(x/100)+gx)+":"+(Math.floor(y/100)+gy)); if(a) for(const i of a){ const d=(D.nxp[i]-x)**2+(D.nyp[i]-y)**2; if(d<bd){bd=d;best=i;} } } }
  return [best, Math.sqrt(bd)]; }
function nearestAddress(lat,lon){ const x=(lon-LON0)*KX, y=(lat-LAT0)*KY; let best=-1, bd=Infinity;
  for(let r=1;r<=6 && best<0;r+=2) for(let gx=-r;gx<=r;gx++) for(let gy=-r;gy<=r;gy++){ const a=D.agrid.get((Math.floor(x/100)+gx)+":"+(Math.floor(y/100)+gy)); if(a) for(const i of a){ const d=(D.ax[i]-x)**2+(D.ay[i]-y)**2; if(d<bd){bd=d;best=i;} } }
  return bd < 120*120 ? best : -1; }
const epAddress = i => ({label:D.addresses.text[i], lat:D.addresses.lat[i]/1e5, lon:D.addresses.lon[i]/1e5, node:D.addresses.node[i], conn:D.addresses.conn[i]});
const epStop = si => { const s=D.stops[si]; return {label:s.name, sub:"Stop #"+s.code, lat:s.lat, lon:s.lon, node:s.node, conn:s.conn, stop:si}; };
function epPoint(lat, lon, label){ const [node, conn] = nearestNodeLL(lon, lat); return {label, lat, lon, node, conn:Math.round(conn)}; }
const PLACE_LABEL = {school:"School", facility:"", restroom:"Restroom", garden:"Community garden", grocery:"Grocery", pharmacy:"Pharmacy", health:"Clinic", food:"Café or restaurant", playground:"Playground", aed:null};
// where a place is: its own address, else the closest street address within 250 m, else the closest street
function placeWhere(p, lat, lon){ if(p.addr) return p.addr;
  const x=(lon-LON0)*KX, y=(lat-LAT0)*KY; let best=-1, bd=250*250;
  for(let gx=-3;gx<=3;gx++) for(let gy=-3;gy<=3;gy++){ const a=D.agrid.get((Math.floor(x/100)+gx)+":"+(Math.floor(y/100)+gy)); if(a) for(const i of a){ const d=(D.ax[i]-x)**2+(D.ay[i]-y)**2; if(d<bd){bd=d;best=i;} } }
  if(best>=0) return "near " + D.addresses.text[best];
  const mx=mercX(lon), my=mercY(lat); let nm="", sd=Infinity;
  for(const sg of D.sseg) for(let j=0;j<sg.xs.length;j++){ const d=(sg.xs[j]-mx)**2+(sg.ys[j]-my)**2; if(d<sd){ sd=d; nm=sg.name; } }
  return nm ? "near " + nm : ""; }
function buildPlaces(){ D.placeIdx = []; const all = [];
  for(const [k,lbl] of Object.entries(PLACE_LABEL)){ if(lbl===null) continue; for(const p of D.pts[k]||[]){ if(!p.name || /^playground$/i.test(p.name)) continue;
    all.push({p, type: (k==="food" || k==="health") && typeof p.extra==="string" && p.extra ? p.extra.replace(/^Cafe$/,"Café").replace(/^Doctors?$/,"Doctor's office") : lbl || p.extra || "", rank: k==="facility" || k==="school" ? 0 : ["restroom","garden","playground"].includes(k) ? 2 : 1, lat:p.lat, lon:p.lon, ep:() => ({lat:p.lat, lon:p.lon, node:p.node, conn:p.conn})}); } }
  for(const p of D.parks){ const [lat, lon] = unmerc(p.mx, p.my); all.push({p, type:"Park", rank:0, lat, lon, ep:() => { const e=epPoint(lat, lon, p.name); if(p.access.length){ e.node=p.access[0]; e.conn=0; } return e; }}); }
  const count = new Map(); for(const r of all){ const k=r.p.name.toLowerCase(); count.set(k, (count.get(k)||0)+1); }
  const seen = new Set();
  for(const r of all){ const name=r.p.name, where=placeWhere(r.p, r.lat, r.lon), dup = count.get(name.toLowerCase()) > 1;
    const sub = [r.type, where].filter(Boolean).join(" · "), id = name + "|" + sub; if(seen.has(id)) continue; seen.add(id);
    // when several places share a name, the chosen one keeps its location in the box (e.g. "Tim Hortons, near 1045 Paisley Road")
    const label = dup && where ? `${name}, ${where}` : name;
    D.placeIdx.push({key:name.toLowerCase(), label:name, sub, rank:r.rank, ep:() => ({...r.ep(), label})}); }
  D.placeCount = count; }
const ABBR = {st:"street", rd:"road", ave:"avenue", av:"avenue", dr:"drive", cres:"crescent", cr:"crescent", ct:"court", crt:"court", pl:"place", blvd:"boulevard", pkwy:"parkway", ln:"lane", tr:"trail", trl:"trail", cir:"circle", sq:"square", hts:"heights", w:"west", e:"east", n:"north", s:"south"};
function searchAll(q, {stops=true, places=true, addresses=true}={}){
  q = q.toLowerCase().replace(/[.,#]/g," ").trim(); if(!q) return [];
  const toks = q.split(/\s+/), words = s => s.split(/[\s\-\/()]+/), out = [];
  const wordMatch = key => { const w = words(key); return toks.every(t => w.some(x => x.startsWith(t) || (ABBR[t] && x===ABBR[t]))); };
  if(stops){ const num = /^\d+$/.test(q); for(const s of D.stops){ if(num ? s.code.startsWith(q) : wordMatch(s.key)) out.push({kind:"Stop", label:s.name, sub:"Stop #"+s.code, stop:s.i, ep:() => epStop(s.i), n:s.key.length}); if(out.length>=40) break; } }
  if(places && !/^\d+$/.test(q)){ const pl = [];
    for(const p of D.placeIdx) if(wordMatch(p.key)) pl.push({kind:"Place", label:p.label, sub:p.sub, ep:p.ep, n:p.key.length, rank:p.rank, starts:p.key.startsWith(q)});
    pl.sort((a,b) => (b.starts - a.starts) || a.rank - b.rank || a.n - b.n);
    // places whose name starts with what was typed come first, then stops, then the other places
    const lead = pl.filter(p => p.starts), rest = pl.filter(p => !p.starts); out.unshift(...lead); out.push(...rest); }
  if(addresses){ const at = toks.map(t => ABBR[t] || t), res = [];
    for(let i=0;i<D.NA && res.length<300;i++){ const w = D.akey[i].split(" "); let ok=true;
      for(let ti=0;ti<at.length;ti++){ const t=at[ti]; if(/^\d/.test(t) && ti===0){ if(w[0]!==t && !(at.length===1 && w[0].startsWith(t))){ ok=false; break; } } else if(!w.some(x => x.startsWith(t))){ ok=false; break; } }
      if(ok) res.push(i); }
    res.sort((a,b) => D.akey[a].length - D.akey[b].length).slice(0,8).forEach(i => out.push({kind:"Address", label:D.addresses.text[i], sub:"", ep:() => epAddress(i), n:99})); }
  return out; }

/* ---------- trip planner: walk + connection scan ---------- */
function treePath(tree, node){ const pts=[]; let u=node, guard=0;
  pts.push([D.nmx[u], D.nmy[u]]);
  while(guard++<20000){ const e=tree.pred[u]; if(e<0) break; const a=D.ea[e], b=D.eb[e], from=(a===u)? b : a;
    const seg=[]; for(let k=D.eoff[e];k<D.eoff[e+1];k++) seg.push([D.gx[k],D.gy[k]]); if(a!==u) seg.reverse();   // u -> from
    for(let j=1;j<seg.length;j++) pts.push(seg[j]); u=from; }
  return pts.reverse(); }   // root -> node
const llM = ep => [mercX(ep.lon), mercY(ep.lat)];
function scan(A, B, day, t0, dA, dB){
  const d=D.days[day], c=d.c, ns=D.stops.length, ea=new Float64Array(ns).fill(Infinity), jp=new Array(ns), tb=new Int32Array(d.trips.length).fill(-1), egress=new Float64Array(ns);
  D.stops.forEach((s,si) => { const w=dA.dist[s.node]+s.conn; if(w<=MAXW){ ea[si]=t0 + w/WALK*60; jp[si]={w}; } egress[si]=dB.dist[s.node]+s.conn; });
  let best=Infinity, bestStop=-1; const tmax = t0 + 3*3600;
  const reach = (si, t) => { if(egress[si] <= MAXW){ const ta = t + egress[si]/WALK*60; if(ta < best){ best=ta; bestStop=si; } } };
  for(let k=firstAt(c, t0); k<c.length; k+=5){ const dep=c[k]; if(dep > tmax || dep >= best) break; const ti=c[k+4], a=c[k+2], b=c[k+3], arr=c[k+1];
    if(tb[ti] < 0){ if(ea[a] <= dep) tb[ti] = k; else continue; }
    if(arr < ea[b]){ ea[b]=arr; jp[b]={ti, kb:tb[ti], ka:k}; reach(b, arr);
      for(const [to,dur] of D.foot[b]) if(arr+dur < ea[to]){ ea[to]=arr+dur; jp[to]={from:b, dur}; } } }
  if(bestStop < 0) return null;
  const legs=[]; let s=bestStop;
  legs.push({type:"walk", d:egress[s], a:s, toEnd:true, t0:ea[s], t1:best});
  while(jp[s] && jp[s].w === undefined){ const j=jp[s];
    if(j.from !== undefined){ legs.unshift({type:"xfer", a:j.from, b:s, dur:j.dur}); s=j.from; continue; }
    const a=c[j.kb+2]; legs.unshift({type:"ride", ti:j.ti, route:d.trips[j.ti], head:d.head[j.ti], a, b:s, dep:c[j.kb], arr:c[j.ka+1]}); s=a; }
  const rides = legs.filter(l => l.type==="ride"); if(!rides.length) return null;
  const w0 = dA.dist[D.stops[s].node] + D.stops[s].conn;
  legs.unshift({type:"walk", d:w0, b:s, fromStart:true});
  const leave = rides[0].dep - w0/WALK*60 - 60;   // a minute to spare at the stop
  legs[0].t0 = leave; legs[0].t1 = rides[0].dep;
  return {legs, rides, leave, arrive:best, key:rides.map(r => r.ti).join(",")}; }
function planTrip(A, B, day, t0){
  const dA = dijkstra([[A.node, A.conn]]), dB = dijkstra([[B.node, B.conn]], Infinity, true);
  const walkM = dA.dist[B.node] + B.conn + 0, walkMin = walkM / WALK;
  const opts = []; let t = t0;
  for(let n=0; n<8 && opts.length<4; n++){ const o = scan(A, B, day, t, dA, dB); if(!o) break;
    if(!opts.some(p => p.key===o.key)) opts.push(o); t = o.leave + 120; }
  opts.sort((a,b) => a.arrive - b.arrive || b.leave - a.leave);
  for(let i=opts.length-1;i>=0;i--) if(opts.some((p,j) => j!==i && p.arrive <= opts[i].arrive && p.leave >= opts[i].leave && (p.arrive < opts[i].arrive || p.leave > opts[i].leave || j < i))) opts.splice(i,1);   // drop options another one beats
  let keep = opts.filter(o => o.arrive < t0 + walkMin*60 + 120);   // a bus has to beat walking
  if(keep.length > 3) keep = keep.slice(0,3);
  const walk = isFinite(walkM) && walkMin <= 45 ? {walkOnly:true, legs:[{type:"walk", d:walkM, fromStart:true, toEnd:true, t0, t1:t0+walkMin*60}], leave:t0, arrive:t0+walkMin*60, rides:[]} : null;
  if(walk && (walkMin <= 12 || !keep.length)) keep.unshift(walk); else if(walk) keep.push(walk);
  // geometry and live times
  for(const o of keep){ for(const l of o.legs) legGeom(l, o, A, B, dA, dB, day);
    for(let i=o.legs.length-1;i>0;i--){ const a=o.legs[i-1], b=o.legs[i];
      if(a.type==="ride" && b.type==="ride" && a.route===b.route && a.b===b.a){ a.stay = {si:a.b, wait:b.dep-a.arr}; a.arr=b.arr; a.b=b.b; a.pts=a.pts.concat(b.pts); a.via=a.via.concat(b.via.slice(1)); a.head2=b.head; o.legs.splice(i,1); } }
    o.rides = o.legs.filter(l => l.type==="ride");
    if(liveOK(day)) for(const l of o.rides){ const p = predict(day, l.ti, l.a, l.dep); if(p) l.live = p; } }
  return keep; }
function legGeom(l, o, A, B, dA, dB, day){
  if(l.type==="walk"){
    if(l.fromStart && l.toEnd){ l.pts = treePath(dA, B.node); l.pts.unshift(llM(A)); l.pts.push(llM(B)); l.st = treeStats(dA, B.node); l.st.len += A.conn + B.conn; }
    else if(l.fromStart){ const s=D.stops[l.b]; l.pts = treePath(dA, s.node); l.pts.unshift(llM(A)); l.pts.push([s.mx, s.my]); l.st = treeStats(dA, s.node); l.st.len += A.conn + s.conn; }
    else { const s=D.stops[l.a]; l.pts = treePath(dB, s.node).reverse(); l.pts.unshift([s.mx, s.my]); l.pts.push(llM(B)); l.st = treeStats(dB, s.node); l.st.len += B.conn + s.conn; } }
  else if(l.type==="xfer"){ const a=D.stops[l.a], b=D.stops[l.b], t=dijkstra([[a.node, a.conn]], 1200); l.pts = treePath(t, b.node); l.pts.unshift([a.mx,a.my]); l.pts.push([b.mx,b.my]); l.st = treeStats(t, b.node); }
  else { l.pts = rideGeom(day, l.ti, l.dep, l.arr); l.via = rideStops(day, l.ti, l.a, l.dep, l.b, l.arr); } }
function rideGeom(day, ti, dep, arr){ const gi = D.days[day].shape?.[ti]; if(gi == null) return [];
  const g = shapeGeo(gi), tl = tripTimeline(day, ti, gi); if(tl.length < 2) return [];
  const s0 = interp(tl, dep, 1, 0), s1 = interp(tl, arr, 1, 0), out=[]; const toM = p => [mercX(p.lon), mercY(p.lat)];
  out.push(toM(pointAt(g, s0))); for(let k=0;k<g.n;k++) if(g.s[k] > s0 && g.s[k] < s1) out.push([mercX(g.x[k]/KX+LON0), mercY(g.y[k]/KY+LAT0)]); out.push(toM(pointAt(g, s1)));
  return out; }
function rideStops(day, ti, a, dep, b, arr){ const seq = tripSeq(day).get(ti) || [], out=[]; let on=false;
  for(const [si,t] of seq){ if(!on && si===a && t===dep) on=true; if(on && (!out.length || out[out.length-1][0]!==si)) out.push([si,t]); if(on && si===b && t===arr) break; }
  return out; }

/* ---------- what is in focus (drives the bold routes, stops and bus fading) ---------- */
function focus(){
  if(S.bus){ const st=VS.get(S.bus); if(st && st.info){ const ri=D.transit.routes.indexOf(st.info.R); return {routes:new Set([ri]), bus:st}; } }
  if(S.tab==="plan" && S.opts && S.opts[S.opt] && !S.opts[S.opt].walkOnly) return {routes:new Set(S.opts[S.opt].rides.map(r => r.route)), trip:S.opts[S.opt]};
  if(S.tab==="routes" && S.route != null) return {routes:new Set([S.route]), route:S.route};
  if(S.tab==="routes" && S.rhub){ const r=hubRoutes(liveDay()); if(r) return {routes:r}; }
  if(S.tab==="stops" && S.stop != null) return {routes:idx(liveDay()).sRoutes[S.stop], stop:S.stop};
  return null; }
function busFocus(){ const F=focus();
  for(const [id, mk] of LV.markers){ const st=VS.get(id), ri = st && st.info ? D.transit.routes.indexOf(st.info.R) : -1;
    const on = !F || F.routes.has(ri); mk.setOpacity(on? 1 : .25); mk.setZIndexOffset(id===S.bus? 900 : on? 500 : 0);
    const el = mk.getElement(); if(el) el.classList.toggle("sel", id===S.bus); } }

/* ---------- drawing ---------- */
const _tsm = {};
function tshapeM(gi){ if(_tsm[gi]) return _tsm[gi]; const fl=D.transit.tshapes[gi], xs=[], ys=[]; for(let j=0;j<fl.length;j+=2){ xs.push(mercX(fl[j]/1e5)); ys.push(mercY(fl[j+1]/1e5)); } return _tsm[gi]={xs,ys}; }
function line(ctx,X,Y,xs,ys){ ctx.moveTo(X(xs[0]),Y(ys[0])); for(let j=1;j<xs.length;j++) ctx.lineTo(X(xs[j]),Y(ys[j])); }
function lineP(ctx,X,Y,pts){ if(!pts.length) return; ctx.moveTo(X(pts[0][0]),Y(pts[0][1])); for(let j=1;j<pts.length;j++) ctx.lineTo(X(pts[j][0]),Y(pts[j][1])); }
function cased(ctx, w, col, C, alpha=1){ ctx.strokeStyle=C.panel; ctx.lineWidth=w+3; ctx.globalAlpha=alpha; ctx.stroke(); ctx.strokeStyle=col; ctx.lineWidth=w; ctx.stroke(); ctx.globalAlpha=1; }
function routeGis(ri, head, day){ const d=D.days[day], s=new Set(); d.trips.forEach((r,ti) => { if(r===ri && (head==null || d.head[ti]===head) && d.shape && d.shape[ti]!=null) s.add(d.shape[ti]); }); return [...s]; }
function showWalkArea(){ return S.tab==="plan" && S.showWalk && S.walk && !(S.opts && S.opts[S.opt]) && !S.bus; }
function drawAll(ctx,X,Y,z,size){
  const C = drawBase(ctx,X,Y,z,size), sc = Math.pow(2, z-15), dark = matchMedia("(prefers-color-scheme: dark)").matches;
  const F = focus(), day = liveDay();
  // 10-minute walk area: same banding as 15-Minute Guelph
  if(showWalkArea()){ ctx.fillStyle=C.dim; ctx.fillRect(0,0,size.x,size.y);
    const bands = bandsFor(WALK_AREA), w = Math.max(2.5, 5*sc), dist=S.walk.dist;
    for(let bi=bands.length-1; bi>=0; bi--){ const [lo,hi,col]=bands[bi]; ctx.beginPath(); let any=false;
      for(let e=0;e<D.E;e++){ const ta=Math.min(dist[D.ea[e]],dist[D.eb[e]])/WALK; if(ta>=lo && ta<hi && ta<=WALK_AREA){ strokeEdge(ctx,X,Y,e); any=true; } }
      if(any){ ctx.strokeStyle=col; ctx.lineWidth=Math.min(14,w); ctx.lineCap="round"; ctx.stroke(); } } }
  // every route, faded
  ctx.lineCap="round"; ctx.lineJoin="round";
  for(const sh of D.shapes){ if(!regular(sh.route) || (F && F.routes.has(sh.route))) continue; ctx.beginPath(); line(ctx,X,Y,sh.xs,sh.ys);
    ctx.strokeStyle=RT(sh.route)[2]; ctx.globalAlpha = F? (dark? .16 : .12) : (dark? .32 : .26); ctx.lineWidth=Math.max(1.5, 2.6*sc); ctx.stroke(); ctx.globalAlpha=1; }
  // routes in focus
  if(F){ const w = Math.max(4, 5*sc);
    if(F.trip && S.leg != null){ const l = S.leg==="end" ? null : F.trip.legs[S.leg];
      if(l && l.pts && l.pts.length){ ctx.beginPath(); lineP(ctx,X,Y,l.pts); ctx.strokeStyle = l.type==="ride" ? RT(l.route)[2] : C.accent; ctx.globalAlpha=.35; ctx.lineWidth=Math.min(30, Math.max(18, 20*sc)); ctx.stroke(); ctx.globalAlpha=1; }
      if(S.leg==="end"){ const x=X(mercX(S.to.lon)), y=Y(mercY(S.to.lat)); ctx.beginPath(); ctx.arc(x,y,22,0,6.2832); ctx.fillStyle=C.accent; ctx.globalAlpha=.25; ctx.fill(); ctx.globalAlpha=1; } }
    if(F.trip){ for(const ri of F.routes){ for(const sh of D.shapes) if(sh.route===ri){ ctx.beginPath(); line(ctx,X,Y,sh.xs,sh.ys); ctx.strokeStyle=RT(ri)[2]; ctx.globalAlpha=.4; ctx.lineWidth=Math.max(2,3*sc); ctx.stroke(); ctx.globalAlpha=1; } }
      for(const l of F.trip.rides){ ctx.beginPath(); lineP(ctx,X,Y,l.pts); cased(ctx, Math.min(11, Math.max(5, 7*sc)), RT(l.route)[2], C); } }
    else if(F.bus){ const gi = F.bus.info.ti!=null ? D.days[F.bus.info.day].shape?.[F.bus.info.ti] : null, ri=[...F.routes][0];
      if(gi!=null){ const s=tshapeM(gi); ctx.beginPath(); line(ctx,X,Y,s.xs,s.ys); cased(ctx, w, RT(ri)[2], C); }
      else for(const sh of D.shapes) if(sh.route===ri){ ctx.beginPath(); line(ctx,X,Y,sh.xs,sh.ys); cased(ctx, w, RT(ri)[2], C); } }
    else if(F.route!=null){ const gis = routeGis(F.route, S.rdir, day);
      if(gis.length) for(const gi of gis){ const s=tshapeM(gi); ctx.beginPath(); line(ctx,X,Y,s.xs,s.ys); cased(ctx, w, RT(F.route)[2], C); }
      else for(const sh of D.shapes) if(sh.route===F.route){ ctx.beginPath(); line(ctx,X,Y,sh.xs,sh.ys); cased(ctx, w, RT(F.route)[2], C); } }
    else { for(const sh of D.shapes) if(F.routes.has(sh.route)){ ctx.beginPath(); line(ctx,X,Y,sh.xs,sh.ys); cased(ctx, Math.max(2.5,3.6*sc), RT(sh.route)[2], C, .95); } } }
  // amenities, small and only when close in, so the buses stay the story
  drawPlaces(ctx,X,Y,z,size,F);
  // stops
  drawStops(ctx,X,Y,z,size,C,F);
  if(typeof drawLive==="function") drawLive(ctx,X,Y,z);
  drawLabels(ctx,X,Y,z,size,C);
  // walking legs of the chosen trip, on top
  if(F && F.trip){ for(const l of F.trip.legs){ if(l.type==="ride" || !l.pts) continue; ctx.beginPath(); lineP(ctx,X,Y,l.pts);
      ctx.strokeStyle=C.panel; ctx.lineWidth=Math.min(12,Math.max(6,8*sc)); ctx.stroke(); ctx.strokeStyle=C.ink; ctx.lineWidth=Math.min(6,Math.max(3,4*sc)); ctx.setLineDash([1, Math.min(11,Math.max(6,7*sc))]); ctx.stroke(); ctx.setLineDash([]); }
    for(const l of F.trip.rides){ for(const si of [l.a, l.b]){ const s=D.stops[si]; ring(ctx, X(s.mx), Y(s.my), Math.min(10, Math.max(6, 6*sc)), RT(l.route)[2], C); } } }
  else if(S.tab==="plan" && S.opts && S.opts[S.opt] && S.opts[S.opt].walkOnly){ const l=S.opts[S.opt].legs[0]; ctx.beginPath(); lineP(ctx,X,Y,l.pts);
    ctx.strokeStyle=C.panel; ctx.lineWidth=Math.min(12,Math.max(6,8*sc)); ctx.stroke(); ctx.strokeStyle=C.ink; ctx.lineWidth=Math.min(6,Math.max(3,4*sc)); ctx.setLineDash([1, Math.min(11,Math.max(6,7*sc))]); ctx.stroke(); ctx.setLineDash([]); }
}
/* ---------- places layers (OpenStreetMap shops and services + City facilities) ---------- */
// key, label, D.pts list, CAT colour/glyph, min zoom, on by default
const PLACES = [
  ["food","Food & drink","food","food",15,true], ["grocery","Groceries","grocery","grocery",13,true], ["pharmacy","Pharmacies","pharmacy","pharmacy",14,true],
  ["health","Clinics & hospitals","health","health",14,true], ["community","Libraries & rec","facility","community",13,true], ["school","Schools","school","school",14,true],
  ["playground","Playgrounds","playground","playground",15,false], ["restroom","Restrooms","restroom","restroom",15,false], ["garden","Gardens","garden","garden",15,false], ["aed","AEDs","aed","aed",15,false] ];
const SHOWP = new Set(PLACES.filter(p => p[5]).map(p => p[0]).concat(["hills"]));
const placeSize = z => z>=17? 20 : z>=16? 17 : z>=15? 14 : 12;
function drawPlaces(ctx,X,Y,z,size,F){ const px=placeSize(z);
  for(const [key,,list,cat,minZ] of [...PLACES].reverse()){ if(!SHOWP.has(key) || z<minZ) continue;
    for(const p of D.pts[list]||[]){ const x=X(p.mx), y=Y(p.my); if(x<-14||y<-14||x>size.x+14||y>size.y+14) continue;
      const sp=sprite(glyphFor(cat,p), CAT[cat].color, px), w=sp.width/(window.devicePixelRatio||1); ctx.globalAlpha = F? .55 : .95; ctx.drawImage(sp, x-w/2, y-w/2, w, w); } }
  ctx.globalAlpha=1;
  if(S.place){ const x=X(S.place.p.mx), y=Y(S.place.p.my); ctx.beginPath(); ctx.arc(x,y,px*.75+4,0,6.2832); ctx.lineWidth=3; ctx.strokeStyle=css("--ink"); ctx.stroke(); } }
function placeAt(cp){ const z=map.getZoom(), r=(placeSize(z)/2+4)**2; let best=null, bd=r;
  for(const [key,label,list,cat,minZ] of PLACES){ if(!SHOWP.has(key) || z<minZ) continue;
    for(const p of D.pts[list]||[]){ const q=map.latLngToContainerPoint([p.lat,p.lon]), d=(q.x-cp.x)**2+(q.y-cp.y)**2; if(d<bd){ bd=d; best={p, key, label, cat}; } } }
  return best; }
const CAT_NAME = {food:"", grocery:"Grocery store", pharmacy:"Pharmacy", health:"", community:"", school:"School", playground:"Playground", restroom:"Public restroom", garden:"Community garden", aed:"Defibrillator (AED)"};
function placePopup(hit){ const {p, cat} = hit; S.place = hit; base.draw();
  const kind = cat==="school" ? (p.extra && p.extra[0] ? p.extra[0]+" school" : "School") : (typeof p.extra==="string" && p.extra && !/^playground$/i.test(p.extra) ? p.extra : CAT_NAME[cat] || CAT[cat].label);
  const nm = p.name && !/^playground$/i.test(p.name) ? p.name : kind, wh = placeWhere(p, p.lat, p.lon);
  const ep = {label: (D.placeCount && D.placeCount.get(nm.toLowerCase()) > 1 || nm===kind) && wh ? `${nm}, ${wh}` : nm, lat:p.lat, lon:p.lon, node:p.node, conn:p.conn};
  // closest stops on foot
  const t = dijkstra([[p.node, p.conn]], 8*WALK, true), near=[]; D.stops.forEach(s => { const d=t.dist[s.node]+s.conn; if(d<=8*WALK) near.push([s.i,d]); }); near.sort((a,b)=>a[1]-b[1]);
  const day=liveDay(), I=idx(day), st = near.slice(0,2);
  const html = `<div class="mpop">${iconSVG(glyphFor(cat,p), CAT[cat].color, 26)}<b>${esc(ep.label)}</b><div class="pk">${esc(kind)}${placeWhere(p,p.lat,p.lon)? " · "+esc(placeWhere(p,p.lat,p.lon)) : ""}</div>
    ${st.length ? st.map(([si,d]) => `<button class="pst" data-m="stop" data-si="${si}"><span>${esc(D.stops[si].name)}<small> · ${mins(d/WALK*60)} min walk</small></span><span class="rs">${[...I.sRoutes[si]].slice(0,5).map(ri=>chip(ri)).join("")}</span></button>`).join("") : `<div class="pk">No bus stop within an 8-minute walk</div>`}
    <button data-m="to">Go here</button><button data-m="from">Start a trip here</button></div>`;
  const pop = L.popup({closeButton:true, closeButtonLabel:"Close", offset:[0,-8], maxWidth:280, autoPanPaddingTopLeft:[10,60]}).setLatLng([p.lat,p.lon]).setContent(html).openOn(map);
  pop.on("remove", () => { if(S.place===hit){ S.place=null; base.draw(); } });
  pop.getElement().addEventListener("click", ev => { const b=ev.target.closest("[data-m]"); if(!b) return; map.closePopup();
    if(b.dataset.m==="stop"){ openStop(+b.dataset.si); return; }
    if(S.tab!=="plan") setTab("plan"); setEnd(b.dataset.m, ep); }); }
const HILL_ICO = `<svg class="ico" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#7A6A55"/><path d="M4 17l5-7 3 4 2.5-3L20 17z" fill="#fff"/></svg>`;
function renderLayerChips(){ $("layers").innerHTML = (D.hill ? `<button data-layer="hills" aria-pressed="${SHOWP.has("hills")}">${HILL_ICO}<span>Hills</span></button>` : "") + PLACES.map(([key,label,,cat]) => `<button data-layer="${key}" aria-pressed="${SHOWP.has(key)}">${iconSVG(cat==="community"?"library":cat, CAT[cat].color, 18)}<span>${label}</span></button>`).join(""); }
function ring(ctx,x,y,r,col,C){ ctx.beginPath(); ctx.arc(x,y,r,0,6.2832); ctx.fillStyle=C.panel; ctx.fill(); ctx.lineWidth=Math.max(2.5, r*.45); ctx.strokeStyle=col; ctx.stroke(); }
function drawStops(ctx,X,Y,z,size,C,F){
  const day=liveDay(), I=idx(day);
  let on = null, col = C.ink;
  if(F && F.route!=null){ on = new Set(); const d=D.days[day]; const seqs=tripSeq(day); d.trips.forEach((ri,ti) => { if(ri===F.route && (S.rdir==null || d.head[ti]===S.rdir)){ const q=seqs.get(ti); if(q) q.forEach(([si]) => on.add(si)); } }); col = RT(F.route)[2]; }
  else if(F && F.bus && F.bus.info.ti!=null){ on = new Set((tripSeq(F.bus.info.day).get(F.bus.info.ti)||[]).map(([si]) => si)); col = F.bus.R[2]; }
  const inView = (x,y) => x>-10 && y>-10 && x<size.x+10 && y<size.y+10;
  if(z>=14){ const r = z>=16? 0 : z>=15? 3.2 : 2.4;
    for(const s of D.stops){ if(on && on.has(s.i)) continue; const x=X(s.mx), y=Y(s.my); if(!inView(x,y)) continue;
      ctx.globalAlpha = F ? .55 : 1;
      if(z>=16){ const sp=sprite("bus", BUS_COLOR, 15, true), w=sp.width/(window.devicePixelRatio||1); ctx.drawImage(sp, x-w/2, y-w/2, w, w); }
      else { ctx.beginPath(); ctx.arc(x,y,r,0,6.2832); ctx.fillStyle=C.panel; ctx.fill(); ctx.lineWidth=1.4; ctx.strokeStyle=C.ink; ctx.stroke(); }
      ctx.globalAlpha=1; } }
  if(on && z>=12) for(const si of on){ const s=D.stops[si], x=X(s.mx), y=Y(s.my); if(inView(x,y)) ring(ctx, x, y, z>=15? 5 : 3.5, col, C); }
  if(S.tab==="stops" && S.stop!=null && !S.bus){ const s=D.stops[S.stop], x=X(s.mx), y=Y(s.my);
    ctx.beginPath(); ctx.arc(x,y,14,0,6.2832); ctx.fillStyle="rgba(0,166,229,.18)"; ctx.fill(); ring(ctx, x, y, 8, C.ink, C); }
}

/* ---------- legend ---------- */
const Legend = L.Control.extend({ options:{position:"bottomright"}, onAdd(){ this._d=L.DomUtil.create("div","legend"); L.DomEvent.disableClickPropagation(this._d); return this._d; },
  set(html){ this._d.innerHTML = html + snowLegend(); this._d.style.display = this._d.innerHTML.trim() ? "" : "none"; } });
function updateLegend(){ if(!legend) return;
  if(showWalkArea()){ const bands=bandsFor(WALK_AREA); legend.set(`<b>Walking time, minutes</b><div class="ramp">${bands.map(([lo,hi,c])=>`<i style="background:${c};flex:${hi-lo}"></i>`).join("")}</div><div class="ticks">${[0,...bands.map(b=>b[1])].map(t=>`<span>${t}</span>`).join("")}</div>`); return; }
  legend.set(""); }
function redraw(){ updateLegend(); busFocus(); updatePickHint(); if(base) base.draw(); }

/* ---------- pins ---------- */
function setPin(k, ep){ if(pins[k]){ pins[k].remove(); pins[k]=null; } if(!ep) return;
  pins[k] = L.marker([ep.lat, ep.lon], {icon:L.divIcon({className:"", html:`<div class="ppin ${k==="to"?"to":""}"></div>`, iconSize:[24,24], iconAnchor: k==="to"? [12,24] : [11,11]}), keyboard:false, draggable:true, autoPan:true, title: k==="to"? "Drag to move your destination" : "Drag to move your start", zIndexOffset:1200}).addTo(map);
  pins[k].on("dragend", ev => { const ll=ev.target.getLatLng(), ai=nearestAddress(ll.lat, ll.lng); setEnd(k, tapPoint(ll), {view:false}); }); }
/* ---------- choosing a start or destination by tapping the map ----------
   In Plan, a tap fills whichever end is still empty (start first, then destination).
   The pin button in the destination box arms "pick" so the next tap replaces the destination. */
function pickTarget(){ if(S.tab!=="plan") return null; if(S.pick) return S.pick; if(!S.from) return "from"; if(!S.to) return "to"; return null; }
function updatePickHint(){ const t=pickTarget(), h=$("pickHint"); if(!h) return; h.hidden = !t;
  $("map").classList.toggle("picking", !!t); $("pickBtn").classList.toggle("on", S.pick==="to");
  if(t){ $("pickTxt").textContent = t==="to" ? "Tap the map to choose your destination" : "Tap the map to choose your start"; $("pickX").hidden = !S.pick; } }
function tapEndpoint(latlng, cp){ const hp=placeAt(cp); if(hp){ const p=hp.p; return {label:p.name && !/^playground$/i.test(p.name) ? p.name : CAT[hp.cat].label, lat:p.lat, lon:p.lon, node:p.node, conn:p.conn}; }
  const z=map.getZoom(); let best=-1, bd=(z>=16? 14 : 10)**2;
  if(z>=14) for(const s of D.stops){ const q=map.latLngToContainerPoint([s.lat,s.lon]), d=(q.x-cp.x)**2+(q.y-cp.y)**2; if(d<bd){bd=d;best=s.i;} }
  if(best>=0) return epStop(best);
  return tapPoint(latlng); }
function tapPoint(ll){ const ai=nearestAddress(ll.lat, ll.lng); if(ai>=0) return epAddress(ai);
  // nothing close: name it after the nearest street
  const mx=mercX(ll.lng), my=mercY(ll.lat); let best=null, bd=Infinity;
  for(const s of D.sseg) for(let j=0;j<s.xs.length;j++){ const d=(s.xs[j]-mx)**2+(s.ys[j]-my)**2; if(d<bd){ bd=d; best=s.name; } }
  return epPoint(ll.lat, ll.lng, best ? "Point near " + best : "Map point"); }

/* ---------- phones: pull the panel down to see just the map, pull (or tap) it back up ---------- */
const PEEK = 78;
function phone(){ return matchMedia("(max-width:760px)").matches; }
function peekText(){ if(S.tab==="plan" && S.opts && S.opts[S.opt]){ const o=S.opts[S.opt]; return `${fmtT(o.leave)} – ${fmtT(o.arrive)} · show the trip`; }
  return ({plan:"Show the trip planner", routes:"Show the routes", stops:"Show the stops"})[S.tab]; }
function setMapFull(on){ const app=document.querySelector(".app"), m=$("map");
  m.classList.remove("dragging"); m.classList.add("settle"); m.style.height="";
  app.classList.toggle("mapfull", on); $("peek").hidden=!on; $("grab").setAttribute("aria-expanded", !on);
  if(on){ $("peekTxt").textContent = peekText(); window.scrollTo(0,0); }
  setTimeout(() => { m.classList.remove("settle"); map.invalidateSize({pan:false}); }, 240); }
function initPull(){
  const panel=$("panel"), m=$("map");
  $("grab").onclick = () => setMapFull(true); $("peek").onclick = () => setMapFull(false);
  let y0=null, x0=0, h0=0, drag=false, dy=0;
  panel.addEventListener("touchstart", e => { if(!phone() || e.touches.length!==1) return;
    const full = document.querySelector(".app").classList.contains("mapfull");
    // pull down from the top of the panel (or anywhere when the page is already at the top); never from a text box or menu
    if(!full && (window.scrollY > 2 && !e.target.closest(".grab"))) return;
    if(e.target.closest("input,select,textarea")) return;
    y0=e.touches[0].clientY; x0=e.touches[0].clientX; h0=m.getBoundingClientRect().height; drag=false; dy=0; }, {passive:true});
  panel.addEventListener("touchmove", e => { if(y0==null) return; const t=e.touches[0]; dy=t.clientY-y0; const dx=t.clientX-x0;
    const full = document.querySelector(".app").classList.contains("mapfull");
    if(!drag){ if(Math.abs(dy) < 8) return; if(Math.abs(dx) > Math.abs(dy) || (!full && dy<0) || (full && dy>0)){ y0=null; return; } drag=true; m.classList.add("dragging"); }
    e.preventDefault();
    const maxH = innerHeight - PEEK, minH = innerHeight*.46; m.style.height = Math.max(minH, Math.min(maxH, h0+dy)) + "px"; }, {passive:false});
  const end = () => { if(y0==null) return; y0=null; if(!drag) return; drag=false;
    const full = document.querySelector(".app").classList.contains("mapfull");
    setMapFull(full ? !(dy < -40) : dy > 70); };
  panel.addEventListener("touchend", end); panel.addEventListener("touchcancel", end);
  addEventListener("resize", () => { if(!phone() && document.querySelector(".app").classList.contains("mapfull")) setMapFull(false); });
}

/* ---------- tabs ---------- */
function setTab(t){ S.tab=t; for(const [k,id,p] of [["plan","tabPlan","pPlan"],["routes","tabRoutes","pRoutes"],["stops","tabStops","pStops"]]){ $(id).setAttribute("aria-selected", k===t); $(p).hidden = k!==t; } $("hubs").hidden = t!=="plan";
  if(t==="routes") renderRoutes(); if(t==="stops") renderStop(); if(t==="plan") renderPlan();
  setPin("from", t==="plan" ? S.from : null); setPin("to", t==="plan" ? S.to : null); redraw(); syncURL(); }

/* ---------- PLAN ---------- */
let sugg=[], sActive=-1, sField=null;
function showSugg(field){ sField=field; const q=$(field+"Q").value; sugg = searchAll(q).slice(0, 9);
  if(field==="from" && "geolocation" in navigator && (!q || "my location".startsWith(q.toLowerCase()))) sugg.unshift({kind:"", label:"My location", sub:"Use this device's location", me:true});
  sActive = sugg.length? 0 : -1; const ul=$("sugg"); ul.style.top = field==="from" ? "46px" : "92px";
  if(!q && !sugg.length){ ul.hidden=true; return; }
  ul.innerHTML = sugg.length ? sugg.map((s,k) => `<li role="option" aria-selected="${k===sActive}" data-k="${k}"><span>${esc(s.label)}${s.sub? `<br><small>${esc(s.sub)}</small>` : ""}</span><span class="k">${s.kind}</span></li>`).join("") : `<li aria-disabled="true">Nothing in Guelph matches that</li>`; ul.hidden=false; }
function hideSugg(){ $("sugg").hidden=true; sugg=[]; }
function pickSugg(k){ const s=sugg[k], f=sField; hideSugg(); if(!s) return;
  if(s.me){ locate(f); return; }
  setEnd(f, s.ep()); }
/* ---------- one-tap hub trips ---------- */
// each hub is the middle of its bus platforms, so the planner can use whichever platform suits the trip
const HUBS = {uofg:{re:/^University Centre /, label:"U of G (University Centre)"}, downtown:{re:/^Guelph Central Station /, label:"Downtown (Guelph Central Station)"}};
function hubEP(k){ const h=HUBS[k]; if(!h) return null; const ss=D.stops.filter(s => h.re.test(s.name)); if(!ss.length) return null;
  const ep = epPoint(ss.reduce((t,s)=>t+s.lat,0)/ss.length, ss.reduce((t,s)=>t+s.lon,0)/ss.length, h.label); ep.hub=k; return ep; }
function goHub(k){ const ep=hubEP(k); if(!ep) return; hideSugg(); S.pick=null; if(S.tab!=="plan") setTab("plan");
  if(S.from && S.from.hub===k) S.from=null; // already starting there: start from where you are instead
  setEnd("to", ep, {go:!!S.from});
  if(S.from) return;
  if("geolocation" in navigator){ $("planOut").innerHTML = `<p class="empty" id="locWait">Finding your location… or type a start above.</p>`; locate("from"); }
  else $("fromQ").focus(); }
function updateHubs(){ for(const b of document.querySelectorAll(".hub[data-hub]")) b.setAttribute("aria-pressed", !!(S.to && S.to.hub===b.dataset.hub)); }
function setEnd(f, ep, {go=true, view=true}={}){ S[f]=ep; $(f+"Q").value = ep ? ep.label : ""; S.opts=null; S.opt=0;
  if(f==="from") S.walk = ep ? dijkstra([[ep.node, ep.conn]], (WALK_AREA+1)*WALK) : null;
  setPin(f, S.tab==="plan" ? ep : null);
  if(go && S.from && S.to) runPlan(); else { renderPlan(); if(ep && f==="from" && view) map.setView([ep.lat, ep.lon], Math.max(map.getZoom(), 15)); }
  redraw(); syncURL(); updateHubs(); }
function planTime(){ if(S.when==="now") return {day:todayType(), t:nowSec()}; return {day:S.day, t:S.t}; }
function runPlan(){ if(!S.from || !S.to) { renderPlan(); return; } const {day, t} = planTime();
  S.opts = planTrip(S.from, S.to, day, t); S.opt = 0; S.leg = null; S.planDay = day; renderPlan(); fitTrip(); redraw(); }
// zoom the map to one part of the chosen trip (tap the same part again to see the whole trip)
function showLeg(k){ const o = S.opts && S.opts[S.opt]; if(!o) return;
  if(S.leg === k){ S.leg = null; renderPlan(); fitTrip(); redraw(); return; }
  S.leg = k; const b = L.latLngBounds([]);
  if(k === "end"){ b.extend([S.to.lat, S.to.lon]); const last=o.legs[o.legs.length-1]; (last.pts||[]).slice(-6).forEach(p => b.extend(unmerc(p[0],p[1]))); }
  else { const l=o.legs[k]; for(const p of l.pts||[]) b.extend(unmerc(p[0],p[1]));
    if(l.type==="walk" && l.fromStart) b.extend([S.from.lat, S.from.lon]); if(l.type==="walk" && l.toEnd) b.extend([S.to.lat, S.to.lon]); }
  if(b.isValid()){ const phone = innerWidth <= 760;
    if(b.getNorthEast().equals(b.getSouthWest())) map.setView(b.getCenter(), 17);
    else map.fitBounds(b, {paddingTopLeft:[40, 70], paddingBottomRight:[40, phone? 50 : 60], maxZoom:17}); }
  document.querySelectorAll("[data-leg]").forEach(r => r.setAttribute("aria-pressed", String(r.dataset.leg) === String(k)));
  redraw(); }
function fitTrip(){ const o = S.opts && S.opts[S.opt]; if(!o) return; const b = L.latLngBounds([]); for(const l of o.legs) for(const p of l.pts||[]) b.extend(unmerc(p[0],p[1]));
  b.extend([S.from.lat,S.from.lon]); b.extend([S.to.lat,S.to.lon]); map.fitBounds(b.pad(.12), {maxZoom:16}); }
const WALK_ICO = `<svg viewBox="0 0 24 24"><path d="M13.6 4.6a1.6 1.6 0 1 1-3.2 0a1.6 1.6 0 1 1 3.2 0 M7.5 21l3-7.5 3.2 2.6V21 M10.5 13.5l1.4-5 3.6 3.2 2.5.4 M9.3 9.5l-2.2 3"/></svg>`;
const mins = s => Math.max(1, Math.round(s/60));
function renderPlan(){ if(S.tab!=="plan") return; const el=$("planOut"); const day = S.planDay || todayType();
  if(S.opts){ if(!S.opts.length){ el.innerHTML = `<p class="empty">No bus or walking route found in the next three hours. Try another time.</p>`; return; }
    el.innerHTML = `<div class="sec"><h3>${S.opts.length} way${S.opts.length>1?"s":""} to go <em>${S.when==="now"? "leaving now" : {weekday:"Weekday",saturday:"Saturday",sunday:"Sunday"}[S.day]+" from "+fmtT(S.t)}</em></h3></div>` +
      S.opts.map((o,k) => { const dur = mins(o.arrive - o.leave), chain = o.legs.map(l => l.type==="ride" ? chip(l.route) : `<span class="wk">${WALK_ICO}${mins((l.d ?? l.dur*WALK/60)/WALK*60)}</span>`).join("<i>›</i>");
        const r0 = o.rides[0], live = r0 && r0.live ? ` · bus ${Math.abs(r0.live.delay)<60? "on time" : r0.live.delay>0? Math.round(r0.live.delay/60)+" min late" : -Math.round(r0.live.delay/60)+" min early"}<span class="livetag">live</span>` : "";
        return `<div class="opt ${k===S.opt?"on":""}"><button data-opt="${k}" aria-expanded="${k===S.opt}"><div class="ohead"><b>${fmtT(o.leave)} – ${fmtT(o.arrive)}</b><span>${dur} min trip</span></div>${tripCD(o) && liveOK(S.planDay) ? `<span class="findbus" data-findbus="${k}" role="button" tabindex="0" aria-label="Find this bus on the map">${FINDBUS}</span>` : ""}<div class="ochain">${chain}</div>
          ${tripCD(o) ? (() => { const r0=o.rides[0], bt = r0.live ? r0.live.t : r0.dep;
            return `<div class="ocd"><span>${chip(r0.route)} bus ${cd(bt, "in")}</span></div>`; })() : ""}<div class="onote">${o.walkOnly? "Walk the whole way" : `Leave by ${fmtT(o.leave)} · ${o.rides.length>1? (o.rides.length-1)+" transfer"+(o.rides.length>2?"s":"") : "no transfers"}${live}`}</div></button>${k===S.opt ? legsHTML(o, day) : ""}</div>`; }).join("");
    return; }
  // no trip yet: buses within a 10-minute walk of the start
  if(!S.from){ el.innerHTML = `<p class="empty">Pick a start and a destination: type an address, a place like a library or restaurant, or a stop number. Or just tap the map, once for the start and once for where you're going. You can drag either pin to fine-tune it.</p>`; return; }
  const near = []; D.stops.forEach((s,si) => { const d=S.walk.dist[s.node]+s.conn; if(d <= WALK_AREA*WALK) near.push([si,d]); });
  const rank = new Map(near.map(([si,d]) => [si,d])), {day:dd, t} = planTime();
  const list = departures(new Set(rank.keys()), dd, t, t+3600, si => rank.get(si));
  const al = liveOK(dd) ? alertsFor(new Set(list.map(g=>g.route)), new Set(rank.keys())) : [];
  el.innerHTML = `<div class="sec"><h3>Buses within a 10-minute walk <em>${near.length} stop${near.length===1?"":"s"}${liveOK(dd)? '<span class="livetag">live</span>' : ""}</em></h3>${alertHTML(al)}<div class="deps">${list.length ? depRows(list, {day:dd, rel:S.when==="now", sub:g => `${esc(D.stops[g.si].name)} · ${mins(rank.get(g.si)/WALK*60)} min walk`}) : `<p class="empty">No departures from stops within a 10-minute walk in the next hour.</p>`}</div></div>`; }
// "uphill 14 m", shown when a walk climbs or drops at least 5 m
function hillNote(l){ if(!l.st || !D.eup) return ""; const u=Math.round(l.st.up), d=Math.round(l.st.dn); const parts=[];
  if(u >= 5) parts.push(`<span class="hill up" title="Total climb on this walk">▲ ${u} m uphill</span>`); if(d >= 5) parts.push(`<span class="hill dn" title="Total descent on this walk">▼ ${d} m down</span>`);
  return parts.length ? `<div class="hills">${parts.join("")}</div>` : ""; }
function legsHTML(o, day){ const rows=[];
  const lg = i => `data-leg="${i}" role="button" tabindex="0" aria-pressed="${S.leg===i}" title="Show this part on the map"`;
  let i = -1;
  const walkRow = (t, label, sub) => `<div class="leg walk" ${lg(i)}><span class="t">${t}</span><span class="rail"><i style="--c:var(--ink)"></i></span><span class="d"><b>${label}</b><div>${sub}</div></span></div>`;
  for(const l of o.legs){ i++;
    if(l.type==="walk"){ const m=mins(l.d/WALK*60), km=((l.st ? l.st.len : l.d)/1000).toFixed(1), h=hillNote(l);
      if(l.fromStart) rows.push(walkRow(fmtT(l.t0), esc(S.from.label), (l.toEnd? `Walk ${m} min (${km} km) to your destination` : `Walk ${m} min to ${esc(D.stops[l.b].name)} (stop #${D.stops[l.b].code})`) + h));
      else rows.push(walkRow(fmtT(l.t0), `Get off at ${esc(D.stops[l.a].name)}`, `Walk ${m} min to your destination` + h)); }
    else if(l.type==="xfer"){ rows.push(walkRow("", "Transfer", `Walk ${mins(l.dur)} min to ${esc(D.stops[l.b].name)} (stop #${D.stops[l.b].code})` + hillNote(l))); }
    else { const R=RT(l.route), n=Math.max(1,(l.via||[]).length-1), lt = l.live ? `<br><span style="font-size:13px">${fmtT(l.live.t)}</span>` : "";
      rows.push(`<div class="leg" ${lg(i)} style="--c:${R[2]}"><span class="t">${fmtT(l.dep)}${lt}</span><span class="rail"><i></i></span><span class="d">${chip(l.route)} <b>${esc(headText(day,l.head) || R[1])}</b>${l.live? delayBadge(l.live) : ""}<div>From ${esc(D.stops[l.a].name)} (#${D.stops[l.a].code}) · ${n} stop${n>1?"s":""} · ${mins(l.arr-l.dep)} min</div>${l.stay ? `<div>At ${esc(D.stops[l.stay.si].name)} it continues as ${esc(headText(day,l.head2) || R[1])}${l.stay.wait>90 ? ` after about ${mins(l.stay.wait)} min` : ""}. Stay on, or board the next ${esc(R[0])} there.</div>` : ""}
        <details><summary>Stops on this ride</summary><ol>${(l.via||[]).map(([si,t]) => `<li>${fmtT(t)} · ${esc(D.stops[si].name)}</li>`).join("")}</ol></details></span></div>`); } }
  i = "end"; rows.push(`<div class="leg walk" ${lg("end")}><span class="t">${fmtT(o.arrive)}</span><span class="rail"><i style="--c:var(--ink);border-radius:50% 50% 50% 0"></i></span><span class="d"><b>Arrive</b><div>${esc(S.to.label)}</div></span></div>`);
  return `<div class="legs">${rows.join("")}</div>`; }

/* ---------- ROUTES ---------- */
// every route that stops at a hub's platforms on this service day (cached per day)
const _hubR = {};
function hubRoutes(day){ return S.rhub ? hubRoutesFor(day, S.rhub) : null; }
function hubRoutesFor(day, k){ const key=day+k; if(_hubR[key]) return _hubR[key];
  const re=HUBS[k].re, I=idx(day), out=new Set();
  D.stops.forEach((st,si) => { if(re.test(st.name) && I.sRoutes[si]) for(const ri of I.sRoutes[si]) out.add(ri); });
  return _hubR[key]=out; }
function liveCounts(){ const m=new Map(); for(const st of VS.values()){ if(!st.info) continue; const ri=D.transit.routes.indexOf(st.info.R); m.set(ri,(m.get(ri)||0)+1); } return m; }
function renderRoutes(){ if(S.tab!=="routes") return; const day=liveDay(), I=idx(day), cnt=liveCounts();
  const all = [...I.heads.keys()].sort((a,b) => { const A=RT(a)[0], B=RT(b)[0]; return (parseInt(A)||999)-(parseInt(B)||999) || A.localeCompare(B); });
  const badge = ri => { const R=RT(ri); return `<button class="rbadge" data-route="${ri}" aria-pressed="${ri===S.route}" style="background:${R[2]};color:${routeInk(R)}${R[0].replace(/ U$/,"U").length>3? ";font-size:21px" : ""}" title="${esc(R[0]+" "+R[1])}">${esc(R[0].replace(/ U$/,"U"))}<small>${esc(R[1])}</small>${cnt.get(ri)? `<span class="nb">${cnt.get(ri)}</span>` : ""}</button>`; };
  const hubR = hubRoutes(day), shown = S.rhub && hubR ? all.filter(ri => hubR.has(ri)) : all;
  for(const b of document.querySelectorAll("[data-rhub]")){ b.setAttribute("aria-pressed", b.dataset.rhub===S.rhub);
    const n=hubRoutesFor(day, b.dataset.rhub); b.querySelector(".rn").textContent = n ? `${n.size} routes` : "All routes"; }
  $("routeHead").textContent = S.rhub ? `Routes to ${S.rhub==="uofg" ? "U of G" : "Downtown"}` : "All routes";
  const reg = shown.filter(regular), oth = shown.filter(ri => !regular(ri) && !/charter/i.test(RT(ri)[1]));
  $("rgrid").innerHTML = reg.map(badge).join(""); $("rgrid2").innerHTML = oth.map(badge).join(""); $("otherHead").hidden = $("rgrid2").hidden = !oth.length;
  $("routeDay").textContent = ({weekday:"weekday",saturday:"Saturday",sunday:"Sunday"})[day] + " service";
  const el=$("routeOut");
  if(S.route==null){ el.innerHTML = ""; return; }
  const ri=S.route, R=RT(ri), heads=[...(I.heads.get(ri)||new Map()).entries()].sort((a,b)=>b[1]-a[1]);
  if(!heads.length){ el.innerHTML = `<div class="rhead">${chip(ri)}<h2>${esc(R[1])}</h2></div><p class="empty" style="margin-top:8px">Route ${esc(R[0])} doesn't run today.</p>`; return; }
  if(S.rdir==null || !heads.some(([h]) => h===S.rdir)) S.rdir = heads[0][0];
  const d=D.days[day], h=S.rdir, c=d.c, now=nowSec(), seqs=tripSeq(day);
  // trips this direction: start times, a representative stop sequence
  const trips=[]; d.trips.forEach((r,ti) => { if(r===ri && d.head[ti]===h){ const q=seqs.get(ti); if(q) trips.push([ti, q[0][1], q]); } }); trips.sort((a,b)=>a[1]-b[1]);
  const rep = trips.reduce((a,b) => (!a || new Set(b[2].map(x=>x[0])).size > new Set(a[2].map(x=>x[0])).size) ? b : a, null);
  const starts = trips.map(t=>t[1]), soon = starts.filter(t => t>=now-1800 && t<=now+5400), gaps=[]; for(let i=1;i<soon.length;i++) gaps.push(soon[i]-soon[i-1]); gaps.sort((a,b)=>a-b);
  const every = gaps.length ? Math.round(gaps[gaps.length>>1]/60) : null, running = starts.length && now >= starts[0]-900 && now <= starts[starts.length-1]+3600;
  // next departure per stop for this route + direction
  const next = new Map(), live = liveOK(day);
  for(let k=firstAt(c, now-900); k<c.length && c[k] < now+7200; k+=5){ const ti=c[k+4]; if(d.trips[ti]!==ri || d.head[ti]!==h) continue; const si=c[k+2];
    let t=c[k], dl=null; if(live){ const p=predict(day, ti, si, c[k]); if(p){ t=p.t; dl=p.delay; } } if(t < now-30) continue; const cur=next.get(si); if(!cur || t<cur.t) next.set(si, {t, delay:dl}); }
  // live buses: which stop each is heading to
  const busAt = new Map(); let nb=0;
  for(const st of VS.values()){ if(!st.info || st.info.ti==null || D.transit.routes.indexOf(st.info.R)!==ri || d.head[st.info.ti]!==h) continue; nb++;
    const q=seqs.get(st.info.ti)||[], dl=st.info.delay||0, nx=q.find(([si,t]) => t+dl >= now); if(nx) busAt.set(nx[0], (busAt.get(nx[0])||0)+1); }
  const stopsSeq = []; if(rep) for(const [si] of rep[2]) if(!stopsSeq.length || stopsSeq[stopsSeq.length-1]!==si) stopsSeq.push(si);
  const al = live ? alertsFor(new Set([ri]), new Set()) : [];
  el.innerHTML = `<div class="rhead">${chip(ri)}<div><h2>${esc(R[1])}</h2><div class="rlong">Route ${esc(R[0])} · ${trips.length} trips today this way</div></div><button class="ibtn" id="routeX" aria-label="Back to all routes"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    ${heads.length>1 ? `<div class="dirs" role="group" aria-label="Direction">${heads.map(([hh]) => `<button data-dir="${hh}" aria-pressed="${hh===h}">${esc(headText(day,hh) || R[1])}</button>`).join("")}</div>` : ""}
    <div class="facts"><div><small>How often</small><b>${running && every ? "Every "+every+" min" : running ? "Hourly" : "Not now"}</b></div><div><small>First · last</small><b>${starts.length? fmtT(starts[0])+" – "+fmtT(starts[starts.length-1]) : "–"}</b></div><div><small>On the road</small><b>${nb} bus${nb===1?"":"es"}</b></div></div>
    ${alertHTML(al)}
    <div class="sec" style="margin-top:14px"><h3>Stops <em>next bus${live? '<span class="livetag">live</span>':""}</em></h3>
    <ol class="slist" style="--c:${R[2]}">${stopsSeq.map(si => { const s=D.stops[si], n=next.get(si);
      return `<li data-stop="${si}" class="${busAt.has(si)?"bus":""}"><i></i><span class="nm">${esc(s.name)}<small>#${esc(s.code)}</small>${busAt.has(si)? ` <span class="livetag">bus coming</span>` : ""}</span><span class="nx">${n? (n.t-now<3600? minsAway(n.t) : fmtT(n.t)) : "–"}</span></li>`; }).join("")}</ol></div>`; }

/* ---------- STOPS ---------- */
function renderStop(){ if(S.tab!=="stops") return; const el=$("stopOut");
  const q=$("stopQ").value.trim();
  if(S.stop==null){
    if(q){ const res=searchAll(q, {places:false, addresses:false}).slice(0,12); el.innerHTML = res.length ? `<div class="near">${res.map(r => stopRowHTML(r.stop)).join("")}</div>` : `<p class="empty">No stop matches “${esc(q)}”.</p>`; return; }
    const c = meMarker ? meMarker.getLatLng() : map.getCenter(), x=(c.lng-LON0)*KX, y=(c.lat-LAT0)*KY;
    const near = D.stops.map(s => [s.i, Math.hypot((s.lon-LON0)*KX-x, (s.lat-LAT0)*KY-y)]).sort((a,b)=>a[1]-b[1]).slice(0,8);
    el.innerHTML = `<div class="sec"><h3>${meMarker? "Stops near you" : "Stops near the map centre"}</h3><div class="near">${near.map(([si,d]) => stopRowHTML(si, Math.round(d)+" m")).join("")}</div></div>`; return; }
  const si=S.stop, s=D.stops[si], day=liveDay(), I=idx(day), routes=[...I.sRoutes[si]].sort((a,b)=>(parseInt(RT(a)[0])||999)-(parseInt(RT(b)[0])||999)), t=nowSec();
  const list = departures(new Set([si]), day, t, t+5400);
  const al = liveOK(day) ? alertsFor(new Set(routes), new Set([si])) : [];
  el.innerHTML = `<div class="stoph"><div style="display:flex;justify-content:space-between;gap:8px"><div><div class="code">Stop #${esc(s.code)}</div><h2>${esc(s.name)}</h2></div><button class="ibtn" id="stopX" aria-label="Close stop"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="rchips">${routes.map(ri => `<button data-route="${ri}" title="Route ${esc(RT(ri)[0])} ${esc(RT(ri)[1])}">${chip(ri)}</button>`).join("")}</div>
    <div class="acts"><button data-tripfrom="${si}">Trip from here</button><button data-tripto="${si}">Trip to here</button></div></div>
    ${alertHTML(al)}
    <div class="sec" style="margin-top:14px"><h3>Next buses <em>${liveOK(day)? 'next 90 min<span class="livetag">live</span>' : "next 90 min, scheduled"}</em></h3><div class="deps">${list.length ? depRows(list, {day, arrives:true, max:12, sub:() => ""}) : `<p class="empty">No departures in the next 90 minutes.</p>`}</div></div>`; }
function stopRowHTML(si, dist){ const s=D.stops[si], rs=[...idx(liveDay()).sRoutes[si]].sort((a,b)=>(parseInt(RT(a)[0])||999)-(parseInt(RT(b)[0])||999));
  return `<button data-stop="${si}"><span>${esc(s.name)}<br><small>#${esc(s.code)}${dist? " · "+dist : ""}</small></span><span class="rs">${rs.slice(0,6).map(ri=>chip(ri)).join("")}</span></button>`; }
function openStop(si, {pan=true}={}){ S.bus=null; $("busOut").hidden=true; S.stop=si; $("stopQ").value=""; setTab("stops");
  if(pan){ const s=D.stops[si]; map.setView([s.lat,s.lon], Math.max(map.getZoom(), 16)); } }
function openRoute(ri, head=null){ S.bus=null; $("busOut").hidden=true; S.route=ri; S.rdir=head; setTab("routes");
  const b=L.latLngBounds([]); for(const sh of D.shapes) if(sh.route===ri) sh.xs.forEach((x,j) => b.extend(unmerc(x, sh.ys[j]))); if(b.isValid()) map.fitBounds(b.pad(.05)); }

/* ---------- BUS ---------- */
/* ---------- "Find bus": show the live bus for a trip option's first ride ---------- */
const FINDBUS = `<svg viewBox="0 0 24 24"><rect x="5" y="3" width="14" height="14" rx="2.5"/><path d="M5 10h14 M8 20v-3 M16 20v-3"/></svg>Find bus`;
function findBus(k){ const o=S.opts && S.opts[k], r=o && o.rides[0]; if(!r) return null;
  for(const st of VS.values()) if(st.info && st.info.day===S.planDay && st.info.ti===r.ti) return st.id;
  return null; }
function goFindBus(el){ const id=findBus(+el.dataset.findbus), mk = id!=null && LV.markers.get(id);
  if(!mk){ el.textContent="Not on the road yet"; el.classList.add("none"); clearTimeout(el._t); el._t=setTimeout(() => { el.innerHTML=FINDBUS; el.classList.remove("none"); }, 3000); return; }
  // the bus card opens at the top of the panel; keep this trip where it was on screen
  const k=el.dataset.findbus, y0=el.getBoundingClientRect().top;
  selectBus(id); map.setView(mk.getLatLng(), Math.max(map.getZoom(), 16));
  const el2=document.querySelector(`[data-findbus="${k}"]`); if(el2){ const dy=el2.getBoundingClientRect().top-y0; if(Math.abs(dy)>1){ const sc=$("panel"); if(sc.scrollHeight>sc.clientHeight+1 && getComputedStyle(sc).overflowY!=="visible") sc.scrollTop+=dy; else window.scrollBy(0,dy); } } }
function selectBus(id){ S.bus=id; renderBus(); redraw(); }
function renderBus(){ const el=$("busOut"); const st = S.bus && VS.get(S.bus); if(!st || !st.info){ el.hidden=true; S.bus=null; return; }
  const {R, head, delay, day, ti} = st.info, ri=D.transit.routes.indexOf(R), now=nowSec(), q = ti!=null ? (tripSeq(day).get(ti)||[]) : [], dl=delay||0;
  const up=[]; for(const [si,t] of q){ if(t+dl >= now-20 && (!up.length || up[up.length-1][0]!==si)) up.push([si,t+dl]); if(up.length>=6) break; }
  el.hidden=false;
  el.innerHTML = `<button class="ibtn x" id="busX" aria-label="Close bus"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
    <div class="rhead" style="grid-template-columns:auto 1fr">${chip(ri)}<div><h2 style="font-size:22px">${esc((head||R[1]).replace(/^\S+\s/,""))}</h2><div class="rlong">Bus ${esc(st.v_?.vehicle?.label || st.id)} · ${delay==null? "no live times" : Math.abs(delay)<60? "on time" : delay>0? Math.round(delay/60)+" min late" : -Math.round(delay/60)+" min early"}<span class="livetag">live</span></div></div></div>
    ${up.length? `<ol class="slist" style="--c:${R[2]};margin-top:10px">${up.map(([si,t]) => `<li data-stop="${si}"><i></i><span class="nm">${esc(D.stops[si].name)}<small>#${esc(D.stops[si].code)}</small></span><span class="nx">${minsAway(t)}</span></li>`).join("")}</ol>` : ""}
    <div class="acts"><button data-route="${ri}" data-head="${ti!=null? D.days[day].head[ti] : ""}">Whole route ${esc(R[0])}</button><button id="busFollow">Centre on bus</button></div>`; }

/* ---------- my location ---------- */
let watchId=null, wantFrom=null;
function locate(field="from"){ if(!("geolocation" in navigator)) return; wantFrom = field; $("locBtn").classList.add("on");
  if(watchId!=null){ if(meMarker) useMe(); return; }
  watchId = navigator.geolocation.watchPosition(p => { const ll=[p.coords.latitude, p.coords.longitude];
      if(!meMarker){ meCircle=L.circle(ll, {radius:p.coords.accuracy, color:"#1A73E8", weight:1, fillOpacity:.12, interactive:false}).addTo(map);
        meMarker=L.marker(ll, {icon:L.divIcon({className:"", html:'<div class="me"></div>', iconSize:[16,16], iconAnchor:[8,8]}), keyboard:false, interactive:false, zIndexOffset:1500}).addTo(map); }
      else { meMarker.setLatLng(ll); meCircle.setLatLng(ll).setRadius(p.coords.accuracy); }
      if(wantFrom){ useMe(); } },
    () => { $("locBtn").classList.remove("on"); wantFrom=null; $("locWait")?.remove(); $("planOut").insertAdjacentHTML("afterbegin", `<p class="empty">Couldn't get your location. Type a start address instead.</p>`); }, {enableHighAccuracy:true, maximumAge:10000}); }
function useMe(){ const f=wantFrom; wantFrom=null; const ll=meMarker.getLatLng(); setEnd(f, epPoint(ll.lat, ll.lng, "My location")); map.setView(ll, Math.max(map.getZoom(), 16)); }

/* ---------- URL ---------- */
function syncURL(){ const p=new URLSearchParams(); if(PREVIEW) p.set("preview","1");
  if(S.tab!=="plan") p.set("tab", S.tab);
  // start and destination are not kept in the address bar, so a reload always opens with both boxes empty
  if(S.tab==="routes" && S.route!=null) p.set("route", RT(S.route)[0]); if(S.tab==="routes" && S.rhub) p.set("going", S.rhub); if(S.tab==="stops" && S.stop!=null) p.set("stop", D.stops[S.stop].code);
  history.replaceState(null, "", location.pathname + (p.toString()? "?"+p : "")); }
function resolve(text){ if(!text) return null; if(HUBS[text.toLowerCase()]) return hubEP(text.toLowerCase()); const ll=text.match(/^(-?\d+\.\d+),\s*(-?\d+\.\d+)$/); if(ll) return epPoint(+ll[1], +ll[2], "Map point");
  const st=text.match(/^stop\s+(\w+)$/i); if(st){ const s=D.stops.find(x=>x.code===st[1]); return s? epStop(s.i) : null; }
  const r=searchAll(text); return r.length ? r[0].ep() : null; }

/* ---------- live (website version) ---------- */
function refreshPanel(){ if(S.tab==="plan" && !S.opts) renderPlan(); if(S.tab==="routes") renderRoutes(); if(S.tab==="stops") renderStop(); if(S.bus) renderBus(); }
let nextPoll = 0;
function startLive(){
  if(!LIVE && !PREVIEW) return;
  $("liveBody").innerHTML = ""; renderLive();
  setInterval(() => { $("liveClock").textContent = new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit", second:"2-digit"}); }, 1000);
  if(!PREVIEW){ loadCityLive(); loadClosures(); setInterval(loadClosures, 5*60000); } else { setStatus("city","ok","","Saved copy"); setStatus("closures","","","Off in preview"); }
  if((LIVE && LIVE.relay) || PREVIEW){
    const every = (fn, ms, bar) => { const run = () => { fn(); if(bar) nextPoll = Date.now() + ms; }; run(); setInterval(() => { if(!document.hidden) run(); }, ms); };
    every(pollVehicles, 15000, true); every(pollTrips, 30000); every(pollAlerts, 120000);
    setInterval(refreshPanel, 30000);
    $("refresh").hidden = false;
    setInterval(() => { const left=Math.max(0, nextPoll-Date.now()); $("refreshFill").style.width = (100 - left/15000*100).toFixed(1)+"%";
      $("refreshTxt").textContent = LV.veh.length ? `${LV.veh.length} buses · update in ${Math.ceil(left/1000)} s` : LV.st.buses && LV.st.buses.state==="bad" ? `Live buses unavailable · retrying in ${Math.ceil(left/1000)} s` : `Loading buses…`; }, 250);
  } else { for(const k of ["buses","preds","alerts"]) setStatus(k, "bad", "", "Add your relay address in config.js to turn this on"); }
}

/* ---------- boot ---------- */
async function boot(){
  if(PREVIEW) $("previewTag").hidden = false;
  map = L.map("map", {zoomControl:true, minZoom:11, maxZoom:19, preferCanvas:true}).setView([43.5450,-80.2490], 16);   // opening view: downtown at street scale
  map.attributionControl.setPrefix(false); map.attributionControl.addAttribution("City of Guelph Open Data · Guelph Transit · © OpenStreetMap contributors");
  try { await load(); } catch(err){ $("loading").textContent = "Couldn't load the map data. Refresh the page to try again."; return; }
  $("loading").remove(); buildPlaces();
  map.setMaxBounds(L.latLngBounds([43.43,-80.40],[43.64,-80.08]));
  base = new MapCanvas().addTo(map); legend = new Legend().addTo(map);
  const busScale = () => { const z=map.getZoom(); document.documentElement.style.setProperty("--bs", z<=12? .5 : z===13? .62 : z===14? .78 : z===15? .9 : 1); };
  map.on("zoomend", busScale); busScale();
  // controls
  for(let h=5; h<=24; h++) for(const m of [0,15,30,45]){ if(h===24 && m) break; const o=document.createElement("option"); o.value=h*3600+m*60; o.textContent=fmtT(h*3600+m*60); if(h===8&&m===0) o.selected=true; $("whenTime").appendChild(o); }
  $("whenDay").value = todayType(); S.day = todayType();
  $("whenMode").onchange = e => { S.when=e.target.value; $("whenDay").disabled = $("whenTime").disabled = S.when==="now"; if(S.from && S.to) runPlan(); else renderPlan(); };
  $("whenDay").onchange = e => { S.day=e.target.value; if(S.from && S.to) runPlan(); };
  $("whenTime").onchange = e => { S.t=+e.target.value; if(S.from && S.to) runPlan(); };
  $("goBtn").onclick = () => { if(!S.from){ $("fromQ").focus(); return; } if(!S.to){ $("toQ").focus(); return; } runPlan(); };
  $("swapBtn").onclick = () => { const a=S.from; S.from=null; setEnd("from", S.to, {go:false}); setEnd("to", a); };
  $("locBtn").onclick = () => locate("from");
  for(const b of document.querySelectorAll(".hub[data-hub]")) b.onclick = () => goHub(b.dataset.hub);
  for(const b of document.querySelectorAll("[data-rhub]")) b.onclick = () => { S.rhub = S.rhub===b.dataset.rhub ? null : b.dataset.rhub; renderRoutes(); redraw(); syncURL(); };
  initPull();
  $("pickBtn").onclick = () => { S.pick = S.pick==="to" ? null : "to"; if(S.pick && S.tab!=="plan") setTab("plan"); updatePickHint(); };
  $("pickX").onclick = () => { S.pick=null; updatePickHint(); };
  document.addEventListener("keydown", e => { if(e.key==="Escape" && S.pick){ S.pick=null; updatePickHint(); } });
  $("walkChk").onchange = e => { S.showWalk=e.target.checked; redraw(); };
  for(const f of ["from","to"]){ const q=$(f+"Q");
    q.addEventListener("input", () => { if(!q.value && S[f]){ S[f]=null; S.opts=null; S.opt=0; setPin(f, null); renderPlan(); redraw(); updateHubs(); } showSugg(f); });
    let justFocused=false;
    q.addEventListener("focus", () => { if(!q.value){ showSugg(f); return; } justFocused=true; q.select(); setTimeout(() => { q.setSelectionRange(0, q.value.length); justFocused=false; }, 0); });
    q.addEventListener("mouseup", e => { if(justFocused){ e.preventDefault(); justFocused=false; } });
    q.addEventListener("touchend", () => { if(document.activeElement===q && q.value && q.selectionStart===q.selectionEnd && justFocused) setTimeout(() => q.setSelectionRange(0, q.value.length), 0); });
    q.addEventListener("keydown", e => { if($("sugg").hidden) return;
      if(e.key==="ArrowDown"){ sActive=Math.min(sugg.length-1,sActive+1); showSuggSel(); e.preventDefault(); }
      else if(e.key==="ArrowUp"){ sActive=Math.max(0,sActive-1); showSuggSel(); e.preventDefault(); }
      else if(e.key==="Enter" && sActive>=0){ pickSugg(sActive); e.preventDefault(); }
      else if(e.key==="Escape") hideSugg(); });
    q.addEventListener("blur", () => setTimeout(hideSugg, 150)); }
  $("sugg").addEventListener("mousedown", e => { const li=e.target.closest("li[data-k]"); if(li){ e.preventDefault(); pickSugg(+li.dataset.k); } });
  $("tabPlan").onclick = () => setTab("plan"); $("tabRoutes").onclick = () => setTab("routes"); $("tabStops").onclick = () => setTab("stops");
  $("stopQ").addEventListener("input", () => { S.stop=null; renderStop(); redraw(); });
  // one delegated handler for everything clickable in the panel
  $("panel").addEventListener("keydown", e => { const t=e.target.closest("[data-findbus],[data-leg]"); if(t && (e.key==="Enter" || e.key===" ")){ e.preventDefault(); e.stopPropagation(); t.dataset.findbus!=null ? goFindBus(t) : t.click(); } });
  $("panel").addEventListener("click", e => { const t=e.target.closest("[data-findbus],[data-leg],[data-opt],[data-route],[data-stop],[data-dir],[data-tripfrom],[data-tripto],#routeX,#stopX,#busX,#busFollow"); if(!t) return;
    if(t.dataset.findbus!=null){ e.preventDefault(); goFindBus(t); return; }
    if(t.dataset.opt!=null){ const k=+t.dataset.opt; S.opt=k; S.leg=null; renderPlan(); fitTrip(); redraw(); return; }
    if(t.dataset.leg!=null){ if(e.target.closest("details")) return; showLeg(t.dataset.leg==="end" ? "end" : +t.dataset.leg); return; }
    if(t.id==="routeX"){ S.route=null; renderRoutes(); redraw(); syncURL(); return; }
    if(t.id==="stopX"){ S.stop=null; renderStop(); redraw(); syncURL(); return; }
    if(t.id==="busX"){ S.bus=null; $("busOut").hidden=true; redraw(); return; }
    if(t.id==="busFollow"){ const mk=LV.markers.get(S.bus); if(mk) map.setView(mk.getLatLng(), Math.max(map.getZoom(), 16)); return; }
    if(t.dataset.dir!=null){ S.rdir=+t.dataset.dir; renderRoutes(); redraw(); return; }
    if(t.dataset.tripfrom!=null){ setTab("plan"); setEnd("from", epStop(+t.dataset.tripfrom)); if(!S.to) $("toQ").focus(); return; }
    if(t.dataset.tripto!=null){ setTab("plan"); setEnd("to", epStop(+t.dataset.tripto)); if(!S.from) $("fromQ").focus(); return; }
    if(t.dataset.route!=null){ openRoute(+t.dataset.route, t.dataset.head ? +t.dataset.head : null); return; }
    if(t.dataset.stop!=null){ openStop(+t.dataset.stop); return; } });
  // map: tap a stop to open it; tap anywhere else for trip options
  renderLayerChips();
  $("layers").addEventListener("click", e => { const b=e.target.closest("[data-layer]"); if(!b) return; const k=b.dataset.layer; SHOWP.has(k)? SHOWP.delete(k) : SHOWP.add(k); b.setAttribute("aria-pressed", SHOWP.has(k)); base.draw(); });
  L.DomEvent.disableClickPropagation($("layers")); L.DomEvent.disableScrollPropagation($("layers"));
  // a tap on the map while a card is open just closes the card (Leaflet closes it on "preclick")
  let cardWasOpen = false;
  map.on("popupopen", () => $("map").classList.add("card-open")); map.on("popupclose", () => $("map").classList.remove("card-open"));
  map.on("preclick", () => { cardWasOpen = !!(map._popup && map.hasLayer(map._popup)); });
  map.on("click", e => { if(cardWasOpen){ cardWasOpen = false; return; } const p=map.latLngToContainerPoint(e.latlng), z=map.getZoom(); let best=-1, bd=(z>=16? 14 : 10)**2;
    const tgt = pickTarget(); if(tgt){ S.pick=null; setEnd(tgt, tapEndpoint(e.latlng, p), {view:false}); return; }
    const hitP = placeAt(p); if(hitP){ placePopup(hitP); return; }
    if(z>=14 || focus()) for(const s of D.stops){ const q=map.latLngToContainerPoint([s.lat,s.lon]), d=(q.x-p.x)**2+(q.y-p.y)**2; if(d<bd){bd=d;best=s.i;} }
    if(best>=0){ openStop(best, {pan:false}); return; }
    const ep = tapPoint(e.latlng);
    const pop = L.popup({closeButton:true, closeButtonLabel:"Close", offset:[0,-4], autoPanPaddingTopLeft:[10,60]}).setLatLng(e.latlng).setContent(`<div class="mpop"><b>${esc(ep.label)}</b><button data-m="from">Start a trip here</button><button data-m="to">Go here</button><button data-m="stops">Stops near here</button></div>`).openOn(map);
    pop.getElement().addEventListener("click", ev => { const b=ev.target.closest("[data-m]"); if(!b) return; map.closePopup();
      if(b.dataset.m==="stops"){ S.stop=null; map.panTo(e.latlng); setTab("stops"); setTimeout(renderStop, 300); return; }
      if(S.tab!=="plan") setTab("plan"); setEnd(b.dataset.m, ep); }); });
  map.on("moveend", () => { if(S.tab==="stops" && S.stop==null && !$("stopQ").value) renderStop(); });
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => base.draw());
  // deep links: ?from=&to=&route=&stop=&tab=
  const P = new URLSearchParams(location.search);
  const f = resolve(P.get("from")), t = resolve(P.get("to"));
  if(f) setEnd("from", f, {go:false, view:!t}); if(t) setEnd("to", t, {go:false});
  if(HUBS[P.get("going")]) S.rhub = P.get("going");
  if(P.get("route")){ const ri=D.transit.routes.findIndex(R => R[0].toLowerCase()===P.get("route").toLowerCase()); if(ri>=0){ S.route=ri; } }
  if(P.get("stop")){ const s=D.stops.find(x=>x.code===P.get("stop")); if(s) S.stop=s.i; }
  setTab(P.get("tab") || (S.route!=null ? "routes" : S.stop!=null ? "stops" : "plan"));
  if(S.from && S.to) runPlan(); else if(S.tab==="routes" && S.route!=null) openRoute(S.route); else if(S.tab==="stops" && S.stop!=null) openStop(S.stop);
  startLive(); setInterval(tickCD, 1000);
}
function showSuggSel(){ document.querySelectorAll("#sugg li[data-k]").forEach((li,k) => li.setAttribute("aria-selected", k===sActive)); }
