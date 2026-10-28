/* ======================= live data (website version) ======================= */
const LIVE = window.GUELPH_LIVE || null;
const CITY_API = "https://gismaps.guelph.ca/hosting/rest/services/";
const WARN_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 20h20z" fill="var(--warn)"/><path d="M12 9.5v5 M12 17.4v.1" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>`;
const LV = { veh:[], tu:new Map(), alerts:[], closures:[], snow:null, st:{}, show:{buses:true, closures:true, snow:false}, markers:new Map(), layer:null };
const todayMidnight = () => { const d=new Date(); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()/1000; };
const nowSec = () => Math.floor(Date.now()/1000 - todayMidnight());
const todayType = () => { const w=new Date().getDay(); return w===0? "sunday" : w===6? "saturday" : "weekday"; };
function svcMidnight(ymd){ if(!ymd || ymd.length!==8) return todayMidnight(); return new Date(+ymd.slice(0,4), +ymd.slice(4,6)-1, +ymd.slice(6)).getTime()/1000; }
const _tripIdx = {}, _sched = {};
function tripIndex(dayKey){ return _tripIdx[dayKey] || (_tripIdx[dayKey] = new Map(D.days[dayKey].ids.map((id,i) => [id,i]))); }
function tripSched(dayKey){ if(_sched[dayKey]) return _sched[dayKey]; const c=D.days[dayKey].c, m=new Map();
  for(let k=0;k<c.length;k+=5){ const ti=c[k+4]; let t=m.get(ti); if(!t) m.set(ti, t=new Map()); if(!t.has(c[k+2])) t.set(c[k+2], c[k]); t.set(c[k+3], c[k+1]); }
  return _sched[dayKey]=m; }
D.stopById = null;
function stopIdx(id){ if(!D.stopById) D.stopById = new Map(D.transit.stops.map((s,i) => [String(s[6] ?? s[0]), i])); return D.stopById.get(String(id)); }
// predicted departure (seconds after midnight) for static trip ti at stop si
function predict(dayKey, ti, si, sched){
  const u = LV.tu.get(D.days[dayKey].ids[ti]); if(!u || !u.stop_time_update) return null;
  const mid = svcMidnight(u.trip && u.trip.start_date), sch = tripSched(dayKey).get(ti); let best=null;
  for(const s of u.stop_time_update){ const ev = s.departure || s.arrival; if(!ev || !ev.time) continue; const sx = stopIdx(s.stop_id); if(sx==null) continue;
    const ss = sch && sch.get(sx); if(ss==null) continue; const delay = (ev.time - mid) - ss;
    if(sx===si) return {t: ev.time - todayMidnight(), delay};
    if(ss <= sched && (!best || ss > best.ss)) best = {ss, delay}; }
  if(!best) return null;
  return {t: sched + best.delay, delay: best.delay}; }
// alerts that touch any of these routes (route indices) or stops (stop indices)
function alertsFor(routes, stops){ if(!LV.alerts.length) return [];
  const routeIds = new Set([...(routes||[])].map(ri => D.transit.routes[ri][3])), stopIds = new Set([...(stops||[])].map(si => String(D.transit.stops[si][6] ?? D.transit.stops[si][0])));
  const now = Date.now()/1000;
  return LV.alerts.filter(a => (!a.periods.length || a.periods.some(p => (!p.start || p.start <= now) && (!p.end || p.end >= now))) &&
    a.ents.some(e => (e.route_id && routeIds.has(e.route_id)) || (e.stop_id && stopIds.has(e.stop_id)))); }

