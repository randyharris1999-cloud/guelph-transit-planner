# Guelph Transit Planner

Plan a bus trip, look up any route or stop, and watch Guelph Transit's buses move, all on a map drawn from City of Guelph open data.

## What it does

**Plan**
- Start and destination: type an address, a place (library, park, restaurant, grocery store, clinic…), or a stop number, use your location, or just tap the map: once for the start, once for the destination. Drag either pin to fine-tune it. The pin button in the destination box lets you re-pick the destination on the map.
- Leave now (with live arrival predictions) or leave at a chosen day and time.
- Up to three trip options plus walking, with step-by-step legs, the stops on each ride, transfers, and live delays.
- Tap any step of a trip (a walk, a ride, a transfer, or the arrival) to zoom the map to that part and highlight it. Tap it again to see the whole trip.
- A 10-minute walk area around the start, coloured by walking time (0–5 and 5–10 minutes) the same way as 15-Minute Guelph, with the next buses from every stop in it.

**Routes**
- Every route as a colour-coded number, with a count of its buses on the road right now.
- Pick one to see each direction, how often it runs right now, first and last bus, its stops in order with the next bus at each, live buses on it, and its service alerts.

**Stops**
- Search by stop number or name, see stops near you or the map centre, or tap any stop on the map.
- Next buses in the next 90 minutes with live delays, routes serving the stop, alerts, and "Trip from here / to here."

**Map**
- The 15-Minute Guelph basemap: building footprints, rivers and creeks, parks, trails, street trees and street names, all drawn from City data (no tile server).
- Live buses from 15-Minute Guelph: route-coloured, animated along their routes between GPS updates, updated every 15 seconds. Tap a bus to see its next stops.
- All routes are drawn faded. A route only stands out when it's part of the trip you planned, or the stop, bus or route you selected.
- Place layers you can switch on and off along the top: food and drink, groceries, pharmacies, clinics and hospitals, libraries and rec centres, schools, playgrounds, restrooms, community gardens and AEDs. Tap one for its closest bus stops and "Go here."
- Hills: soft shaded relief from the LIDAR ground model, on by default (the Hills chip turns it off). It fades as you zoom in close.
- Optional live City layers: road closures and sidewalk snow clearing.

**Opening and installing**
- The map opens on downtown at street scale.
- While the map and bus schedule download (about 12 MB), a loading screen shows the app's name and a progress bar. It disappears the moment the data is ready, and offers "Try again" if the download fails.
- Add it to your phone's home screen to use it like an app: in Safari, Share → Add to Home Screen; in Chrome on Android, ⋮ → Add to Home screen (or Install app). It then opens full screen with its own icon and a launch screen.

The start and destination boxes are empty every time the page opens. Links can still be shared by adding them: `?from=51 Cork Street West&to=435 Stone Road West`, `?tab=routes&route=99`, `?tab=stops&stop=6068`, `?from=stop 6068&to=43.53,-80.23`.

## What's in the folder

| Path | What it is |
|---|---|
| `index.html` | The app, built from `src/` |
| `config.js` | Live-data setting: the relay address |
| `gtfsrt.js` | Reads Guelph Transit's GTFS-realtime feed format in the browser |
| `leaflet.min.js` | Leaflet 1.9.4 map library |
| `icon.svg` | Browser tab icon |
| `manifest.webmanifest` | Home-screen app settings: name, colours, icons |
| `icons/` | App icons and iPhone launch images, made by `scripts/build_icons.py` |
| `data/` | Walking network, addresses, places, buildings, water, street names, trees and the bus schedule (same files as 15-Minute Guelph) |
| `data/elev.json`, `data/hillshade.jpg` | Hills from LIDAR: walking cost and climb for every path, each direction, and the shaded relief image |
| `data/realtime/` | Saved feed snapshot used only by preview mode |
| `src/` | App source in numbered parts (styles, layout, map, planner, live buses) |
| `scripts/build_html.py` | Joins `src/` into `index.html`, adds the home-screen tags and the data sizes for the progress bar |
| `scripts/build_icons.py` | Makes `icons/` and `manifest.webmanifest` (needs Playwright) |
| `scripts/build_elev.py` | Builds the hill files from the LIDAR elevation grid |

## Editing

