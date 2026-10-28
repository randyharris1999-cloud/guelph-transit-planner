/* ---------- preview mode ----------
   ?preview=1 replays the saved Guelph Transit snapshot in data/realtime/ and sets the app's clock to the
   moment it was saved (Fri Oct 23 2026, 11:47am), so the buses, predictions and alerts line up. It's for
   testing the page away from the live feed; normal visits always use the live relay. */
const PREVIEW = new URLSearchParams(location.search).has("preview");
if(PREVIEW){
  const RealDate = Date, OFF = new RealDate("2026-10-23T11:47:20-04:00").getTime() - RealDate.now();
  class PreviewDate extends RealDate { constructor(...a){ super(...(a.length ? a : [RealDate.now() + OFF])); } static now(){ return RealDate.now() + OFF; } }
  window.Date = PreviewDate;
}