function setStatus(key, state, label, detail){ LV.st[key] = {state, label, detail, at:Date.now()}; renderLive(); }
function renderLive(){
  if(!LIVE) return;
  const order = [["buses","Live buses"],["preds","Arrival predictions"],["alerts","Service alerts"],["city","City amenities & AEDs"],["closures","Road closures"],["snow","Sidewalk snow clearing"]];
  $("liveBody").innerHTML = `<div class="livelist">${order.map(([k,lbl]) => { const s=LV.st[k] || {state:"", detail:"Not loaded"};
      return `<div class="lrow"><span class="ldot ${s.state}"></span><span>${lbl}<small>${esc(s.detail||"")}</small></span><span class="st">${s.at ? new Date(s.at).toLocaleTimeString([], {hour:"numeric", minute:"2-digit"}) : ""}</span></div>`; }).join("")}</div>
    <div class="toggles">${[["buses","Show live buses"],["closures","Show road closures"],["snow","Show sidewalk snow clearing"]].map(([k,l]) => `<label><input type="checkbox" id="tg_${k}" ${LV.show[k]?"checked":""}> ${l}</label>`).join("")}</div>
    <div id="snowNear" class="insight" ${LV.snow && S.report ? "" : "hidden"}></div>`;
  for(const k of ["buses","closures","snow"]) $("tg_"+k).onchange = e => { LV.show[k]=e.target.checked; if(k==="snow" && LV.show.snow && !LV.snow) loadSnow(); drawBuses(); updateLegend(); base.draw(); };
  snowNear();
}
const SNAP = {vehicles:"vehiclepositions", tripupdates:"tripupdates", alerts:"alerts"};
async function fetchBuf(path){ const url = PREVIEW ? "data/realtime/" + SNAP[path] + ".pb" : LIVE.relay.replace(/\/$/,"") + "/" + path; const r = await fetch(url, {cache:"no-store"}); if(!r.ok) throw new Error("HTTP " + r.status); return new Uint8Array(await r.arrayBuffer()); }
async function fetchJSON(url){ const r = await fetch(url); if(!r.ok) throw new Error("HTTP " + r.status); const j = await r.json(); if(j.error) throw new Error(j.error.message || "service error"); return j; }

async function pollVehicles(){
  try { const m = GTFSRT.decode(await fetchBuf("vehicles"));
    LV.veh = m.entity.map(e => e.vehicle).filter(v => v && v.position && v.position.latitude);
    LV.vehTs = m.header && m.header.timestamp;
    setStatus("buses", "ok", "", `${LV.veh.length} buses on the road`); drawBuses();
  } catch(e){ setStatus("buses", "bad", "", "Feed unavailable (" + e.message + ")"); } }
async function pollTrips(){
  try { const m = GTFSRT.decode(await fetchBuf("tripupdates")); LV.tu = new Map();
    for(const e of m.entity) if(e.trip_update && e.trip_update.trip) LV.tu.set(e.trip_update.trip.trip_id, e.trip_update);
    setStatus("preds", "ok", "", `${LV.tu.size} trips with live times`);
    refreshPanel(); drawBuses();
  } catch(e){ setStatus("preds", "bad", "", "Feed unavailable (" + e.message + ")"); } }
async function pollAlerts(){
  try { const m = GTFSRT.decode(await fetchBuf("alerts"));
    LV.alerts = m.entity.filter(e => e.alert).map(e => ({ head: GTFSRT.text(e.alert.header_text).trim(), desc: GTFSRT.text(e.alert.description_text).replace(/\r/g,"").replace(/^\s*-{3,}\s*/m,"").trim(), ents: e.alert.informed_entity || [], periods: e.alert.active_period || [] }));
    setStatus("alerts", "ok", "", `${LV.alerts.length} active across the system`); refreshPanel();
  } catch(e){ setStatus("alerts", "bad", "", "Feed unavailable (" + e.message + ")"); } }

