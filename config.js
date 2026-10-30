// Guelph Transit Planner. © 2026 Randy Harris. All rights reserved.
// Guelph Transit Planner settings
// relay: the Cloudflare Worker that passes Guelph Transit's live feeds to the browser
// (endpoints /vehicles, /tripupdates, /alerts). It's the same Worker the Trip Planner and 15-Minute Guelph use.
// It only answers pages on randyharris1999-cloud.github.io and http://localhost:8000.
window.GUELPH_LIVE = {
  relay: "https://guelph-trip-planner.randyharris1999.workers.dev"
};
