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
- Optional live City layers: road closures and sidewalk snow clearing.

Links can be shared: `?from=51 Cork Street West&to=435 Stone Road West`, `?tab=routes&route=99`, `?tab=stops&stop=6068`, `?from=stop 6068&to=43.53,-80.23`.


## What's in the folder

| Path | What it is |
|---|---|
| `index.html` | The app, built from `src/` |
| `config.js` | Live-data setting: the relay address |
| `gtfsrt.js` | Reads Guelph Transit's GTFS-realtime feed format in the browser |
| `leaflet.min.js` | Leaflet 1.9.4 map library |
| `icon.svg` | Browser tab icon |
| `data/` | Walking network, addresses, places, buildings, water, street names, trees and the bus schedule (same files as 15-Minute Guelph) |
| `data/realtime/` | Saved feed snapshot used only by preview mode |
| `src/` | App source in numbered parts (styles, layout, map, planner, live buses) |
| `scripts/build_html.py` | Joins `src/` into `index.html` |


## How trips are found

Walking follows Guelph's streets, sidewalks and trails at 4.8 km/h, up to 15 minutes to or from a bus. Bus legs use a connection scan over the full Guelph Transit timetable, with walking transfers between nearby stops. A trip leaves you a minute to spare at the first stop. Options are kept only if they beat walking and aren't beaten by another option that leaves later and arrives as early.

## Data

| Data | Source | Updates |
|---|---|---|
| Addresses, buildings, streets, trails, parks, trees, watercourses | City of Guelph Open Data | At build time |
| Schools, facilities, restrooms, community gardens, AEDs | City of Guelph map server | Live on every visit |
| Road closures, sidewalk snow clearing | City of Guelph map server | Live |
| Bus schedule | Guelph Transit GTFS (fall 2026) | At build time |
| Bus positions, predictions, alerts | Guelph Transit GTFS-realtime, through the Cloudflare relay | Live, every 15 to 120 s |
| Restaurants, cafés, groceries, pharmacies, clinics, playgrounds | © OpenStreetMap contributors (ODbL) | At build time |

Live times use the visitor's clock and assume Ontario time.

An independent project built on City of Guelph open data. Not an official City of Guelph or Guelph Transit service. Created by Randy Harris.