/* ---- route colours straight from the schedule (routes.txt route_color / route_text_color) ---- */
function lum(hex){ const n=parseInt(hex.slice(1),16), f=c=>{ c/=255; return c<=0.03928? c/12.92 : Math.pow((c+0.055)/1.055,2.4); }; return 0.2126*f(n>>16)+0.7152*f(n>>8&255)+0.0722*f(n&255); }
const contrast = (a,b) => { const x=lum(a), y=lum(b); return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05); };
// the schedule's text colour when it's readable on the route colour (4.5:1), otherwise white or black, whichever reads better
function routeInk(R){ const bg=R[2], t=R[4]||"#FFFFFF"; if(contrast(bg,t) >= 4.5) return t; return contrast(bg,"#FFFFFF") >= contrast(bg,"#000000") ? "#FFFFFF" : "#000000"; }
const BUS_BLUE = "#00A6E5";
function busSVG(R){ const num=esc(R[0]), long=R[0].length>2, ink=routeInk(R);
  return `<svg width="60" height="60" viewBox="0 0 92 92" aria-hidden="true"><g class="bg" transform="rotate(0 46 46)">
    <path d="M46 1l7 9H39z" fill="${R[2]}" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/>
    <rect x="31" y="12" width="30" height="68" rx="8" fill="${R[2]}" stroke="#fff" stroke-width="2.5"/>
    <rect x="35" y="16" width="22" height="10" rx="3.5" fill="${BUS_BLUE}"/>
    <rect x="44" y="30" width="4" height="40" rx="2" fill="${BUS_BLUE}"/>
    <rect x="37" y="72" width="18" height="3" rx="1.5" fill="#1C2A2D" opacity=".35"/></g>
    <circle cx="46" cy="46" r="${long?18:16}" fill="${R[2]}" stroke="#fff" stroke-width="3"/>
    <text x="46" y="${long?51:52.5}" text-anchor="middle" font-size="${long? (R[0].length>3?11:14) : 19}" font-weight="700" fill="${ink}" font-family="Barlow Condensed, Arial Narrow, sans-serif">${num}</text></svg>`; }

/* ---- trip paths in local metres, with distance along ---- */
const _geo = {};
function shapeGeo(i){ if(_geo[i]) return _geo[i]; const fl=D.transit.tshapes[i], n=fl.length/2, x=new Float64Array(n), y=new Float64Array(n), s=new Float64Array(n);
  for(let k=0;k<n;k++){ x[k]=(fl[2*k]/1e5-LON0)*KX; y[k]=(fl[2*k+1]/1e5-LAT0)*KY; if(k) s[k]=s[k-1]+Math.hypot(x[k]-x[k-1], y[k]-y[k-1]); }
  return _geo[i]={x,y,s,n,len:s[n-1]}; }
// every place along the path within maxD of (px,py): [{s, d}]
function projectAll(g, px, py, maxD){ const out=[];
  for(let k=0;k<g.n-1;k++){ const ax=g.x[k], ay=g.y[k], dx=g.x[k+1]-ax, dy=g.y[k+1]-ay, L=dx*dx+dy*dy; let t = L? ((px-ax)*dx+(py-ay)*dy)/L : 0; t=Math.max(0,Math.min(1,t));
    const d=Math.hypot(px-ax-t*dx, py-ay-t*dy); if(d<=maxD) out.push({s: g.s[k]+t*(g.s[k+1]-g.s[k]), d}); }
  return out; }
function pointAt(g, s){ s=Math.max(0, Math.min(g.len, s)); let lo=0, hi=g.n-1; while(hi-lo>1){ const m=(lo+hi)>>1; if(g.s[m] <= s) lo=m; else hi=m; }
  const seg=g.s[hi]-g.s[lo] || 1, t=(s-g.s[lo])/seg, x=g.x[lo]+(g.x[hi]-g.x[lo])*t, y=g.y[lo]+(g.y[hi]-g.y[lo])*t;
  // heading: look a little ahead so the bus turns smoothly at corners
  let k=hi; while(k<g.n-1 && g.s[k]-s < 12) k++; const hx=g.x[k]-x, hy=g.y[k]-y;
  return {lat: y/KY+LAT0, lon: x/KX+LON0, deg: Math.atan2(hx, hy)*180/Math.PI}; }
