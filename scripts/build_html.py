"""Assemble index.html from src/ (run from the repo folder: python scripts/build_html.py)."""
import glob, os
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
parts = sorted(glob.glob(os.path.join(root, "src", "*")))
css = open(os.path.join(root, "src", "leaflet.min.css")).read() if os.path.exists(os.path.join(root, "src", "leaflet.min.css")) else ""
body = "".join(open(p, encoding="utf-8").read() + "\n" for p in parts if p.endswith((".html", ".js")))
body = body.replace("/*LEAFLET_CSS*/", css)
# real file sizes for the loading screen's progress bar
import json
sizes = {n: os.path.getsize(os.path.join(root, "data", n + ".json")) for n in
         ["graph","places","addresses","trees","transit","buildings","water","streetnames","elev"] if os.path.exists(os.path.join(root, "data", n + ".json"))}
assert "/*DATA_BYTES*/{}" in body
body = body.replace("/*DATA_BYTES*/{}", json.dumps(sizes, separators=(",", ":")))
# "Add to Home Screen": manifest, icons and iPhone launch images (made by scripts/build_icons.py)
pwa = ('<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="icons/apple-touch-icon.png">\n'
       '<meta name="mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-capable" content="yes">\n'
       '<meta name="apple-mobile-web-app-title" content="Guelph Transit"><meta name="apple-mobile-web-app-status-bar-style" content="default">\n')
launch = os.path.join(root, "icons", "launch.json")
if os.path.exists(launch):
    for L_ in json.load(open(launch)):
        pwa += (f'<link rel="apple-touch-startup-image" href="icons/{L_["file"]}" media="(device-width: {L_["w"]}px) and (device-height: {L_["h"]}px) '
                f'and (-webkit-device-pixel-ratio: {L_["dpr"]}) and (orientation: portrait)">\n')
tag = '<script src="leaflet.min.js"></script>'
assert tag in body
body = body.replace(tag, '<script src="gtfsrt.js"></script>\n<script src="config.js"></script>\n' + tag)
html = ('<!doctype html>\n<!-- Guelph Transit Planner. © 2026 Randy Harris. All rights reserved. Not open source: no copying, modification or redistribution without written permission. -->\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="theme-color" content="#00A6E5"><link rel="icon" href="icon.svg" type="image/svg+xml">\n' + pwa +
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:16px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n</head><body>\n'
        + body + "</script>\n</body></html>\n")
open(os.path.join(root, "index.html"), "w", encoding="utf-8").write(html)
print("index.html", len(html), "bytes")
