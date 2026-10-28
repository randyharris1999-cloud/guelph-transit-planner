"""Hills for Guelph Transit Planner, from the Ontario LIDAR ground model (DTM).

Input:  an elevation grid in Web Mercator (EPSG:3857), float32 GeoTIFF, made in QGIS from the
        798 one-km LIDAR tiles (see README: "Rebuilding the hills").
Output: data/elev.json   walking cost and climb for every edge of the walking network, each direction
        data/hillshade.jpg  soft shaded relief for the map (128 = flat, darker = shadow, lighter = sunlit)

Walking speed on a slope follows Tobler's hiking function, scaled so flat ground stays 4.8 km/h:
uphill is slower, a gentle downhill is a little faster (capped at +10 %), steep downhill is slower again.
Bridges: the ground model has no bridge decks, so a walk over a river or a road overpass would dip into
the valley. Dips narrower than about 80 m are filled before slopes are measured.

Run from the repo folder:  python scripts/build_elev.py path/to/guelph_dem_3857.tif
"""
import json, math, sys, os
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
R = 6378137.0
mx = lambda lon: np.radians(lon) * R
my = lambda lat: R * np.log(np.tan(np.pi / 4 + np.radians(lat) / 2))

def read_dem(path):
    im = Image.open(path)
    a = np.array(im, dtype=np.float32)
    tags = im.tag_v2
    scale = tags.get(33550); tie = tags.get(33922)           # ModelPixelScale, ModelTiepoint
    nod = tags.get(42113)                                     # GDAL_NODATA
    if nod is not None:
        a[a == float(nod)] = np.nan
    a[(a < 100) | (a > 600)] = np.nan                         # Guelph ground is ~280-370 m
    x0, y0, sx, sy = tie[3], tie[4], scale[0], scale[1]
    return a, x0, y0, sx, sy