// scheduled distance-along vs time for one trip: [[s, tSec], ...] (cached)
const _tripS = {}, _seq = {};
// ordered stop visits per trip (handles loop routes that start and end at the same stop)
function tripSeq(day){ if(_seq[day]) return _seq[day]; const c=D.days[day].c, m=new Map();
  for(let k=0;k<c.length;k+=5){ const ti=c[k+4]; let a=m.get(ti); if(!a){ m.set(ti, a=[[c[k+2], c[k]]]); } a.push([c[k+3], c[k+1]]); }
  return _seq[day]=m; }
function tripTimeline(day, ti, gi){ const key=day+":"+ti; if(_tripS[key]) return _tripS[key];
  const seq=tripSeq(day).get(ti), g=shapeGeo(gi), out=[]; let last=0;
  if(seq) for(const [si, t] of seq){ const st=D.stops[si], px=(st.lon-LON0)*KX, py=(st.lat-LAT0)*KY;
    const c=projectAll(g, px, py, 80).filter(p => p.s >= last-5); if(!c.length) continue;
    const best=c.reduce((a,b) => (a.s-last)+a.d*4 < (b.s-last)+b.d*4 ? a : b); last=best.s; out.push([best.s, t]); }
  return _tripS[key]=out; }
const interp = (tl, x, a, b) => { if(!tl.length) return null; if(x<=tl[0][a]) return tl[0][b]; for(let i=1;i<tl.length;i++) if(x<=tl[i][a]){ const p=tl[i-1], q=tl[i], f=(x-p[a])/((q[a]-p[a])||1); return p[b]+(q[b]-p[b])*f; } return tl[tl.length-1][b]; };

/* ---- per-bus motion state ----
   Each GPS fix is snapped to the bus's trip path. Between fixes the bus moves along the path at the
   speed the schedule implies (running late or early by the amount the last fix showed), never faster
   than 22 m/s and never backwards. A new fix eases the bus onto the real position. */
const VS = new Map();
function vehicleInfo(v){
  const day = todayType(), ti = v.trip ? tripIndex(day).get(v.trip.trip_id) : undefined;
  let ri = -1; if(v.trip && v.trip.route_id) ri = D.transit.routes.findIndex(R => R[3] === v.trip.route_id);
  if(ri < 0 && ti != null) ri = D.days[day].trips[ti];
  const R = ri >= 0 ? D.transit.routes[ri] : ["?", "Bus", "#555555", "", "#FFFFFF"];
  const head = ti != null ? D.days[day].headsigns[D.days[day].head[ti]] : "";
  let delay = null; const u = v.trip && LV.tu.get(v.trip.trip_id);
  if(u && ti != null && u.stop_time_update){ const sch = tripSched(day).get(ti), mid = svcMidnight(u.trip.start_date);
    for(const s of u.stop_time_update){ const ev=s.departure||s.arrival, sx=stopIdx(s.stop_id); if(ev && ev.time && sx!=null && sch && sch.has(sx)){ delay = ev.time - mid - sch.get(sx); break; } } }
  return {R, head, delay, day, ti}; }
