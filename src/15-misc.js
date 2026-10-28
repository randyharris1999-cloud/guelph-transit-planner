function bandsFor(lim){ return TBANDS.filter(b => b[0] < lim).map(([lo,hi,c]) => [lo, Math.min(hi,lim), c]); }
function snowLegend(){ if(typeof LV==="undefined" || !LV.show.snow || !LV.snow || S.mode==="census") return ""; return `<b style="margin-top:8px">Sidewalk last plowed</b><div class="sw">${SNOW.map(([h,c,l]) => `<i style="background:${c}"></i><span>${l}</span>`).join("")}</div>`; }
function esc(s){ return String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c])); }
function unmerc(x,y){ const lon=x*360-180; const n=Math.PI-2*Math.PI*y; return [180/Math.PI*Math.atan(.5*(Math.exp(n)-Math.exp(-n))), lon]; }