def main(dem_path):
    dem, X0, Y0, SX, SY = read_dem(dem_path)
    H, W = dem.shape
    print("DEM", W, "x", H, "px of", SX, "m; elevation", np.nanmin(dem), "-", np.nanmax(dem))
    fill = np.where(np.isnan(dem), np.nanmedian(dem), dem)

    def sample(x, y):                                          # bilinear, x/y in EPSG:3857
        c = (x - X0) / SX - 0.5; r = (Y0 - y) / SY - 0.5
        c0 = np.clip(np.floor(c).astype(int), 0, W - 2); r0 = np.clip(np.floor(r).astype(int), 0, H - 2)
        fc = np.clip(c - c0, 0, 1); fr = np.clip(r - r0, 0, 1)
        v = (fill[r0, c0] * (1 - fc) * (1 - fr) + fill[r0, c0 + 1] * fc * (1 - fr) +
             fill[r0 + 1, c0] * (1 - fc) * fr + fill[r0 + 1, c0 + 1] * fc * fr)
        return v

    g = json.load(open(os.path.join(ROOT, "data", "graph.json")))
    nodes = np.array(g["nodes"], dtype=np.float64).reshape(-1, 2) / 1e5
    E = len(g["edges"]) // 4
    def tobler(s):
        r = np.exp(-3.5 * (np.abs(s + 0.05) - 0.05))
        return np.minimum(r, 1.10)
    cab = np.zeros(E); cba = np.zeros(E); up = np.zeros(E); dn = np.zeros(E)
    STEP = 5.0
    for e in range(E):
        a, b, L = g["edges"][4 * e], g["edges"][4 * e + 1], g["edges"][4 * e + 2]
        pts = [nodes[a]] + [np.array(g["geom"][e][j:j + 2]) / 1e5 for j in range(0, len(g["geom"][e]), 2)] + [nodes[b]]
        pts = np.array(pts)
        px, py = mx(pts[:, 0]), my(pts[:, 1])
        k = np.cos(np.radians(pts[:, 1].mean()))               # mercator metres -> ground metres
        seg = np.hypot(np.diff(px), np.diff(py)) * k
        cum = np.concatenate([[0], np.cumsum(seg)]); tot = cum[-1]
        if tot < 1 or L <= 0:
            cab[e] = cba[e] = L; continue
        n = max(2, int(math.ceil(tot / STEP)) + 1)
        s = np.linspace(0, tot, n)
        z = sample(np.interp(s, cum, px), np.interp(s, cum, py))
        # fill bridge-sized dips (closing over +/-40 m), then smooth over ~10 m
        w = max(1, int(40 / (tot / (n - 1))))
        if n > 2:
            zl = np.array([z[max(0, i - w):i + 1].max() for i in range(n)])
            zr = np.array([z[i:i + w + 1].max() for i in range(n)])
            z = np.maximum(z, np.minimum(zl, zr))
            if n >= 3:
                zz = np.convolve(np.pad(z, 1, mode="edge"), np.ones(3) / 3, mode="valid"); z = zz
        dz = np.diff(z); ds = np.diff(s)
        slope = np.clip(dz / np.maximum(ds, 0.5), -0.35, 0.35)
        f_ab = (ds / tobler(slope)).sum() / ds.sum()
        f_ba = (ds / tobler(-slope)).sum() / ds.sum()
        cab[e] = L * f_ab; cba[e] = L * f_ba
        up[e] = dz[dz > 0].sum(); dn[e] = -dz[dz < 0].sum()
    print("edges", E, "mean cost factor", round((cab + cba).sum() / (2 * sum(g["edges"][4 * e + 2] for e in range(E))), 3),
          "total climb km", round(up.sum() / 1000, 1))

    # node elevations (dm), for the walk area and debugging
    nz = sample(mx(nodes[:, 0]), my(nodes[:, 1]))

    # hillshade, z-factor 2 so Guelph's gentle relief reads; 128 = flat
    k = math.cos(math.radians(43.53))
    gy, gx = np.gradient(fill, SY * k, SX * k)
    az, alt = math.radians(315), math.radians(45)
    zf = 2.0
    slope = np.arctan(zf * np.hypot(gx, gy)); aspect = np.arctan2(-gx, gy)
    hs = np.sin(alt) * np.cos(slope) + np.cos(alt) * np.sin(slope) * np.cos(az - aspect - math.pi / 2)
    flat = math.sin(alt)
    enc = np.clip(128 + (hs - flat) * 300, 0, 255)
    enc[np.isnan(dem)] = 128
    img = Image.fromarray(enc.astype(np.uint8), "L")
    OUTW = 1800
    if W > OUTW: img = img.resize((OUTW, round(H * OUTW / W)), Image.LANCZOS)
    img.save(os.path.join(ROOT, "data", "hillshade.jpg"), quality=82, optimize=True, progressive=True)   # smooth shading compresses well as JPEG
    lon = lambda x: math.degrees(x / R); lat = lambda y: math.degrees(2 * math.atan(math.exp(y / R)) - math.pi / 2)
    bounds = [lon(X0), lat(Y0 - SY * H), lon(X0 + SX * W), lat(Y0)]   # west, south, east, north

    out = {"source": "Ontario LIDAR-derived DTM (0.5 m), resampled", "hillshade": {"file": "data/hillshade.jpg", "bounds": [round(v, 6) for v in bounds]},
           "cab": [int(round(v * 10)) for v in cab], "cba": [int(round(v * 10)) for v in cba],   # walking cost, decimetres of flat walking
           "up": [int(round(v * 10)) for v in up], "dn": [int(round(v * 10)) for v in dn],       # climb a->b, descent a->b, decimetres
           "nz": [int(round(v * 10)) for v in nz]}                                               # node elevation, decimetres
    json.dump(out, open(os.path.join(ROOT, "data", "elev.json"), "w"), separators=(",", ":"))
    print("wrote data/elev.json", os.path.getsize(os.path.join(ROOT, "data", "elev.json")) // 1024, "KB; hillshade.jpg",
          os.path.getsize(os.path.join(ROOT, "data", "hillshade.jpg")) // 1024, "KB", img.size, bounds)

if __name__ == "__main__":
    main(sys.argv[1])