function observe(v, info){
  const id = (v.vehicle && v.vehicle.id) || v.trip?.trip_id, now = Date.now()/1000;
  const tObs = v.timestamp || (LV.vehTs || now), lat = v.position.latitude, lon = v.position.longitude;
  let st = VS.get(id); const tripId = v.trip?.trip_id || "";
  if(!st || st.tripId !== tripId) st = {id, tripId, sDisp:null, lat, lon, dLat:lat, dLon:lon, deg:v.position.bearing||0};
  st.R = info.R; st.info = info; st.v_ = v; st.tObs = tObs; st.lat = lat; st.lon = lon; st.bearing = v.position.bearing || st.deg;
  st.mode = "free";
  const gi = info.ti != null ? D.days[info.day].shape?.[info.ti] : undefined;
  if(gi != null){
    const g = shapeGeo(gi), px=(lon-LON0)*KX, py=(lat-LAT0)*KY, tl = tripTimeline(info.day, info.ti, gi);
    let cands = projectAll(g, px, py, 60);
    if(cands.length){
      const mid = svcMidnight(v.trip.start_date), tRel = tObs - mid;
      // where should it be? continue from the last fix, else use the timetable (plus any known delay)
      const hint = st.sObs != null ? st.sObs : (tl.length ? interp(tl, tRel - (info.delay||0), 1, 0) : 0);
      const pick = cands.reduce((a,b) => Math.abs(a.s-hint)+a.d*5 < Math.abs(b.s-hint)+b.d*5 ? a : b);
      const prevObs = st.sObs, prevT = st.tObsRoute;
      st.mode = "route"; st.g = g; st.tl = tl; st.mid = mid; st.sObs = pick.s; st.tObsRoute = tObs;
      // speed: what the bus actually did since its last fix, blended with the timetable's pace here
      const tAt = tl.length >= 2 ? interp(tl, pick.s, 0, 1) : null;
      const vSched = tAt != null ? Math.max(0, (interp(tl, tAt + 60, 1, 0) - pick.s) / 60) : null;
      const vMeas = (prevObs != null && tObs - prevT >= 5) ? Math.max(0, (pick.s - prevObs) / (tObs - prevT)) : null;
      const vRep = v.position.speed != null ? v.position.speed : null;
      let vEst = vMeas != null ? (vMeas < 0.5 ? 0 : 0.7*vMeas + 0.3*(vSched ?? vMeas)) : (vRep != null ? vRep : (vSched ?? 6));
      if(vRep != null && vRep < 0.5 && (vMeas == null || vMeas < 1)) vEst = 0;     // stopped at a stop or on layover
      st.v = Math.min(22, vEst);
      if(st.sDisp == null || st.sDisp > pick.s + 400 || st.sDisp < pick.s - 800) st.sDisp = pick.s;   // first fix or way off: place it
    }
  }
  VS.set(id, st); return st; }
function modelS(st, t){
  const el = Math.max(0, Math.min(t - st.tObsRoute, 45));                        // after 45 s without news, stop guessing
  return Math.min(st.sObs + st.v * el, st.g.len); }
let _anim = 0, _lastFrame = 0;
const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
function animate(ts){
  _anim = 0; if(document.hidden || !LV.show.buses || S.mode==="census" || !VS.size) return;
  const dt = Math.min(0.25, (ts - (_lastFrame||ts))/1000); _lastFrame = ts; const t = Date.now()/1000;
  for(const st of VS.values()){ const mk = LV.markers.get(st.id); if(!mk) continue; let p;
    if(st.mode==="route"){ const target = modelS(st, t);
      const gap = target - st.sDisp;
      if(reduceMotion) st.sDisp = target;
      else if(gap > 0) st.sDisp += Math.min(gap, gap*Math.min(1, dt/2.5) + st.v*dt, (st.v + 18)*dt);   // glide forward, catching up gently
      else if(gap < -120) st.sDisp += gap*Math.min(1, dt/3);                       // only if well ahead of a stopped bus, ease back
      p = pointAt(st.g, st.sDisp); }
    else { const k = reduceMotion ? 1 : Math.min(1, dt/1.2); st.dLat += (st.lat - st.dLat)*k; st.dLon += (st.lon - st.dLon)*k; p = {lat:st.dLat, lon:st.dLon, deg:st.bearing}; }
    mk.setLatLng([p.lat, p.lon]);
    if(p.deg != null && st.rot){ let d = p.deg - st.deg; d = ((d+540)%360)-180; st.deg += d*Math.min(1, dt/0.4); st.rot.setAttribute("transform", `rotate(${st.deg.toFixed(1)} 46 46)`); } }
  _anim = requestAnimationFrame(animate); }
function kick(){ if(!_anim){ _lastFrame = 0; _anim = requestAnimationFrame(animate); } }
document.addEventListener("visibilitychange", kick);

