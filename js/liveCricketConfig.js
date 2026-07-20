// BAILS — LIVE CRICKET (EXTERNAL DATA) CONFIG
//
// This powers the "Live Cricket" section — men's & women's international/
// domestic matches pulled from a third-party provider (NOT scored by Bails).
//
// ⚠️ ACTION REQUIRED:
// 1. Go to https://cricketdata.org/signup.aspx and sign up (free, no card).
// 2. Copy your "Lifetime Free" API key from the dashboard.
// 3. Paste it below, replacing 'PASTE_YOUR_CRICKETDATA_API_KEY_HERE'.
//
// Why this provider, and why not "unlimited": every legitimate cricket data
// API was checked (CricketData.org, RapidAPI wrappers, Sportmonks, Roanuz,
// EntitySport, elitesportapi) — none offer a free tier that's genuinely
// unlimited; "unlimited" only exists on paid plans (roughly $65+/mo).
// CricketData.org's 100 requests/day free tier is the best legitimate,
// ToS-compliant option, and the v22 loading strategy (see js/liveCricket.js)
// is specifically designed to make that 100/day go a long way: the list is
// shared across all users with a TTL, and per-match detail is only ever
// fetched once per match per day (see js/liveCricket.js for the full design).
//
// ⚠️ SECURITY NOTE: Because Bails has no server (Spark plan, no Cloud
// Functions), this key ships in client-side JS and is visible to anyone via
// browser devtools. The caching strategy keeps actual external calls low,
// which limits the blast radius of key misuse, but cannot fully prevent
// someone copying the key and using it outside Bails. If your CricketData.org
// dashboard usage ever spikes unexpectedly, regenerate the key there and
// paste the new one here.
const LiveCricketConfig = {
  API_KEY:  'NONE_NEEDED',
  API_BASE: 'https://bails-cricket-api.vercel.app/api',

  // ── Compute/quota budget (tune if you upgrade past the free 100/day plan) ──
  // Since we are now using a custom backend scraper, we don't have a 100/day limit.
  // Set to a very high number to effectively disable the budget cap.
  DAILY_HIT_BUDGET: 999999,

  // How long the LIST cache is considered "fresh enough" before the next
  // viewer triggers a re-fetch. Per-match detail has its own, much cheaper
  // rule (once per match per day, forever once completed) — see
  // js/liveCricket.js getMatchDetail().
  TTL_WHEN_LIVE_MS: 6  * 60 * 1000,   // 6 minutes
  TTL_WHEN_IDLE_MS: 45 * 60 * 1000,   // 45 minutes
};
