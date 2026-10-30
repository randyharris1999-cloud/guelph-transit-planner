"""Make the "Add to Home Screen" files: app icons, iPhone launch images and the web app manifest.
Run from the repo folder: python scripts/build_icons.py   (needs: pip install playwright; playwright install chromium)
Then run scripts/build_html.py so index.html links the launch images listed in icons/launch.json."""
import json, os
from playwright.sync_api import sync_playwright

here = os.path.dirname(os.path.abspath(__file__)); root = os.path.dirname(here)
out = os.path.join(root, "icons"); os.makedirs(out, exist_ok=True)

BLUE, GREEN, BG, INK, ACCENT_TEXT, MUTED = "#00A6E5", "#85B24A", "#F2F3EF", "#1C2A2D", "#0079A8", "#5D6A6C"
# the bus from icon.svg, drawn in a 64-unit box
BUS = ('<rect x="18" y="12" width="28" height="36" rx="6" fill="#fff"/><rect x="22" y="17" width="20" height="10" rx="2" fill="#00A6E5"/>'
       '<circle cx="25" cy="39" r="3" fill="#85B24A"/><circle cx="39" cy="39" r="3" fill="#85B24A"/>'
       '<rect x="21" y="48" width="5" height="5" rx="1.5" fill="#fff"/><rect x="38" y="48" width="5" height="5" rx="1.5" fill="#fff"/>')
def icon_svg(rounded, scale=1.0):
    corner = ' rx="14"' if rounded else ""
    t = f'translate(32 32.5) scale({scale}) translate(-32 -32.5)'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64"{corner} fill="{BLUE}"/><g transform="{t}">{BUS}</g></svg>'

# iPhones in portrait: CSS width, height and pixel ratio (launch images only show when the app is opened from the home screen)
PHONES = [(440, 956, 3), (430, 932, 3), (420, 912, 3), (428, 926, 3), (414, 896, 3), (414, 896, 2), (402, 874, 3),
          (393, 852, 3), (390, 844, 3), (375, 812, 3), (360, 780, 3), (375, 667, 2)]

def launch_html(w, h):
    # same layout as the loading screen in the app, so the hand-off is seamless
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;width:{w}px;height:{h}px;background:{BG};font-family:"Inter","Public Sans",system-ui,sans-serif}}
.s{{position:fixed;inset:0;display:flex;align-items:center;justify-content:center}}
.in{{display:flex;flex-direction:column;align-items:center;gap:14px;margin-top:-6vh}}
.in svg{{width:88px;height:88px;border-radius:20px;box-shadow:0 6px 18px rgba(6,48,63,.18)}}
h1{{font-weight:700;font-size:29px;letter-spacing:-.4px;line-height:1;margin:6px 0 0;color:{INK}}} h1 span{{color:{ACCENT_TEXT}}}
small{{position:absolute;bottom:18px;left:0;right:0;text-align:center;color:{MUTED};font-size:12px}}
</style></head><body><div class="s"><div class="in">{icon_svg(True)}<h1>Guelph <span>Transit Planner</span></h1></div>
<small>© 2026 Randy Harris</small></div></body></html>"""

with sync_playwright() as p:
    b = p.chromium.launch()
    def shoot(html, w, h, dpr, path, clear=False):
        pg = b.new_page(viewport={"width": w, "height": h}, device_scale_factor=dpr)
        pg.set_content(html); pg.wait_for_timeout(150); pg.screenshot(path=path, omit_background=clear); pg.close()
    page = lambda svg, n: f'<!doctype html><html><body style="margin:0;background:transparent">{svg.replace("<svg ", f"<svg width=\"{n}\" height=\"{n}\" ", 1)}</body></html>'
    shoot(page(icon_svg(True), 192), 192, 192, 1, os.path.join(out, "icon-192.png"), clear=True)
    shoot(page(icon_svg(True), 512), 512, 512, 1, os.path.join(out, "icon-512.png"), clear=True)
    shoot(page(icon_svg(False, 0.85), 512), 512, 512, 1, os.path.join(out, "icon-maskable-512.png"))   # Android crops these to a circle or squircle
    shoot(page(icon_svg(False), 180), 180, 180, 1, os.path.join(out, "apple-touch-icon.png"))         # iOS rounds the corners itself
    launch = []
    for w, h, dpr in PHONES:
        f = f"launch-{w * dpr}x{h * dpr}.png"
        shoot(launch_html(w, h), w, h, dpr, os.path.join(out, f))
        launch.append({"file": f, "w": w, "h": h, "dpr": dpr})
    b.close()
json.dump(launch, open(os.path.join(out, "launch.json"), "w"), indent=1)

manifest = {
    "id": "./", "name": "Guelph Transit Planner", "short_name": "Guelph Transit",
    "description": "Plan a bus trip, look up any route or stop, and watch Guelph Transit's buses move.",
    "start_url": "./", "scope": "./", "display": "standalone",
    "background_color": BG, "theme_color": BLUE,
    "icons": [
        {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any"},
        {"src": "icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"},
        {"src": "icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any"}]}
json.dump(manifest, open(os.path.join(root, "manifest.webmanifest"), "w", encoding="utf-8"), indent=2, ensure_ascii=False)
print("icons:", len(os.listdir(out)), "files")
