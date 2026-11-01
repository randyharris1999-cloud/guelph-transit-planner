/* ---------- day, sunset and night looks ----------
   The look follows the sun over Guelph: Day, then Sunset from 20 minutes before sundown until the end of
   civil twilight (sun 6° below the horizon), then Night. Sunrise mirrors it (Sunset look from first light until
   20 minutes after sunrise). The header chip shows the next change; tapping it cycles Auto → Day → Night.
   ?sky=day|dusk|night forces one look for testing (not remembered). */
const SKY = (() => {
  const LAT = 43.5448, LON = -80.2482, RAD = Math.PI/180, GLOW = 20*60000;
  const META = {light:"#F4F6F9", dusk:"#1A2033", dark:"#0B0E14"};
  // sunrise equation (NOAA / Meeus approximation): sun crossing altitude h0 (degrees) on the day containing ms
  function cross(ms, h0){
    const n = Math.round(ms/864e5 + 2440587.5 - 2451545 - 0.0009 + LON/360), Js = 0.0009 + n - LON/360;
    const M = (357.5291 + 0.98560028*Js) % 360, Mr = M*RAD;
    const C = 1.9148*Math.sin(Mr) + 0.02*Math.sin(2*Mr) + 0.0003*Math.sin(3*Mr);
    const lam = ((M + C + 282.9372) % 360) * RAD;
    const Jt = 2451545 + Js + 0.0053*Math.sin(Mr) - 0.0069*Math.sin(2*lam);
    const dec = Math.asin(Math.sin(lam)*Math.sin(23.4397*RAD)), phi = LAT*RAD;
    const cw = (Math.sin(h0*RAD) - Math.sin(phi)*Math.sin(dec)) / (Math.cos(phi)*Math.cos(dec));
    const w = Math.acos(Math.max(-1, Math.min(1, cw))) / RAD;
    const toMs = J => (J - 2440587.5) * 864e5;
    return [toMs(Jt - w/360), toMs(Jt + w/360)]; }
  function times(now){ const noon = new Date(now); noon.setHours(12,0,0,0); const t = noon.getTime();
    const [rise, set] = cross(t, -0.833), [dawn, dusk] = cross(t, -6);
    return {rise, set, dawn, dusk}; }
  function phase(now){ const T = times(now);
    if(now < T.dawn || now >= T.dusk) return "dark";
    if(now < T.rise + GLOW || now >= T.set - GLOW) return "dusk";
    return "light"; }
  const hm = ms => new Date(ms).toLocaleTimeString("en-CA", {hour:"numeric", minute:"2-digit"}).replace(/\s?([ap])\.?m\.?/i, " $1m");
  let pref = "auto"; try { pref = localStorage.getItem("gtp-sky") || "auto"; } catch(e){}
  const forced = new URLSearchParams(location.search).get("sky");
  const subs = []; let cur = null;
  function label(now, th){ const T = times(now), tom = times(now + 864e5);
    if(pref !== "auto" && !forced) return th==="dark" ? ["Night mode", "Tap for auto"] : ["Day mode", "Tap for night"];
    if(th === "light") return ["Day", "Sunset " + hm(T.set)];
    if(th === "dusk") return now < T.rise + GLOW ? ["Sunrise", hm(T.rise)] : ["Sunset", "Night at " + hm(T.dusk)];
    return ["Night", "Sunrise " + hm(now >= T.dusk ? tom.rise : T.rise)]; }
  function apply(){
    const now = Date.now();
    const th = forced==="day" ? "light" : forced==="dusk" ? "dusk" : forced==="night" ? "dark"
             : pref==="day" ? "light" : pref==="night" ? "dark" : phase(now);
    const changed = th !== cur; cur = th;
    document.documentElement.dataset.theme = th;
    const m = document.querySelector('meta[name="theme-color"]'); if(m) m.content = META[th];
    const b = document.getElementById("skyBtn");
    if(b){ const [a, s] = label(now, th); b.dataset.sky = th;
      b.querySelector("b").textContent = a; b.querySelector("small").textContent = s;
      b.setAttribute("aria-label", `${a}, ${s}. Look: ${pref==="auto" ? "follows the sun" : pref}. Tap to change.`); }
    if(changed) subs.forEach(f => { try { f(th); } catch(e){} });
  }
  function cycle(){ pref = pref==="auto" ? "day" : pref==="day" ? "night" : "auto";
    try { localStorage.setItem("gtp-sky", pref); } catch(e){}
    document.documentElement.classList.add("sky-fade"); apply();
    setTimeout(() => document.documentElement.classList.remove("sky-fade"), 900); }
  apply();
  document.addEventListener("DOMContentLoaded", apply);
  setInterval(() => { const was = cur; if(!forced && pref==="auto"){ const html = document.documentElement;
    html.classList.add("sky-fade"); apply(); setTimeout(() => html.classList.remove("sky-fade"), 900); } else apply(); }, 30000);
  document.addEventListener("visibilitychange", () => { if(!document.hidden) apply(); });
  return { dark: () => cur !== "light", now: () => cur, onChange: f => subs.push(f), cycle, apply, times };
})();
const isDark = () => SKY.dark();