function drawBuses(){
  if(!LV.layer) LV.layer = L.layerGroup().addTo(map);
  const show = LV.show.buses && S.mode !== "census";
  const seen = new Set();
  if(show) for(const v of LV.veh){ const id = (v.vehicle && v.vehicle.id) || v.trip?.trip_id; seen.add(id);
    const info = vehicleInfo(v), {R, head, delay} = info, st = observe(v, info);
    const age = LV.vehTs && v.timestamp ? Math.max(0, Math.round((LV.vehTs - v.timestamp))) : null;
    const tip = `<b>Route ${esc(R[0])} ${esc((head||R[1]).replace(/^\S+\s/,""))}</b><br>Bus ${esc(v.vehicle?.label || id)}${delay==null? "" : Math.abs(delay)<60? " · on time" : delay>0? ` · ${Math.round(delay/60)} min late` : ` · ${-Math.round(delay/60)} min early`}${age!=null? `<br><span style="color:var(--muted)">GPS fix ${age}s old${st.mode==="route" ? " · moving along its route" : ""}</span>` : ""}`;
    let mk = LV.markers.get(id);
    if(!mk || mk._route !== R[0]){ if(mk) LV.layer.removeLayer(mk);
      const start = st.mode==="route" && st.sDisp!=null ? pointAt(st.g, st.sDisp) : {lat:st.dLat, lon:st.dLon};
      mk = L.marker([start.lat, start.lon], {icon: L.divIcon({className:"busm", html:busSVG(R), iconSize:[60,60], iconAnchor:[30,30]}), keyboard:false, zIndexOffset:500})
        .bindTooltip(tip, {className:"tt", direction:"top", offset:[0,-18]}).on("click", ev => { L.DomEvent.stop(ev); selectBus(id); });
      mk._route = R[0]; LV.markers.set(id, mk); mk.addTo(LV.layer); st.rot = mk.getElement().querySelector(".bg"); st.deg = start.deg ?? st.bearing ?? 0;
      st.rot.setAttribute("transform", `rotate(${(st.deg||0).toFixed(1)} 46 46)`); }
    else { mk.setTooltipContent(tip); st.rot = mk.getElement()?.querySelector(".bg"); } }
  for(const [id, mk] of LV.markers) if(!seen.has(id)){ LV.layer.removeLayer(mk); LV.markers.delete(id); VS.delete(id); }
  busFocus(); kick();
}

/* City of Guelph live layers (read straight from the City's map server) */
function nearestNodeLL(lon, lat){ const x=(lon-LON0)*KX, y=(lat-LAT0)*KY;
  if(!D.ngrid){ D.ngrid=new Map(); D.nxp=new Float64Array(D.N); D.nyp=new Float64Array(D.N);
    for(let i=0;i<D.N;i++){ D.nxp[i]=(D.nlon[i]-LON0)*KX; D.nyp[i]=(D.nlat[i]-LAT0)*KY; const k=Math.floor(D.nxp[i]/100)+":"+Math.floor(D.nyp[i]/100); let a=D.ngrid.get(k); if(!a) D.ngrid.set(k,a=[]); a.push(i); } }
  let best=-1, bd=Infinity; for(let r=1;r<=8 && (best<0 || bd > (r-1)*100*(r-1)*100);r++){ for(let gx=-r;gx<=r;gx++) for(let gy=-r;gy<=r;gy++){ const a=D.ngrid.get((Math.floor(x/100)+gx)+":"+(Math.floor(y/100)+gy)); if(a) for(const i of a){ const d=(D.nxp[i]-x)**2+(D.nyp[i]-y)**2; if(d<bd){bd=d;best=i;} } } }
  return [best, Math.sqrt(bd)]; }
const titleCase = s => (s||"").toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).replace(/\b(Cs|Ps|Ss|Chs|Cvi)\b/g, m => m.toUpperCase());
function cityPoint(f, name, addr, extra){ const [lon,lat] = f.geometry.coordinates; const [node,conn] = nearestNodeLL(lon,lat);
  return {name, addr, lon, lat, node, conn:Math.round(conn), extra, mx:mercX(lon), my:mercY(lat)}; }
