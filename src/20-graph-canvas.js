// Walking search. Costs are metres of flat walking: with hills loaded (D.cAB / D.cBA) uphill costs more
// than downhill, so direction matters. reverse=true finds the cost of walking TO the seeds (for the walk
// from the last bus stop to the destination).
function dijkstra(seeds, limit = Infinity, reverse = false){
  const N = D.N, dist = new Float64Array(N).fill(Infinity), pred = new Int32Array(N).fill(-1), h = new Heap();
  const cAB = D.cAB || D.el, cBA = D.cBA || D.el;
  for(const [n,d] of seeds) if(d < dist[n]){ dist[n]=d; pred[n]=-1; h.push(d,n); }
  while(h.size){ const u = h.pop(), du = h.lastKey; if(du > dist[u] || du > limit) continue;
    for(let j=D.off[u]; j<D.off[u+1]; j++){ const v=D.adjN[j], e=D.adjE[j], fwd = (D.ea[e]===u) !== reverse;
      const nd = du + (fwd ? cAB[e] : cBA[e]); if(nd < dist[v]){ dist[v]=nd; pred[v]=e; h.push(nd,v); } } }
  return {dist, pred, reverse};
}
// real length, climb and descent along a search tree's path to `node`, in the direction actually walked
function treeStats(tree, node){ let u=node, len=0, up=0, dn=0, guard=0;
  while(guard++<20000){ const e=tree.pred[u]; if(e<0) break; const from = D.ea[e]===u ? D.eb[e] : D.ea[e];
    len += D.el[e];
    if(D.eup){ const walkedAB = tree.reverse ? (u===D.ea[e]) : (from===D.ea[e]);   // forward tree walks from -> u, reverse walks u -> from
      up += walkedAB ? D.eup[e] : D.edn[e]; dn += walkedAB ? D.edn[e] : D.eup[e]; }
    u=from; }
  return {len, up, dn}; }
const MapCanvas = L.Layer.extend({
  onAdd(m){ this._m=m; const c=this._c=L.DomUtil.create("canvas","leaflet-zoom-animated"); m.getPane("overlayPane").appendChild(c);
    m.on("moveend zoomend resize viewreset", this._reset, this); m.on("zoomanim", this._anim, this); this._reset(); },
  onRemove(m){ L.DomUtil.remove(this._c); m.off("moveend zoomend resize viewreset", this._reset, this); m.off("zoomanim", this._anim, this); },
  _anim(e){ const m=this._m, scale=m.getZoomScale(e.zoom, this._zoom), p=.3,
      viewHalf=m.getSize().multiplyBy(.5+p), cur=m.project(this._center, e.zoom),
      off=viewHalf.multiplyBy(-scale).add(cur).subtract(m._getNewPixelOrigin(e.center, e.zoom));
    L.DomUtil.setTransform(this._c, off, scale); },
  _reset(){ const m=this._m, p=.3, size=m.getSize(), min=m.containerPointToLayerPoint(size.multiplyBy(-p)).round(), s=size.multiplyBy(1+2*p).round();
    this._center=m.getCenter(); this._zoom=m.getZoom(); this._min=min; this._size=s;
    const dpr=window.devicePixelRatio||1, c=this._c; L.DomUtil.setPosition(c,min);
    c.width=s.x*dpr; c.height=s.y*dpr; c.style.width=s.x+"px"; c.style.height=s.y+"px"; this.draw(); },
  draw(){ if(!this._m || !D.N) return; const m=this._m, c=this._c, ctx=c.getContext("2d"), dpr=window.devicePixelRatio||1;
    const z=this._zoom, W=256*Math.pow(2,z), org=m.getPixelOrigin().add(this._min);
    const X = mx => mx*W - org.x, Y = my => my*W - org.y;
    ctx.setTransform(dpr,0,0,dpr,0,0); ctx.clearRect(0,0,this._size.x,this._size.y);
    drawAll(ctx, X, Y, z, this._size);
  },
});

function strokeEdge(ctx,X,Y,e){ const k0=D.eoff[e], k1=D.eoff[e+1]; ctx.moveTo(X(D.gx[k0]),Y(D.gy[k0])); for(let k=k0+1;k<k1;k++) ctx.lineTo(X(D.gx[k]),Y(D.gy[k])); }
