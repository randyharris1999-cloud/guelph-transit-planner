"""Assemble index.html from src/ (run from the repo folder: python scripts/build_html.py)."""
import glob, os
here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
parts = sorted(glob.glob(os.path.join(root, "src", "*")))
css = open(os.path.join(root, "src", "leaflet.min.css")).read() if os.path.exists(os.path.join(root, "src", "leaflet.min.css")) else ""
body = "".join(open(p, encoding="utf-8").read() + "\n" for p in parts if p.endswith((".html", ".js")))
body = body.replace("/*LEAFLET_CSS*/", css)
tag = '<script src="leaflet.min.js"></script>'
assert tag in body
body = body.replace(tag, '<script src="gtfsrt.js"></script>\n<script src="config.js"></script>\n' + tag)
html = ('<!doctype html>\n<!-- Guelph Transit Planner. © 2026 Randy Harris. All rights reserved. Not open source: no copying, modification or redistribution without written permission. -->\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">\n'
        '<meta name="theme-color" content="#00A6E5"><link rel="icon" href="icon.svg" type="image/svg+xml">\n'
        '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:16px system-ui}img{max-width:100%}[hidden]{display:none!important}</style>\n</head><body>\n'
        + body + "</script>\n</body></html>\n")
open(os.path.join(root, "index.html"), "w", encoding="utf-8").write(html)
print("index.html", len(html), "bytes")