const layerURL = (path, fields) => `${CITY_API}${path}/query?where=1%3D1&outFields=${fields}&outSR=4326&f=geojson`;
async function loadCityLive(){
  setStatus("city", "wait", "", "Loading from the City's map server…");
  try {
    const [sc, fa, rr, gd, ae] = await Promise.all([
      fetchJSON(layerURL("OpenData/OpenData1/FeatureServer/36", "NAME,ADDRESS,TYPE,BOARD,STATUS")),
      fetchJSON(layerURL("OpenData/OpenData1/FeatureServer/32", "NAME,ADDRESS,CATEGORY")),
      fetchJSON(layerURL("OpenData/OpenData1/FeatureServer/20", "ParkName,RestroomType,Status,OpenToPublic")),
      fetchJSON(layerURL("OpenData/OpenData1/FeatureServer/18", "Name,Address,GardenType,Status")),
      fetchJSON(layerURL("OpenData/OpenData2/FeatureServer/7", "Name,Address2,Placement")) ]);
    const ok = f => f.geometry && f.geometry.coordinates && Math.abs(f.geometry.coordinates[0]+80.24) < 0.1 && Math.abs(f.geometry.coordinates[1]-43.535) < 0.07;
    const keepFac = new Set(["LIBRARY","COMMUNITY CENTRE","SENIORS CENTRE","ARENA","MUSEUM","ARTS"]);
    D.pts.school = sc.features.filter(f => ok(f) && /active/i.test(f.properties.STATUS||"ACTIVE")).map(f => cityPoint(f, titleCase(f.properties.NAME), titleCase(f.properties.ADDRESS), [titleCase(f.properties.TYPE), f.properties.BOARD]));
    D.pts.facility = fa.features.filter(f => ok(f) && keepFac.has(f.properties.CATEGORY)).map(f => cityPoint(f, titleCase(f.properties.NAME), titleCase(f.properties.ADDRESS), titleCase(f.properties.CATEGORY)));
    D.pts.restroom = rr.features.filter(f => ok(f) && !/no/i.test(f.properties.OpenToPublic||"") && !/removed|closed/i.test(f.properties.Status||"")).map(f => cityPoint(f, titleCase(f.properties.ParkName), "", /PERMANENT/.test(f.properties.RestroomType||"")? "Permanent" : "Portable"));
    D.pts.garden = gd.features.filter(f => ok(f) && !/removed|closed/i.test(f.properties.Status||"")).map(f => cityPoint(f, titleCase(f.properties.Name), titleCase(f.properties.Address), titleCase(f.properties.GardenType)));
    D.pts.aed = ae.features.filter(ok).map(f => cityPoint(f, (f.properties.Name||"AED").trim(), titleCase(f.properties.Address2), (f.properties.Placement||"").trim()));
    setStatus("city", "ok", "", `${D.pts.school.length} schools, ${D.pts.facility.length} facilities, ${D.pts.restroom.length} restrooms, ${D.pts.garden.length} gardens, ${D.pts.aed.length} AEDs`);
    base.draw();
  } catch(e){ setStatus("city", "bad", "", "Using the saved copy (" + e.message + ")"); } }
function geoLines(fc){ const out=[]; for(const f of fc.features||[]){ const g=f.geometry; if(!g) continue; const parts = g.type==="LineString"? [g.coordinates] : g.type==="MultiLineString"? g.coordinates : [];
    for(const p of parts) out.push({xs:p.map(c=>mercX(c[0])), ys:p.map(c=>mercY(c[1])), props:f.properties||{}}); } return out; }
async function loadClosures(){
  try { const [a, d] = await Promise.all([fetchJSON(layerURL("External/RoadClosures/FeatureServer/0","*")), fetchJSON(layerURL("External/RoadClosures/FeatureServer/2","*")).catch(() => ({features:[]}))]);
    LV.closures = geoLines(a).map(l => ({...l, kind:"closed"})).concat(geoLines(d).map(l => ({...l, kind:"detour"})));
    setStatus("closures", "ok", "", `${(a.features||[]).length} active closure${(a.features||[]).length===1?"":"s"}, ${(d.features||[]).length} detour${(d.features||[]).length===1?"":"s"}`); base.draw();
  } catch(e){ setStatus("closures", "bad", "", "City service not responding right now"); } }