Change files in `src/`, then run `python scripts/build_html.py` from this folder to rebuild `index.html`. Run it again after updating anything in `data/`, so the loading bar knows the new file sizes. Only rerun `scripts/build_icons.py` if you change the icon or the app's name. Parts of the code are shared with 15-Minute Guelph: the basemap (`src/25-basemap.js`), labels (`src/30-labels.js`) and live buses (`src/50-live.js`).

## Updating the data

The files in `data/` come from the 15-Minute Guelph build pipeline (its `scripts/` folder). When Guelph Transit publishes a new schedule (usually September and January), rebuild 15-Minute Guelph's data and copy these files here: `graph.json`, `places.json`, `addresses.json`, `trees.json`, `transit.json`, `buildings.json`, `water.json`, `streetnames.json`.

## Rebuilding the hills

The hills come from 256 one-km LIDAR tiles (0.5 m ground model, UTM zone 17N) covering Guelph plus a 1 km margin: tiles 553–568 km east, 4812–4827 km north. In the QGIS Python console:

```python
import glob
from osgeo import gdal
src = r"C:\Users\randy\Documents\City of Guelph Data\LIDAR\*.img"
out = r"C:\Users\randy\Documents\City of Guelph Data\LIDAR_derived\\"
gdal.BuildVRT(out + "guelph_lidar.vrt", sorted(glob.glob(src)))
gdal.Translate(out + "guelph_dem_4m_utm17.tif", out + "guelph_lidar.vrt", xRes=4, yRes=4, resampleAlg="average")
gdal.Warp(out + "guelph_dem_6m_3857.tif", out + "guelph_dem_4m_utm17.tif", srcSRS="EPSG:26917", dstSRS="EPSG:3857",
          xRes=6, yRes=6, outputBounds=(-8942456, 5383693, -8921966, 5402528), resampleAlg="bilinear", dstNodata=-9999)
```

Shrink in UTM first and reproject the small grid second. Warping the 0.5 m tiles straight to Web Mercator with averaging left false east–west steps of up to 40 m in the result.

Then, from this folder: `python scripts/build_elev.py "path/to/guelph_dem_6m_3857.tif"`. The ground model has no bridge decks, so the script fills dips under about 80 m wide before measuring slopes. Otherwise every river crossing would look like a valley.

## How trips are found

Walking follows Guelph's streets, sidewalks and trails at 4.8 km/h on flat ground, adjusted for hills: uphill is slower and a gentle downhill slightly faster (Tobler's hiking function, with the downhill gain capped at 10%). Walking steps show the climb when a walk goes up or down 5 m or more. Walks to or from a bus can be up to 15 minutes. Bus legs use a connection scan over the full Guelph Transit timetable, with walking transfers between nearby stops. A trip leaves you a minute to spare at the first stop. Options are kept only if they beat walking and aren't beaten by another option that leaves later and arrives as early.

## Data

| Data | Source | Updates |
|---|---|---|
| Addresses, buildings, streets, trails, parks, trees, watercourses | City of Guelph Open Data | At build time |
| Schools, facilities, restrooms, community gardens, AEDs | City of Guelph map server | Live on every visit |
| Road closures, sidewalk snow clearing | City of Guelph map server | Live |
| Bus schedule | Guelph Transit GTFS (fall 2026) | At build time |
| Bus positions, predictions, alerts | Guelph Transit GTFS-realtime, through the Cloudflare relay | Live, every 15 to 120 s |
| Restaurants, cafés, groceries, pharmacies, clinics, playgrounds | © OpenStreetMap contributors (ODbL) | At build time |
| Ground elevation (hills) | Ontario Digital Terrain Model (LIDAR-derived), 0.5 m tiles, Ontario Ministry of Natural Resources | At build time |

Live times use the visitor's clock and assume Ontario time.

An independent project built on City of Guelph open data. Not an official City of Guelph or Guelph Transit service.

## Copyright

© 2026 Randy Harris. All rights reserved.

The code, design and layout of this app are not open source. You're welcome to use the app and to view this repository on GitHub, but you may not copy, modify, redistribute or republish the code or design, in whole or in part, without written permission. See [LICENSE](LICENSE).

The data the app displays stays under its own licences: City of Guelph Open Government Licence, Guelph Transit GTFS terms, OpenStreetMap (ODbL), and Ontario's Open Government Licence for the elevation model.