async function loadSnow(){
  setStatus("snow", "wait", "", "Loading sidewalk plow tracking…");
  try { const base_ = "AVL/Winter_AVL_Routes_Public/FeatureServer/2/query?where=1%3D1&outFields=TimeStamp&outSR=4326&geometryPrecision=6&resultRecordCount=5000&f=geojson&resultOffset=";
    let all=[], off=0; for(let k=0;k<4;k++){ const j = await fetchJSON(CITY_API + base_ + off); all = all.concat(j.features||[]); if(!j.properties?.exceededTransferLimit && (j.features||[]).length < 5000) break; off += 5000; }
    LV.snow = geoLines({features:all}).filter(l => l.props.TimeStamp);
    const newest = Math.max(...LV.snow.map(l => l.props.TimeStamp));
    setStatus("snow", "ok", "", `${LV.snow.length.toLocaleString()} sidewalk segments · last plow pass ${agoText(newest)}`); base.draw(); updateLegend();
  } catch(e){ setStatus("snow", "bad", "", "City service not responding right now"); } }
function agoText(ms){ const h=(Date.now()-ms)/3600000; return h<1? "under an hour ago" : h<48? Math.round(h)+" h ago" : Math.round(h/24)+" days ago"; }
const SNOW = [[12,"#85B24A","Under 12 h"],[24,"#00A6E5","12–24 h"],[72,"#E9A94E","1–3 days"],[1e9,"#9AA3A3","Over 3 days"]];
function snowNear(){ return; const el=$("snowNear"); if(!el || !LV.snow || !S.report) return; const i=S.report.i, x=D.amx[i], y=D.amy[i];
  const r = 150/40075016*Math.cos(43.54*Math.PI/180)**-1; let best=0;
  for(const l of LV.snow) for(let j=0;j<l.xs.length;j++){ const dx=l.xs[j]-x, dy=l.ys[j]-y; if(dx*dx+dy*dy < r*r){ if(l.props.TimeStamp>best) best=l.props.TimeStamp; break; } }
  el.hidden=false; el.innerHTML = best ? `Sidewalks within 150 m of this address were last plowed <b>${agoText(best)}</b>. Plow tracking is live during winter operations.` : "No tracked sidewalks within 150 m of this address."; }
function drawLive(ctx,X,Y,z){
  if(LV.show.snow && LV.snow && S.mode!=="census"){ const now=Date.now(); ctx.lineCap="round";
    for(const [h,col] of SNOW){ ctx.beginPath(); for(const l of LV.snow){ const age=(now-l.props.TimeStamp)/3600000; const band=SNOW.find(b => age < b[0]); if(band[1]!==col) continue; ctx.moveTo(X(l.xs[0]),Y(l.ys[0])); for(let j=1;j<l.xs.length;j++) ctx.lineTo(X(l.xs[j]),Y(l.ys[j])); }
      ctx.strokeStyle=col; ctx.lineWidth=Math.max(2, z-12.5); ctx.stroke(); } }
  if(LV.show.closures && LV.closures.length && S.mode!=="census"){ for(const kind of ["detour","closed"]){ ctx.beginPath(); for(const l of LV.closures){ if(l.kind!==kind) continue; ctx.moveTo(X(l.xs[0]),Y(l.ys[0])); for(let j=1;j<l.xs.length;j++) ctx.lineTo(X(l.xs[j]),Y(l.ys[j])); }
      ctx.lineCap="round"; ctx.strokeStyle="#fff"; ctx.lineWidth=9; ctx.stroke(); ctx.strokeStyle= kind==="closed"? "#D7263D" : "#E9A94E"; ctx.lineWidth=5; ctx.setLineDash(kind==="closed"? [] : [8,6]); ctx.stroke(); ctx.setLineDash([]); } }
}
