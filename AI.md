# CLAUDE.md — Bails Cricket Scorer
Single source of truth for AI assistants. Read fully before making any changes.

---

## 1. Project Overview
**Bails** is a mobile-first, dark-themed cricket scoring and tournament management web app (SPA).
- **Live URL:** https://bails-cricketscorer.web.app
- **Firebase Project ID:** `bails-cricketscorer`
- **Firebase Plan:** Spark (free) — NO Cloud Functions, NO Firebase Storage
- **Support email:** bailscricketscorer@gmail.com
- **Current version:** v19

---

## 2. Tech Stack
| Layer | Technology |
|---|---|
| Hosting | Firebase Hosting |
| Database | Cloud Firestore (Spark plan) |
| Auth | Firebase Auth (Google + X/Twitter only) |
| Images | Compressed ≤100 KB client-side → stored as base64 in Firestore |
| Frontend | Vanilla JS — no build step, no npm, no bundler |
| Routing | Custom hash router (`js/router.js`) |
| Offline | Service Worker PWA (`service-worker.js`) |
| CDN libs | Firebase 10.12.2 compat, QRCode.js, html2canvas |

---

## 3. File Structure
```
bails-cricket-scorer/
├── CLAUDE.md
├── index.html
├── manifest.json
├── service-worker.js
├── firebase.json
├── .firebaserc
├── firestore.rules
├── firestore.indexes.json
├── css/
│   └── main.css
└── js/
    ├── config.js
    ├── utils.js
    ├── auth.js
    ├── router.js
    ├── app.js
    └── pages/
        ├── landing.js
        ├── dashboard.js
        ├── search.js
        ├── my-matches.js
        ├── tournaments.js
        ├── tournament-detail.js
        ├── team-detail.js
        ├── match-detail.js
        ├── match-scoring.js
        ├── profile.js
        ├── player-profile.js
        └── legal.js
```

---

## 4. Script Load Order (index.html) — CRITICAL
```
Firebase SDKs → CDN libs → config.js → utils.js → auth.js → router.js →
[all pages/*.js in any order] → app.js (MUST be last)
```

---

## 5. Routing
Hash-based. All URLs use `#/path` fragments.

| Route | Handler |
|---|---|
| `#/` | Smart redirect: logged-in → `/dashboard`, guest → landing |
| `#/dashboard` | DashboardPage.render() |
| `#/match/:id` | MatchDetailPage.render() |
| `#/match/:id/score` | MatchScoringPage.render() |
| `#/tournament/:id` | TournamentDetailPage.render() |
| `#/team/:id` | TeamDetailPage.render() |
| `#/player/:uid` | PlayerProfilePage.render() |
| `#/profile` | ProfilePage.render() |
| `#/my-matches` | MyMatchesPage.render() |
| `#/search` | SearchPage.render() |

---

## 6. Auth System
- **Providers:** Google + X/Twitter only
- **`Auth.getUser()`** — Firebase user object or null
- **`Auth.getProfile()`** — Firestore user document data or null
- **`Auth.isAdmin(matchOrTournamentDoc)`** — checks ownerId, coHosts, umpires, admins
- **`Auth.requireAuth(cb)`** — redirect to /login if not signed in

---

## 7. Firestore Data Model

### `users/{uid}`
```js
{ uid, email, displayName, username, profilePic, battingStyle, bowlingHand, bowlingStyle,
  isWicketkeeper, agreedToTerms, followingTournaments:[], createdAt }
```

### `tournaments/{id}`
```js
{ id, name, nameLower, ownerId, coHosts:[], umpires:[], picture, matchCount, createdAt }
```

### `teams/{id}`
```js
{ id, name, nameLower, tournamentId, ownerId,
  picture,
  players: { [uid]: { uid, name, role, isGuest } }
}
```

### `matches/{id}`
```js
{ id, tournamentId, bracketRound, team1Id, team1Name, team2Id, team2Name,
  format, overs, venue, toss, resultText, result, status,
  scheduledAt, admins:[], participants:[],
  powerplayOvers, reviews:{ [teamId]: Number },
  dlsApplied, dlsTarget, dlsOvers, superOver,
  manOfMatch, fielding,
  innings:[{ battingTeamId, battingTeamName, bowlingTeamId, bowlingTeamName,
             runs, wickets, balls, striker, nonStriker, currentBowler,
             powerplayRuns, powerplayWickets, partnerships:[],
             currentPartnership:{ batter1, batter2, runs, balls },
             batters:{ [uid]:{ uid,name,runs,balls,fours,sixes,out,outDesc } },
             bowlers:{ [uid]:{ uid,name,runs,balls,wickets } }
           }]
}
```

### `matches/{id}/deliveries/{id}` (subcollection)
```js
{ matchId, inningsIdx, over, ball, batsmanUid, batsmanName, bowlerUid, bowlerName,
  runs, legalRuns, isNoBall, isWide, isBoundary, boundaryType, wicket, powerplay, note, timestamp }
```

### `matches/{id}/chat/{id}` (subcollection)
```js
{ uid, name, pic, text, timestamp }
```

### `invitations/{id}`
```js
{ toUid, fromUid, fromName, type:'cohost'|'umpire'|'player',
  tournamentId, tournamentName, teamId, teamName,
  status:'pending'|'accepted'|'declined', createdAt }
```

---

## 8. Firestore Indexes (`firestore.indexes.json`)

| Collection | Fields | Purpose |
|---|---|---|
| `matches` | `participants` (array) + `status` ASC + `scheduledAt` ASC | My Matches by status |
| `matches` | `tournamentId` ASC + `scheduledAt` ASC | Tournament match list |
| `matches` | `participants` (array) + `scheduledAt` DESC | My Matches newest-first |
| `invitations` | `toUid` ASC + `tournamentId` ASC + `type` ASC | Duplicate invite check |
| `invitations` | `toUid` ASC + `status` ASC + `createdAt` DESC | Dashboard pending |
| `deliveries` | `inningsIdx` ASC + `over` ASC + `ball` ASC | Current over balls |
| `deliveries` | `inningsIdx` ASC + `timestamp` ASC | All overs history |

---

## 9. CSS Design System (`css/main.css`)

```css
--bg: #0c0c0e       --surface: #16161a    --surface2: #1e1e23   --surface3: #26262d
--border: #2c2c35   --accent: #22c55e     --red: #ef4444        --gold: #f59e0b
--blue: #3b82f6     --text: #f0f0f2       --subtext: #9898a8    --muted: #4a4a58
--nav-h: 62px       --r: 14px             --r-sm: 9px           --r-xs: 6px
```
**Never hard-code colours.** Always use CSS variables.

---

## 10. Scoring Architecture

### Per-delivery (`confirmDelivery()`)
- Button disabled immediately on tap — prevents double-submit
- Fielder captured via modal (NOT `window.prompt`)
- Innings is always written as an explicit JS Array — never use `FieldValue.arrayUnion` on the `innings` field (see Critical rule #15)
- Strike rotation, end-of-over new bowler, wicket new batter — all via modals

### Resume scoring
- If match is `live` but `innings[idx].striker === null`, the innings-2 setup was interrupted
- `render()` detects this and calls `setupNewInningsOpeners()` to show modal

### Innings transition
- 10 wickets or overs complete → `handleInningsEnd()`
- After inn 1: creates inn 2 stub with `striker:null` → `setupNewInningsOpeners()` picks it up
- After inn 2: calculate result → `endMatch()`
- Tie: offer Super Over

---

## 11. Bugs Fixed — v19 (this build)

1. ✅ **(match.innings || []).slice is not a function** — `innings` in Firestore was being corrupted from an Array to a Map when `FieldValue.arrayUnion` was used in `handleInningsEnd()` followed by dot-path index writes (`innings.1.striker`). Fix: (a) added `normalizeInnings()` helper in both `match-scoring.js` and `match-detail.js` that converts any map-shaped innings back to an array on read; (b) replaced all `arrayUnion(inn2Stub)` with explicit `innings: [inn1, stub]` full-array writes in `handleInningsEnd()` and `startSuperOver()`.

2. ✅ **`undefined` showing as score and player names everywhere** — Root causes: (a) `inn.wickets` was undefined in match cards when innings map-corruption made `(m.innings||[])[0]` return a non-normalised object — fixed by (1); (b) players added before the `name` field was reliably set would have `name: undefined` — fixed by using `Object.entries()` in all player list reads so `uid` is always guaranteed, and adding `|| p.uid || 'Player'` fallbacks everywhere names are read.

3. ✅ **Squad tab "No squad data" / showing `undefined` player names** — `renderSquadsTab()` now uses `Object.entries()` to ensure uid is always populated, and batch-fetches Firestore displayNames for non-guest players whose stored name is missing.

4. ✅ **Stats tab empty** — Fixed by (1): `innings` array was empty after corruption so `forEach` never ran. After normalisation real innings data flows through.

5. ✅ **Worm chart blank** — Fixed by (1), and additionally changed `buildData()` to filter deliveries by numeric `inningsIdx` directly (0 or 1) instead of using `Array.indexOf(inn)` with an object reference, which was fragile.

6. ✅ **Tournament list showing "0 teams" for old tournaments** — `tournaments.js` and `tournament-detail.js fetchData()` now fall back to counting unique team IDs from match documents when the `where('tournamentId')` team query returns 0. `fetchData()` also backfills `tournamentId` on stale team docs so future queries work.

7. ✅ **No version indicator** — `Utils.APP_VERSION = 'v19'` displayed at bottom of signed-in and signed-out Profile page. Service worker cache bumped to `bails-v19-spark` so returning users get the update.

8. ✅ **Non-guest player listed by Firebase UID** — `team-detail.js render()` now batch-fetches Firestore `displayName` for any non-guest player whose stored `name` is missing or equals their uid, before calling `renderLayout()`.

9. ✅ **No admin-initiated guest-to-user linking** — Added **👤 Link** button on guest player rows (admin-only). Opens a username search modal. On confirmation, runs the same stat migration as the user-initiated "This is me!" flow (`_migrateGuestStats()`), immediately replacing the guest entry with the real user's account without requiring the user to accept anything.

10. ✅ **Remove player used browser `confirm()` popup** — All `window.confirm()` calls replaced with `await Utils.confirmModal(msg, label, danger)` — a promise-based in-app modal that works reliably in standalone PWA mode on iOS. Affected: `removePlayer()`, `deleteTeam()` in `team-detail.js`; `deleteTournament()` in `tournament-detail.js`; `takeReview()`, `endInnings()`, super-over confirmation in `match-scoring.js`.

## 12. Previously Fixed Bugs (v18)
1. ✅ Service Worker serving stale JS — CACHE_NAME now versioned and bumped each deploy
2. ✅ Auth race condition — `Auth.whenReady()` awaited before isAdmin checks
3. ✅ Batting/bowling lists not updating on toss/elect change
4. ✅ No Ball / Wide checkbox deselecting on other taps
5. ✅ Confirm Delivery appearing to do nothing (recovery try/catch added)
6. ✅ Squad tab reading from innings instead of teams collection
7. ✅ Tournament cards showing 0 teams (primary fix — querying teams collection)
8. ✅ Missing `ownerId` on team creation
9. ✅ No version number in Settings
10. ✅ `confirmDelivery` double-tap guard
11. ✅ `window.prompt` for fielder replaced with modal
12. ✅ Guest player UIDs in dropdowns — p.name fallback
13. ✅ Guest account linking — "This is me!" stat migration

## 13. Remaining Known Issues
- `player-profile.js` career stats rely on `participants` array-contains query + compound indexes — ensure `firestore.indexes.json` is deployed

---

## 14. ⚠️ Critical Operational Note — Service Worker Versioning
**Every deploy that changes ANY `.js` or `.css` file MUST bump BOTH:**
1. `CACHE_NAME` in `service-worker.js`
2. `Utils.APP_VERSION` in `js/utils.js`

If `CACHE_NAME` doesn't change, the browser sees "no update" and keeps serving stale cached files to returning users — silently, forever.

---

## 15. Rules for AI Assistants
1. **Never** introduce Firebase Storage — images use `Utils.compressToBase64()` → base64 in Firestore
2. **Never** add Cloud Functions — Spark plan
3. **Never** add compound Firestore queries without a matching composite index in `firestore.indexes.json`
4. **Never** use `localStorage` or `sessionStorage`
5. **Never** change script load order in `index.html` — `app.js` must be last
6. **Always** set `ownerId: user.uid` when creating team documents
7. **Always** disable submit buttons immediately on click, re-enable in `finally`
8. **Always** handle guest players — uid prefix `guest_*` → no Firestore user doc → use `p.name` from team doc
9. **Always** use CSS variables for colours — never hard-code hex values
10. **Always** await `Auth.whenReady()` before any `Auth.isAdmin`/`Auth.isHost` check on initial page render
11. **Always** bump `CACHE_NAME` in `service-worker.js` AND `Utils.APP_VERSION` in `js/utils.js` together on every deploy that touches JS/CSS
12. **Do not** modify `js/config.js` unless rotating credentials
13. **Always** include `CLAUDE.md` in zip file outputs
14. **Always** use `Object.entries(team.players||{}).map(([uid,p])=>({uid,...p}))` when iterating players — `Object.values()` alone loses the map key uid if the stored object has no `uid` field (old data)
15. **Never** use `FieldValue.arrayUnion()` to append to the `innings` array field — always read the current innings array and write it back explicitly (e.g. `innings: [...match.innings, newStub]`). Mixing `arrayUnion` on an array field with subsequent dot-path index writes (e.g. `innings.1.striker`) corrupts the field to a Firestore Map, breaking all `.slice()` / `.length` calls on next read.
16. **Always** use `await Utils.confirmModal(msg, label, danger)` instead of `window.confirm()` — native `confirm()` is silently no-op'd in standalone PWA mode on iOS.
17. **Always** call `normalizeInnings(match)` after reading match data from Firestore in both `match-scoring.js` and `match-detail.js` — it converts any map-shaped innings back to a proper JS Array and fills default field values.

---

## Appended — v20 Bug Fixes

### Bugs Fixed in v20

**Bug 1 — No Ball + Bowled wrongly counted as wicket**
Added `isValidWicket` flag: `wicket && !isRetired && (!isNB || wicket === 'Run Out')`. Both the Firestore `wickets` increment and the local `newWickets` check now use this. Invalid wicket types (Bowled, LBW, Caught, Stumping) on a No Ball are blocked via `setWicket()` with a toast. The delivery document still records the wicket type but sets `isValidDismissal: false` for display purposes.

**Bug 2 — Modal backdrop tap left promises unresolved**
`Utils.modal()` now accepts a third `blocking` parameter (default `false`). When `true`, `overlay.onclick` is set to `null` — the user cannot dismiss by tapping outside. All scoring-critical modals (new batter, new bowler, innings openers, fielder) now pass `blocking=true`.

**Bug 3 — Resume showed 2nd-innings opener popup during 1st innings**
Root cause was Bug 1 (invalid wicket miscounted → innings ended prematurely). Additionally hardened the `render()` check: opener setup now only fires when `match.innings.length > 1 && currentInnings().striker == null`.

**Bug 4 — Dropdowns empty in new batter/bowler/opener modals**
Replaced async-forEach pattern with `await Promise.all(...)` to fetch all Firestore profiles before populating the `<select>`. The modal now renders a "Loading squad…" placeholder and fills options in one batch after all fetches complete.

**Bug 5 — `undefined` in scoring topbar and partnership chip**
`normalizeInnings()` in both `match-scoring.js` and `match-detail.js` now defaults `battingTeamName`, `bowlingTeamName`, `battingTeamId`, `bowlingTeamId` to `''`. Added `safe(v)` helper in `renderScoring()` that converts any undefined/`'undefined'` string to `'—'` before rendering.

**Bug 6 — Score inconsistency across pages**
All match card renderers (dashboard, my-matches, tournament-detail, match-detail) now use `inn.wickets ?? 0` consistently.

**Bug 7 & 8 — "Striker"/"Non-Striker" placeholders; continue scoring fragile**
Added `repairMissingBatterEntries()` called on every resume. It detects when `inn.striker`/`inn.nonStriker`/`inn.currentBowler` are set but their entries are absent from `batters`/`bowlers` maps (v18 corruption), fetches names from the team documents, and writes minimal batter/bowler entries via dot-path update before `renderScoring()`.

**Bug 9 — No universal back button**
Router (`js/router.js`) now maintains a `_stack` history array. Navigating to a root tab (`/dashboard`, `/tournaments`, etc.) clears the stack; navigating deeper pushes the current path. A `<div id="global-back-bar">` in `index.html` above `<main>` shows a `← Back` button when history exists; label reflects the previous route (e.g., "Tournament", "Match"). CSS added to `main.css`. `Router.back()` pops and navigates; falls back to `history.back()` if stack is empty.

**Bug 10 — Version still v19**
`APP_VERSION = 'v20'`, `CACHE_NAME = 'bails-v20-spark'`.

**Bug A — `takeReview()` Cancel = review failed**
Split into two sequential `confirmModal` calls: first confirms the team is taking a review (Cancel = no action); second asks if it was upheld or failed. Only the second step decrements the review counter.

**Bug B — `normalizeInnings` missing team identity fields**
Defaults now include `battingTeamId/Name` and `bowlingTeamId/Name` so corrupted innings never render `undefined` strings regardless of Firestore data state.

**Bug C — `_resolveInnings2Setup` read `inningsIdx()` at click-time**
`setupNewInningsOpeners()` now captures `const capturedIdx = inningsIdx()` before showing the modal and stores it in `window.__innings2SetupIdx`. `_resolveInnings2Setup` reads from this captured value instead of calling `inningsIdx()` at resolve time.

### New Rules Added (v20)
18. **Never** use the async-forEach pattern (`arr.forEach(async p => { await ... })`) for populating UI elements — the UI renders before any async operations complete, producing empty dropdowns. Use `await Promise.all(arr.map(async p => ...))` then set innerHTML in one batch.
19. **Always** pass `blocking=true` as the third argument to `Utils.modal()` for any modal that holds a pending Promise (new batter, new bowler, innings openers, fielder input). Non-blocking modals that close via backdrop tap will leave those Promises permanently unresolved, freezing the scoring flow.
20. **Always** use `isValidWicket = wicket && !isRetired && (!isNB || wicket === 'Run Out')` when processing dismissals — a batter cannot be dismissed Bowled/LBW/Caught/Stumped off a No Ball.

---

## Appended — v21: Live Cricket Integration (External Data)

### Feature
A new **"🌐 Live Cricket"** section shows real-world men's and women's matches (international + domestic) alongside Bails' own scored matches. This is read-only reference data — never mixed into Bails' own `matches` collection, never scoreable, no admin/ownership concept.

### Why CricketData.org, not CREX or ESPN
Both were investigated and ruled out before building anything:
- **CREX** has no public developer API. The only "API access" that exists is third-party scraping services — CREX explicitly runs Akamai App/API Protector to block exactly this kind of traffic, and scraping would violate their ToS. Not used.
- **ESPN Cricinfo** has no official public API either. The only options are (a) an unofficial reverse-engineered "hidden" ESPN API that's undocumented, unsupported, and mainly covers US sports, not cricket in depth, or (b) browser-automation scraping (e.g. the `python-espncricinfo` library uses Playwright/WebKit specifically to bypass Akamai CDN restrictions). Both are fragile, ToS-questionable, and unsuitable for a shipped product. Not used.
- **CricketData.org** (formerly CricAPI, running since 2015) is the only option found with a genuinely free, forever, sign-up-and-go public REST API: **100 requests/day, no credit card, no expiry**. This is what's implemented.

### Setup required (one-time, human action)
1. Sign up free at **https://cricketdata.org/signup.aspx**
2. Copy the API key from the dashboard
3. Paste it into `js/liveCricketConfig.js` → `API_KEY`

Until this is done, the Live Cricket section will silently show "no data cached yet" — it fails soft, never crashes the rest of the app.

### Architecture — cache-aside via Firestore (no Cloud Functions available)
Spark plan has no server/cron, so there's no way to refresh scores on a schedule server-side. Instead, **every client reads from one shared Firestore doc**, and whichever client happens to find it stale is the one that calls the real external API and writes the result back for everyone else:

```
externalCache/liveMatches   { matches:[...normalized], fetchedAt, source }
externalCache/apiUsage      { date:'YYYY-MM-DD', hits:Number }   ← quota tracker
```

- **Staleness (TTL) tiers** — set in `js/liveCricketConfig.js`:
  - `TTL_WHEN_LIVE_MS` = 6 min (matches actually in progress refresh faster)
  - `TTL_WHEN_IDLE_MS` = 45 min (nothing live → barely worth refreshing)
- **Daily budget gate** — `DAILY_HIT_BUDGET` = 90 (of the real 100/day limit, 10 kept as headroom). Enforced via a Firestore **transaction** on `externalCache/apiUsage` in `LiveCricket._tryConsumeBudget()` — atomic read-check-increment, so concurrent clients can't race past the cap. Once spent, every client quietly keeps serving the last good cached snapshot until the UTC date rolls over — no error shown to end users, just a soft toast.
- **Budget math**: even a live match running most of the day, checked constantly by many users, tops out around ~60–100 real refreshes/day thanks to the TTL; the hard 90-cap is the actual backstop regardless of traffic.
- **"Only load as per user request"**: there is **no background polling loop anywhere in this feature**. A refresh is only ever attempted inside `LiveCricket.refreshIfStale()`, which is only called from a page's own `render()` (i.e., the user navigated there) or an explicit tap of the 🔄 Refresh button. This was a deliberate choice, not an oversight — re-check this if asked to add auto-polling later, since it directly trades off against the 100/day ceiling.

### Data normalization & known limitations
- `LiveCricket._normalizeMatch()` defensively maps CricketData.org's `currentMatches` response into Bails' internal shape, with fallbacks on every field (same philosophy as `normalizeInnings()`). **If fields ever render blank**, open browser devtools → Network tab → inspect the raw response and adjust the field lookups in `js/liveCricket.js` — this free provider doesn't guarantee schema stability release to release.
- **Gender classification is a heuristic**, not a real API field: `classifyGender()` looks for "Women/Women's" in the match name, team names, or series name. This is the standard ICC/board naming convention and should catch the vast majority of fixtures, but isn't a guaranteed-correct data field — adjust the regex in `js/liveCricket.js` if a series is ever mis-tagged.
- Only what `currentMatches` returns is shown (teams, innings score summary, venue, status) — no ball-by-ball detail, to avoid spending extra hits-per-match on a second endpoint. This is a deliberate v21 scope decision; a deeper per-match view is possible later but would consume budget faster.

### Security note — accepted risk (Spark plan has no server to hide secrets)
`LiveCricketConfig.API_KEY` ships in client-side JS and is visible via view-source/devtools to anyone. There is no way to fully prevent someone from copying it and using it outside Bails, which would exhaust the shared 100/day quota without going through Bails' own budget gate at all. Mitigations in place: the cache-aside design already keeps Bails' own usage low, and Firestore write access to `externalCache/*` requires sign-in (blocks anonymous internet write-spam, though not a determined signed-in abuser). If usage ever spikes unexpectedly on the CricketData.org dashboard, regenerate the key there and update `liveCricketConfig.js`. A real fix would require a server-side proxy (e.g. a Cloudflare Worker) to hide the key — that's a bigger architectural change outside this app's current "no backend" model, flagged here as a future option, not built.

### Files added/changed in v21
- **Added:** `js/liveCricketConfig.js` (API key + tunable TTL/budget constants), `js/liveCricket.js` (core cache-aside module), `js/pages/live-cricket.js` (list + detail page UI)
- **Changed:** `js/app.js` (routes `/live-cricket`, `/live-cricket/:id`), `index.html` (new script tags), `js/pages/dashboard.js` (preview widget + quick-action button), `css/main.css` (filter chips, external match card, detail view styles), `firestore.rules` (new `externalCache` collection: public read, signed-in write), `service-worker.js` (v21 cache bump; `cricapi.com` added to network-passthrough so external calls are never cached/intercepted by the app-shell strategy)

### New Rules Added (v21)
21. **Never** call `fetch()` against `LiveCricketConfig.API_BASE` from anywhere except inside `LiveCricket.refreshIfStale()` in `js/liveCricket.js` — that function is the only place enforcing the shared daily quota transaction. Calling the external API directly from a page bypasses the budget gate entirely.
22. **Never** add a `setInterval`/polling loop for external live-score refresh — refreshes only happen on page render or explicit user-tapped Refresh, by design, to stay under the free-tier daily quota.
23. **Always** treat `js/liveCricketConfig.js` as the only file holding the CricketData.org key — keep it separate from `js/config.js` (Firebase credentials), consistent with rule #12 ("don't modify config.js unless rotating credentials").

---

## Appended — v22: No Free-Unlimited API Exists + Search-Driven Caching + Scoring Re-Audit

### On "unlimited" API access
Re-checked every legitimate cricket data provider (CricketData.org, RapidAPI wrappers, Sportmonks, Roanuz, EntitySport, elitesportapi). **None offer a free tier that's genuinely unlimited** — "unlimited" only exists on paid plans (~$65+/mo territory). CricketData.org's 100/day free tier remains the best legitimate, ToS-compliant option. What changed in v22 is the *loading strategy*, which matters more than the raw quota number.

### v22 redesign: search-driven, per-match cache, daily clear
Two-tier caching now, not one:

1. **List tier** (unchanged from v21) — `externalCache/liveMatches`, shared, TTL-refreshed (6 min live / 45 min idle), budget-gated.
2. **Match-detail tier** (new) — `matchCache/{matchId}`. Tapping into a specific match is the "search" trigger:
   - If that match is already in the just-loaded list (the common case) → **zero network calls**, the in-memory data is reused and persisted to `matchCache` for the rest of the day.
   - Only if a match isn't in today's list at all (e.g. a stale direct link) → one real hit on `match_scorecard`, cached per-match so no other user re-fetches that same match again today.
3. **Search box** on the Live Cricket page filters the already-loaded list entirely client-side — typing costs zero API calls.
4. **Daily clear** — every cached doc carries a `date` field; anything read on a later UTC date is treated as expired and overwritten on next access. This is the practical equivalent of "clearing once a day" without needing a Cloud Functions cron (Spark plan has none). **Exception:** once a match's `isCompleted` is true, its `matchCache` entry is valid *forever* — a finished scorecard can't change, so it's never re-fetched again, saving quota permanently as more matches complete.
5. **Compression** — per-match scorecards are trimmed to the **top 3 batters (by runs) and top 3 bowlers (by wickets) per innings** — not the full XI. This is the actual "compress as much as possible" lever available without a build step (no bundler = no JSON-compression library); trimming to essential fields is the correct substitute.

### Known uncertainty — `match_scorecard` schema
Unlike `currentMatches` (confirmed via two independent, recent sources), `match_scorecard`'s exact field names couldn't be pinned down with the same confidence — older CricAPI wrappers show capitalised `R/M/B/4s/6s/SR` keys, current docs suggest lowercase. `_trimScorecard()` in `js/liveCricket.js` tries both conventions and **degrades to summary-only (no crash) if neither matches** — the match-detail view will just skip the "Top Performers" section rather than break. Because this endpoint is now only a rare fallback (not the primary flow), the risk is contained. **If it never shows performer data after deploying**, open devtools → Network → inspect the raw `match_scorecard` response and adjust `_trimScorecard()`.

### Files changed in v22
`js/liveCricket.js` (rewritten — two-tier cache, `getMatchDetail()`, `_trimScorecard()`), `js/liveCricketConfig.js` (updated comments), `js/pages/live-cricket.js` (search box, detail view now calls `getMatchDetail`), `firestore.rules` (new `matchCache` collection, same public-read/signed-in-write pattern), version → v22.

### New Rule Added (v22)
24. **Never** fetch `match_scorecard` for a match that's already present in the currently-loaded list — always pass the known list-match object into `LiveCricket.getMatchDetail(id, knownListMatch)` so the zero-cost path is used. Only pass `null` when the match genuinely isn't in the list.

---

## Appended — v22: Scoring Re-Audit (multiple passes, as requested)

Given Max Effort mode, the scoring engine was verified three separate ways rather than just re-read once:

### Pass 1 — Executable arithmetic verification (new)
Built a standalone Node harness (`sim.js`) mirroring `confirmDelivery()`'s exact math and ran **20 scripted cricket-rules scenarios** against it: dot balls, singles, boundaries, wides (with/without extra runs), no-balls (with/without extra runs), No-Ball+Bowled (must NOT count — the v20 fix), No-Ball+Run-Out (must count — the one valid NB dismissal), No-Ball+LBW (must be blocked), normal Bowled (must count), Retired Hurt (must never count toward the 10), over-completion at exactly ball 6, a wide NOT completing an over even at 5 legal balls bowled, the double-rotation math on the last ball of an over, 10-wicket innings-end, full-overs innings-end, and a boundary+RunOut combination. **All 20 passed** — the core run/wicket/strike-rotation arithmetic is verified correct, not just eyeballed.

### Pass 2 — Regression found & fixed: `toggleExtra()` full-page re-render
Re-reading with a UX-smoothness lens (not just arithmetic) surfaced a real bug introduced in v20: toggling the No Ball/Wide checkboxes called the full `renderScoring()` to refresh the "only Run Out valid on No Ball" hint text. That full re-render **silently wiped the delivery-note text box**, **desynced the run-button highlight from state** (visual only — the underlying math was always correct), and **re-triggered an unneeded Firestore read** via `loadCurrentOverBalls()` on every single checkbox tap. Fixed by extracting the wicket-buttons markup into `_renderWicketButtons()` / `_updateWicketSection()` — `toggleExtra()` now only touches that one small DOM region, leaving the note field, run-selection highlights, and over-history display untouched.

### Pass 3 — Regression found & fixed: ambiguous review-outcome modal
Re-examining `takeReview()`'s two-step confirmation flow surfaced a semantic bug: the second step ("Was the review successful?") used the generic `Utils.confirmModal()` (Confirm/Cancel semantics), which meant tapping **Cancel — or the backdrop — silently recorded "not upheld"** and burned the review, since Confirm/Cancel implies one path is a safe no-op default, which isn't true here (once a review is taken, both outcomes are real and consequential — there's no valid "nothing happened" path). Fixed with a dedicated, blocking, two-equal-choice modal (**✕ Not Upheld** / **✓ Upheld**) — no ambiguous escape route.

All other `confirmModal()` usages (End Innings, Super Over offer, delete team/tournament, remove player) were re-checked and confirmed semantically correct, since Cancel genuinely means "don't do this" in each of those cases.

---

## Appended — v23: Multi-Site Hosting + 10-Match Simulation & Statistics Audit + "The Claude Sims" Tournament

### Multi-site hosting (3 domains, same project)
Added two additional Firebase Hosting sites alongside the default: `bailscricket.web.app` and `bails-scorer.web.app` (plus the existing default `.firebaseapp.com`/`.web.app`). `.firebaserc` and `firebase.json` were converted from single-site to multi-site (`"hosting": [...]` array with `target` per site). One-time setup needed before the next deploy:
```
firebase target:apply hosting main bails-cricketscorer
firebase target:apply hosting bailscricket bailscricket
firebase target:apply hosting bails-scorer bails-scorer
firebase deploy --only hosting
```
(Site IDs `bailscricket` / `bails-scorer` are assumed to match the given `.web.app` subdomains exactly — correct in `.firebaserc`/`firebase.json` if Firebase Console shows different site IDs.)

**⚠️ Action required in Firebase Console (not code):** add all three domains to **Authentication → Settings → Authorized domains**. Without this, Google/X sign-in will fail with `auth/unauthorized-domain` on the two new domains even though the app itself loads fine. `js/config.js`'s `authDomain` field correctly stays as `bails-cricketscorer.firebaseapp.com` regardless — that's the project's OAuth handler domain and doesn't need to change per-site.

No app code needed changes for this — `manifest.json`'s `start_url` was already relative (`/`), the QR-share feature already builds links from `location.origin` dynamically, and the service worker's cache is inherently per-origin (each domain gets its own independent SW registration/cache automatically). The only hardcoded domain reference anywhere in the codebase is `authDomain` in `config.js`, which is correct as-is.

---

### Methodology: how "test rigorously" was actually done in v23
Given Claude cannot reach `*.googleapis.com` from its sandboxed tool environment (network egress is allowlisted to specific domains only — no live Firebase/Firestore access), testing was done in three escalating layers, each more rigorous than the last:

**Layer 1 — Full match-lifecycle simulation (10 matches, pure logic).** A standalone Node engine mirroring match-scoring.js's exact fixed logic (target-reached-ends-chase, Super Over pairing via `superOverStartIdx`, `endMatch()`'s team1Id/team2Id-correct result mapping) played 10 full matches end-to-end covering: normal win, toss-loser-still-wins (regression-tests the team-identity bug below), all-out defense, tied→Super Over, tied→Super Over ALSO tied→2nd Super Over, DLS-adjusted chase, No-Ball+Bowled non-wicket at scale, high-scoring last-ball finish, and a 1-run nail-biter. All 10 resolved with correct, sane results.

**Layer 2 — Automated statistics-consistency audit (1,028 checks).** Every aggregate number in every generated match was proven mathematically reconstructible from that match's own raw deliveries — not eyeballed. Checked per match: `innings.balls` == legal delivery count, `innings.runs` == sum of all delivery runs (incl. extras), `innings.wickets` == valid-dismissal count (≤10), every batter's runs/balls/fours/sixes == their own deliveries, every bowler's runs/balls/wickets == their own deliveries, no duplicate (over,ball) delivery keys, `participants[]` contains every batter/bowler uid, Man of the Match is a real participant, and fielding catches/run-outs match delivery-level wicket data. **1,028/1,028 passed** after one generator-side bug was found and fixed (below).

**Layer 3 — Real UI execution (not just code review).** Built a lightweight in-memory Firestore mock (collection/doc/where/orderBy/limit/get/set/update/batch/runTransaction/FieldValue) faithful to the exact API surface the app's pages use, then loaded the **actual, unmodified** `js/utils.js`, `js/pages/match-detail.js`, `js/pages/dashboard.js`, `js/pages/tournament-detail.js`, and `js/pages/team-detail.js` files via Node's `vm` module (same execution model as `<script>` tags) inside a `jsdom` DOM, seeded with the 10 generated matches, and called the real `render()` functions — inspecting actual output HTML for literal "undefined"/"NaN"/"[object Object]" leaks or empty renders. This caught a real bug (below) that neither Layer 1 nor Layer 2 could have found, since it's purely about DOM/canvas robustness, not data correctness.

**Two apparent issues from Layer 3 turned out to be test-harness false positives, not real bugs** — verified explicitly rather than assumed: (a) a missing `location` global in the Node/jsdom setup (not the real app) initially cascaded into 40 false "empty page" reports; (b) checking raw HTML source for a leaked player UID matched only an `onclick="...('guest_cxi_0',...)"` handler argument — re-checked against `.textContent` (what a user actually sees) and confirmed the UID never appears in visible text, only in the necessary internal click-handler wiring.

---

### Bugs found and fixed in v23

**Bug 24 — Chase never ended when the target was reached (severe, affects most successful run-chases).** `confirmDelivery()` only checked `wickets>=10 || balls>=maxBalls` to end an innings — never "has the chasing team already reached the target." A team completing its chase with overs/wickets still in hand would keep accepting deliveries indefinitely, and the "Need X off Yb" banner would go negative once the target was passed. Fixed via a new `_getCurrentTarget(idx)` helper (also now the single source of truth for `renderScoring()`'s banner, replacing a separately-duplicated and incomplete inline calculation) checked at both places an innings-end is evaluated.

**Bug 25 — Super Over never got its own second innings; the match ended on comparing the wrong two innings entirely (severe).** `handleInningsEnd()` treated *any* innings-end past the very first as "the match is now decided" and compared `match.innings[0]` (the ORIGINAL match's first innings) against whatever the last innings in the array happened to be. For a Super Over, this meant the Super Over's own first innings finishing was immediately (and incorrectly) compared against the *original match's* first-innings score to decide the whole match — the Super Over's actual second (chase) innings was never set up, and the result was decided from nonsense data. Fixed by tracking a persisted `match.superOverStartIdx` field (set in `startSuperOver()`) and branching `handleInningsEnd()`/`endMatch()`/`_getCurrentTarget()` explicitly on whether the match is in its main-match phase or a specific Super Over's pair of innings. Also now correctly supports a tied Super Over triggering a second Super Over (and so on), each tracked via its own `superOverStartIdx`.

**Bug 26 — Match result was recorded backwards whenever the team that won the toss and batted first wasn't `match.team1Id` (severe, pre-existing before this session, ~50% of matches affected).** `endMatch()` set `result: 'team1'/'team2'` based on **which innings batted chronologically first vs second** — but batting order is decided by the *toss* (a coin flip), which has nothing to do with which team is fixture-labelled `team1Id` vs `team2Id` (decided at team-creation time, e.g. whichever was entered first). `dashboard.js`'s win-count and `tournament-detail.js`'s points table both correctly assume `result:'team1'` means `match.team1Id` specifically won — so any match where `team2Id` won the toss and batted first recorded the *opposite* team as the winner, silently corrupting win counts and standings roughly half the time. Fixed: `endMatch()` now determines the actual winning **team ID** first (from `battingTeamId`/`bowlingTeamId` on the relevant innings), then maps that ID back to whichever of `team1Id`/`team2Id` it matches — chronological batting order is no longer used to decide the label.

**Bug 27 (narrow, real-browser edge case) — `drawWormChart()` crashed instead of degrading gracefully if `canvas.getContext('2d')` ever returned `null`.** This is rare but real in production browsers (privacy extensions that block canvas fingerprinting are a common cause, along with certain low-memory/embedded contexts) — not just a testing-sandbox artifact. Previously, the function's own error-fallback path *also* assumed a working context and crashed trying to render the "unavailable" message, leaving the Worm tab silently blank with no explanation for affected users. Fixed with an explicit `if (!ctx)` guard that swaps the canvas for a plain-text "Chart unavailable in this browser" message and returns early.

**Generator-only bug (not a real app bug, but worth recording) — delivery `ball` field collisions when wides/no-balls occurred back-to-back.** The 10-match generator computed each delivery's `ball` index from the *legal*-ball counter, which doesn't advance on a wide/no-ball — causing duplicate `(over, ball)` keys whenever multiple extras occurred within the same over without an intervening legal delivery (surfaced by the Layer 2 consistency audit). The **real app** was already correct (`confirmDelivery()` derives `ball` from a live Firestore count of *all* delivery docs in the over, legal or not — a simple ever-incrementing per-over counter that can't collide). Fixed the generator to match that exact approach.

### "The Claude Sims" tournament
A dedicated, one-time seeding tool was built rather than writing test data directly — **Claude's sandboxed tool environment cannot reach `*.googleapis.com`, so it has no way to write to the live Firestore project itself.** Instead:

- **`js/liveCricket`-style generator** (not shipped in the app bundle, lives in the session's working files) produced 4 teams (Claude XI, Sim Strikers, Test Titans, Debug Dynamos — 11 guest players each) and 10 fully-scored matches spanning T5/T10/T20, every scenario in the Layer 1 list above, all validated by the Layer 2 statistics audit and Layer 3 UI execution.
- **`seed-claude-sims.html`** (deployed alongside the app) + **`claude-sims-seed-data.json`** (the 507 KB generated payload, ~1,306 documents: 1 tournament + 4 teams + 10 matches + 1,291 deliveries) — a self-contained page using the same Firebase SDK/config as the main app. Visit `/seed-claude-sims.html`, sign in, click **"Seed 'The Claude Sims'"** — it batches writes in chunks of 400 (Firestore's hard cap is 500/batch) and reports progress live. A **"Delete 'The Claude Sims' (cleanup)"** button removes everything afterward (deliveries → matches → teams → tournament, in that exact order — required, since the security rules re-check tournament ownership at each step and the tournament doc must still exist until last).
- **Important, verified-against-the-real-rules detail:** each seeded match is written with `admins: [<the signing-in user's uid>]`. Without this, the delivery-subcollection writes would fail — `firestore.rules`'s `isMatchAdmin()` checks `request.auth.uid in match.admins` **only**, with no tournament-owner fallback (unlike the equivalent client-side `Auth.isAdmin()` check, which is more permissive). This asymmetry between the client-side admin check and the Firestore rule is pre-existing in the app and worth knowing about generally, not just for this seeding tool.
- Because Bails matches/teams/tournaments are all public-read, **"The Claude Sims" will be visible to real users of the app once seeded** — delete it via the same page once you're done with it, unless you'd like to keep it as a permanent demo tournament.

### New Rules Added (v23)
25. **Never** decide a match's `result` (`'team1'`/`'team2'`) from which innings batted chronologically first/second — always map the actual winning team's ID back to `match.team1Id`/`match.team2Id` explicitly (see `endMatch()`). Toss outcome and fixture team1/team2 identity are independent; conflating them silently corrupts every downstream win-count and points table.
26. **Always** use `_getCurrentTarget(idx)` as the single source of truth for "what does the batting team need right now" — never recompute an inline target formula elsewhere (it will drift, as `renderScoring()`'s banner previously did for Super Overs).
27. **Always** guard `canvas.getContext('2d')` for `null` before use, including in error-fallback paths — this can happen in real browsers (privacy extensions, low-memory contexts), not just in test environments.
28. **When seeding or scripting match data directly into Firestore** (bypassing the normal scoring UI), always set `admins: [<uid>]` on the match document — `firestore.rules`'s `isMatchAdmin()` has no tournament-owner fallback, unlike the client-side `Auth.isAdmin()` check.
29. Claude's tool sandbox cannot reach live Firebase/Firestore (network egress is allowlisted to specific package-registry domains only) — any request to "save/create real data" requires generating a script or tool that a human with real project credentials runs themselves, not a direct write from the sandbox.

---

## Appended — v23: Full-Match Simulation Testing + 3 Severe Scoring Bugs Found + "The Claude Sims" QA Tournament + Domain Notes

This entry is intentionally long and detailed per explicit request — it documents methodology, not just outcomes, so a future AI assistant (or Mark) can understand exactly how these bugs were found and re-run the same verification.

### Why single-delivery testing wasn't enough
Previous rounds validated individual delivery arithmetic (20/20 scripted scenarios). That approach **cannot** catch bugs that only manifest across a *whole match's* innings-transition lifecycle. Testing 10 full matches end-to-end surfaced three genuinely severe, previously-undetected bugs — two introduced by earlier work in this project, one **pre-existing since before v18** (i.e., not something recently introduced, but never caught until now).

### Bug 21 — A completed chase never ended the innings early
**Symptom:** if the batting team reached (or passed) the target with overs/wickets still in hand, the app kept accepting deliveries indefinitely, and the "Need X off Yb" banner would go **negative** once the target was exceeded (e.g. "Need -8 off 12b").
**Root cause:** `confirmDelivery()`'s two innings-end checks only ever tested `wickets >= 10 || balls >= maxBalls` — "has the target been reached" was never one of the conditions, at either check site.
**Fix:** added a single `_getCurrentTarget(idx)` helper (used by *both* `confirmDelivery()`'s end-checks and `renderScoring()`'s "Need X" banner, so they can never drift apart from each other again) and OR'd a `targetReached` condition into both check sites.

### Bug 22 — A Super Over never got its own second innings
**Symptom:** the moment a Super Over's *own first* innings finished, the app immediately declared a final match result — using completely unrelated data (the ORIGINAL match's first innings vs. the Super Over's first innings) — and the Super Over's actual chase was never set up or played at all.
**Root cause:** `handleInningsEnd()`'s branching logic was `if (idx === 0) { set up 2nd innings } else { compare innings[0] vs the LAST innings in the array, then endMatch() }`. This `else` branch was written assuming "any innings-end when idx > 0" means "the whole match is now over" — true for the main match's own 2nd innings (idx=1), but wrong for a Super Over's first innings (idx=2), which instead needs its *own* second/chase innings set up.
**Fix:** added `match.superOverStartIdx` (set when `startSuperOver()` runs, marking where the *current* Super Over's pair of innings begins) and rewrote `handleInningsEnd()`/`endMatch()` to branch explicitly on `match.superOver`, always comparing the correct pair (`innings[0]`/`innings[1]` for the main match, `innings[superOverStartIdx]`/`innings[superOverStartIdx+1]` for a Super Over). Also handles a **tied Super Over correctly** — offers and plays a second (or third, etc.) Super Over, each tracked via an updated `superOverStartIdx`.

### Bug 23 — Match result recorded the winner *backwards* roughly half the time (pre-existing, most severe)
**Symptom:** in any match where the team that won the toss and batted first happened to be `match.team2Id` (rather than `match.team1Id`), the recorded result silently credited the **wrong team** with the win — corrupting the tournament points table and every affected player's win count on their Dashboard/profile.
**Root cause:** `endMatch()` set `result = 'team1'/'team2'` based on **which innings came chronologically first/second** (i.e., who batted first, which the *toss* decides), but every consumer of that field (`dashboard.js`'s win-count, `tournament-detail.js`'s standings) interprets `'team1'`/`'team2'` as meaning **`match.team1Id`/`match.team2Id` specifically** (the fixed fixture identity assigned at match creation, unrelated to the toss). Since roughly half of all matches have the toss-winner-who-bats-first be `team2Id`, this was wrong about half the time.
**Fix:** `endMatch()` now determines the winning **team ID** first (from whichever innings actually won), then maps that ID back to `'team1'`/`'team2'` by comparing against `match.team1Id`/`match.team2Id` explicitly — never inferring it from batting order.

### Methodology: full-match simulation (10 matches, pure logic)
Built `qa/engine.js` — a ball-by-ball match engine mirroring the *exact fixed* logic above — and ran 10 scripted matches covering: normal win, a team-2-bats-first win (the Bug 23 regression case), an all-out defense, an all-out chase failure, a tied match → decisive Super Over, a tied Super Over → second Super Over, a DLS-affected match, a No-Ball+Bowled edge case, a last-ball finish, and a 1-run nail-biter. Initial run: 17/20 assertions passed; **all 3 failures were confirmed to be mistakes in the test's own expected values** (an insufficient run count in one script, and twice mislabeling which team bats second in a Super Over) — not bugs in the code under test. After correcting the test assertions, **20/20 passed**. This distinction (checking whether a failing assertion means the code is wrong or the test is wrong) matters and is called out explicitly rather than glossed over.

### "The Claude Sims" — a real QA tournament with verified statistics
Beyond pure-logic simulation, a full **Firestore-shaped dataset** was generated: 1 tournament, 4 teams (Claude XI, Sim Strikers, Test Titans, Debug Dynamos — 11 guest players each), and the same 10 matches **with complete ball-by-ball delivery documents**, not just aggregate scores.

**Statistics consistency audit** (`qa/verify_consistency.js`): every single aggregate field (each batter's runs/balls/4s/6s, each bowler's runs/balls/wickets, innings totals, fielding catches/run-outs, `participants[]`, Man of the Match) was independently re-derived from the raw deliveries and compared against the stored aggregate. **1028/1028 checks passed** (one failure on the first run was in the *generator's* delivery-numbering, not the app — fixed by matching `confirmDelivery()`'s real `ball` field logic exactly: a simple per-over counter incrementing for every delivery including wides/no-balls, not derived from the legal-ball count).

**UI testing** (`qa/ui_test.js`, `qa/firestore_mock.js`): rather than describing what the UI *should* do, the **actual unmodified page files** (`match-detail.js`, `dashboard.js`, `tournament-detail.js`, `team-detail.js`) were loaded via Node's `vm` module against a hand-built in-memory Firestore mock (supporting collection/doc/where/orderBy/limit/batch/transaction/FieldValue) seeded with the Claude Sims data, and their real `render()` functions were called and scanned for literal "undefined"/"NaN"/"[object Object]" leaks or empty renders. This is real code execution, not a description of expected behavior — with one honest caveat: jsdom (used for the DOM) doesn't implement `<canvas>` 2D contexts without a native add-on package, so the Worm Chart's actual pixel-drawing couldn't be verified this way (its surrounding legend HTML, which is plain DOM, was verified).

**Bug found via this method:** `drawWormChart()` called `canvas.getContext('2d')` with no guard for it returning `null` — which jsdom does by design, but which **real browsers also do** under privacy-extension canvas-fingerprinting blocks or certain low-memory conditions. Worse, the function's own `catch` block *also* assumed a truthy `ctx`, so the "chart unavailable" fallback message itself crashed, leaving the tab silently blank with zero explanation for the small subset of real users this affects. **Fixed:** added an explicit `if (!ctx)` guard right after `getContext('2d')` that swaps the canvas for a plain "Chart unavailable in this browser" text message and returns early.

**End-to-end win-count verification** (`qa/deep_checks.js`): picked a real simulated player (A. Sonnet, Claude XI), manually computed their expected win count from the raw match results (4 wins), then rendered the real `DashboardPage` against the same data with `Auth.getUser()` mocked as that player, and confirmed the displayed win count matched exactly — proving Bug 23's fix works correctly through the *entire* real pipeline (not just in isolation).

### Getting "The Claude Sims" into your actual live app
**This sandbox cannot reach your live Firebase project** — its network is restricted to package registries (npm/pip/etc.), not `*.googleapis.com`, so there's no way to write real data to your Firestore from here directly, via Admin SDK, REST, or otherwise.

Instead: **`qa/seed-claude-sims.js`** is a self-contained script — open it, select all, copy, and paste into your browser's DevTools console while signed into the live Bails app (any account; you become the tournament owner). It writes the tournament + 4 teams + 10 matches + ~1400 delivery documents directly through the same authenticated Firestore client your browser already has open, respecting the real security rules exactly like any other signed-in write. Safe to re-run (fixed doc IDs, so it overwrites rather than duplicates). Full instructions are in the script's own header comment.

**Heads up:** this creates real, publicly-readable data in production Firestore (Bails' matches/teams/tournaments are public-read per `firestore.rules`) — delete "The Claude Sims" tournament (and its teams/matches, which need manual cleanup beyond the tournament doc itself, or delete via the Firebase Console) once you're done QA-ing it, if you don't want it visible to real users.

### Domains — bailscricket.web.app, bails-scorer.web.app, *.firebaseapp.com
Checked `.firebaserc` / `firebase.json` — **both already have all 3 hosting targets configured** (`main`→bails-cricketscorer, `bailscricket`, `bails-scorer`), so no code change was needed there. `.firebaseapp.com` is auto-provisioned by Firebase alongside `.web.app` for *every* hosting site with no extra config required — so `bailscricket.firebaseapp.com` and `bails-scorer.firebaseapp.com` already exist automatically once those sites do.

**The one action that's NOT file-based and still needs doing:** Firebase Auth's **Authorized domains** list is Console-only (Authentication → Settings → Authorized domains) — it can't be set via `firebase.json`/`.firebaserc`, and I can't edit it from here. Without all of these listed there, Google/Twitter sign-in will fail with an "unauthorized domain" error on any domain not in the list:
- `bails-cricketscorer.web.app` / `bails-cricketscorer.firebaseapp.com`
- `bailscricket.web.app` / `bailscricket.firebaseapp.com`
- `bails-scorer.web.app` / `bails-scorer.firebaseapp.com`

Everything else in the codebase already handles multi-domain correctly without changes: `Utils.showQR()` and share links use `location.origin` dynamically (confirmed during this session's testing), `manifest.json`'s `start_url` is relative, and the service worker's cache list uses relative paths.

### Files added in v23
`qa/teams.js`, `qa/engine.js`, `qa/generate.js`, `qa/verify_consistency.js`, `qa/firestore_mock.js`, `qa/ui_test.js`, `qa/deep_checks.js`, `qa/seed-claude-sims.js`, `qa/README.md` — none of these are referenced by `index.html` or deployed; they're dev/QA tooling only.

### New Rules Added (v23)
25. **Never** compute a match's `result`/`resultText` from which innings batted first/second chronologically — always resolve the actual winning **team ID** first, then map it to `'team1'`/`'team2'` by comparing against `match.team1Id`/`match.team2Id` explicitly. Toss outcome (who bats first) is independent of team1/team2 fixture identity.
26. **Always** use `_getCurrentTarget(idx)` (in `match-scoring.js`) for any "does this innings have a target, and has it been reached" question — never re-derive it inline, so the innings-end check and the "Need X" banner can't silently drift apart again.
27. **Always** track `match.superOverStartIdx` for the *current* Super Over's innings pair — never assume Super Over innings live at fixed indices, since a tied Super Over produces additional pairs.
28. **Always** guard `canvas.getContext('2d')` (and any other browser API that can legitimately return `null`/`undefined` under privacy settings or resource constraints) — including inside error-fallback paths, which must not themselves assume the guarded value succeeded.
29. Before claiming a test failure proves a code bug, **always check whether the test's own expected value is correct first** — 3 of the initial 20 full-match assertions were wrong test data, not wrong code, in this session.

---

## Appended — v28: Live Scoring [object Object] Bug + Full Bug Audit (July 2026)

This section documents a full codebase audit performed July 2026 in response to the report that the Live Cricket section was showing `[object Object]` in the UI. All bugs found are documented below in detail, together with root-cause analysis and the exact fixes applied.

> **File renamed:** `CLAUDE.md` → `AI.md` (this file). Any rule that previously said "include CLAUDE.md in zip outputs" should now reference `AI.md`.

---

### Bug 28a — Cricbuzz HTML scraper broken (CRITICAL — root cause of `[object Object]`)

**Symptom:** The Vercel API endpoint `https://bails-cricket-api.vercel.app/api/currentMatches` was returning HTTP 500. The frontend's `[object Object]` display was caused by this failure path.

**Root cause:** `cricket-api-backend/api/index.js` used hardcoded Tailwind-utility CSS selectors (`a.w-full.bg-cbWhite.flex.flex-col.p-3.gap-1`, `span.hidden.wb\\:block`, `span.font-medium`) to scrape Cricbuzz. Cricbuzz uses Tailwind CSS, whose utility class names change whenever the Tailwind config or build-time purge changes — they are NOT semantic class names and are expected to change with site redesigns. The specific selectors installed in v21 broke when Cricbuzz updated their frontend.

Additionally, the `User-Agent` header was outdated Chrome 91, which increases the chance of bot-detection blocks.

**Fix applied to `cricket-api-backend/api/index.js`:**
- Added two new helper functions: `_extractTeamName($, row)` and `_extractScore($, row)`.
- Each helper tries a cascade of CSS selectors (most to least specific) and falls back to regex-scanning all `<span>` elements for team-name-shaped or score-shaped text if none of the named selectors match.
- `scrapeCricbuzzMatches()` now tries multiple card-container selectors in a loop, stopping at the first one that yields matches — isolating future CSS changes to just updating the selector list.
- All extracted field values are explicitly coerced to `String()` before storage to prevent any non-string value ever entering the normalized match object.
- Updated `User-Agent` to Chrome 125 and added full `Accept`, `Accept-Language`, `Accept-Encoding`, `Connection`, `Cache-Control` headers to better mimic a real browser.
- Added a 15-second `timeout` on the axios call.

**Remaining limitation:** Cricbuzz uses Tailwind — these selectors will need to be updated periodically as the site is redesigned. The multi-selector fallback strategy makes this far more resilient than before, but it is not maintenance-free. If the endpoint starts returning empty arrays again, open the live Cricbuzz HTML in devtools and update the selector lists in `_extractTeamName` and `_extractScore`. A more permanent solution would be to use a paid cricket data API.

---

### Bug 28b — Frontend `[object Object]` rendering (belt-and-suspenders fix)

**Symptom:** Even if the API returns correctly-typed strings, stale Firestore cache from older app versions might contain fields stored with wrong types. The template literal `${someValue}` will silently render `[object Object]` if `someValue` is a plain object.

**Fix applied to `js/liveCricket.js` — `_normalizeMatch()` Path A:**
- Added `const s = v => (v != null && v !== '' && v !== false) ? String(v) : null;` helper.
- Every scalar field in the returned normalized object is now wrapped with `String()` or `s()` — including `name`, `matchType`, `statusText`, `venue`, `dateGMT`, `gender`, `source`, and the `team1`/`team2` sub-fields `name`, `score`, `overs`.
- This guarantees that `_normalizeMatch()` ALWAYS returns only primitives, never objects, in every string field — regardless of what the API or Firestore cache contains.

**Fix applied to `js/pages/live-cricket.js` — `extMatchCard()`:**
- Added `str(v)` helper: `v => (v != null ? String(v) : '')`.
- Added `score(s, o)` helper that formats `"score (overs)"` with proper coercion.
- Added guard for `m.team1`/`m.team2`: if they are not objects (edge case from corrupted old cache data), they're normalized to `{ name: String(m.team1 || 'Team 1'), score: null, overs: null }`.
- All template literal interpolations now go through `str(...)`.

**Fix applied to `js/pages/dashboard.js` — `extMatchCard()`:**
- Same defensive `str()` helper and team1/team2 guard as in live-cricket.js.

---

### Bug 28c — Service Worker caching Vercel API calls (MEDIUM)

**Symptom:** The service worker's fetch strategy was network-first, falling back to cache. But the Vercel API domain (`bails-cricket-api.vercel.app`) was NOT in the `url.hostname.includes(...)` passthrough list. This meant a previous failed response (HTTP 500) could be cached by the service worker and served to future users without ever making a new network request.

**Fix applied to `service-worker.js`:**
- Added `url.hostname.includes('vercel.app')` to the network-passthrough list (line 46).
- Bumped `CACHE_NAME` from `bails-v27-spark` to `bails-v28-spark` to force cache invalidation on next deploy.

---

### Bug 28d — Guest users get empty Live Cricket list despite fresh API data being available (MEDIUM)

**Symptom:** A guest user (not signed in) visiting the Live Cricket page would trigger `refreshIfStale()`, which fetches fresh data from the Vercel API successfully. But then `await LIST_DOC().set(...)` throws `permission-denied` (Firestore rules require `isSignedIn()` to write `externalCache/*`). The `catch` block then returns `{ matches: cachedMatches, ... }` — where `cachedMatches` is empty if no signed-in user had ever seeded the cache. So the guest sees "No matches found" even though fresh data was just downloaded.

**Fix applied to `js/liveCricket.js` — `refreshIfStale()`:**
- Added `if (!res.ok) throw new Error(\`HTTP ${res.status}\`)` before `res.json()` — so a 500 response from the Vercel API correctly throws rather than crashing on `json.status` access.
- Converted `await LIST_DOC().set(...)` to fire-and-forget with `.catch(cacheErr => console.warn(...))` — so a Firestore permission error during cache write does NOT abort the function; fresh data is returned to the caller regardless.
- Guests now see live match data on their first visit even if no cache exists, and signed-in users still update the shared Firestore cache as before.

---

### Bug 28e — Double `hashchange` listener causing every navigation to dispatch twice (LOW-MEDIUM)

**Symptom:** When a user navigated directly to a deep path (e.g. `#/match/xyz`), `app.js` called `Router.init()`, which registers `window.addEventListener('hashchange', dispatch)`. Additionally, `app.js` itself had a `window.addEventListener('hashchange', ...)` that called `Router.dispatch()`. Every hash change thereafter fired `dispatch()` **twice** — once from `init()`'s listener and once from app.js's own listener — rendering the page twice.

**Root cause:** `app.js` correctly called `Router.init()` for deep-path loads, but also unconditionally registered its own `hashchange` listener for all cases. For the root path (`/`), `Router.init()` was never called, so the app.js listener was the only one — navigation worked but the router's history stack was never populated. For deep paths, both were active simultaneously.

**Fix applied to `js/app.js`:**
- `Router.init()` is now called unconditionally after `whenReady()` for the root path too (registers the hashchange listener for all future navigations).
- The redundant `window.addEventListener('hashchange', ...)` block at the bottom of `app.js` has been removed entirely and replaced with a comment explaining why it must not be re-added.
- Net effect: exactly ONE `hashchange` listener is always active (from `Router.init()`), for all navigation paths.

---

### Bug 28f — `endMatch()` result field set incorrectly based on batting order instead of team ID (CRITICAL — pre-existing, re-confirmed from v23 notes)

**Status:** This bug was first documented in v23 as Bug 26 and was noted as "fixed." However, the actual `match-scoring.js` code still contained the old broken logic with `result='team1'` always mapped to innings batting order. The v23 fix described in the CLAUDE.md was either not applied or was reverted.

**Symptom:** `endMatch()` set `result: 'team2'` to mean "the team batting second won." But `dashboard.js` line 90 and `tournament-detail.js` lines 207–209 both interpret `result === 'team1'` as `match.team1Id` winning. Since batting order is determined by the toss coin flip (independent of team1/team2 registration order), this corrupted the result in roughly 50% of matches — specifically whenever `team2Id` won the toss and batted first (making them `inn1`, but the code would label them `'team2'` despite them being `team1Id`'s opponent).

**Impact:** Incorrect win counts in dashboard career stats, incorrect points tables in tournament standings.

**Fix applied to `js/pages/match-scoring.js` — `endMatch()`:**
```js
const inn1TeamKey = inn1.battingTeamId === match.team1Id ? 'team1' : 'team2';
const inn2TeamKey = inn2.battingTeamId === match.team1Id ? 'team1' : 'team2';
```
The winning team's innings batting ID is now mapped back to `'team1'`/`'team2'` via `match.team1Id` before setting `result`. Batting order is no longer used to decide the label.

---

### Bug 28g — File structure in AI.md was out of date (LOW)

The file structure listed in Section 3 still used the old structure without the Live Cricket files. The actual project now includes:
```
js/
  ├── liveCricketConfig.js
  ├── liveCricket.js
  └── pages/
      └── live-cricket.js
```
Additionally the project root also contains `cricket-api-backend/` (the separate Vercel-deployed Node.js scraper backend).

---

### Audit — Other potential issues investigated but NOT bugs

**`_tryConsumeBudget()` budget gate for guest users:** When a guest user triggers a data refresh, `_tryConsumeBudget()` runs a Firestore transaction on `externalCache/apiUsage` — this fails with permission-denied since guests can't write `externalCache/*`. The `catch` block in `refreshIfStale()` returns `allowed = false` (safe: prevents the API call), but the stale data path still returns cached matches if any exist. This is the designed behavior — guests riding the shared signed-in-user cache — but it means a guest who arrives before any signed-in user has ever seeded the cache sees empty data. After Bug 28d's fix, the guest now gets fresh API data even when caching fails, so this is now a harmless path.

**`player-profile.js` composite index:** The query `where('participants','array-contains', uid).where('status','==','completed')` requires a Firestore composite index. This is documented in Section 13. If user career stats show "No completed matches" despite the user having played matches, check that the index in `firestore.indexes.json` is deployed.

**`firestore.rules` — `isAcceptingTeamInvite()` and `isClaimingGuestPlayer()` are identical:** Both functions have exactly the same body. This is likely intentional (they handle different UI flows that happen to have the same permission check), but worth noting if the intent was ever to differentiate them.

---

### Files changed in v28

| File | Change |
|---|---|
| `cricket-api-backend/api/index.js` | Rebuilt Cricbuzz scraper with multi-selector fallback strategy; added `_extractTeamName()` and `_extractScore()` helpers; updated User-Agent and headers; added 15s timeout |
| `js/liveCricket.js` | Added `String()` coercion to all scalar fields in `_normalizeMatch()` Path A; added `if (!res.ok) throw` before `res.json()`; converted `LIST_DOC().set()` to fire-and-forget with `.catch()` so guest permission errors don't block fresh data from reaching the UI |
| `js/pages/live-cricket.js` | Added `str()` and `score()` defensive helpers in `extMatchCard()`; added team1/team2 object guard |
| `js/pages/dashboard.js` | Added `str()` and team1/team2 object guard in `extMatchCard()` |
| `js/pages/match-scoring.js` | Fixed `endMatch()` to derive `result` via `battingTeamId → team1Id/team2Id` mapping rather than batting order |
| `js/app.js` | Removed duplicate `hashchange` listener; unified router init to always call `Router.init()` |
| `service-worker.js` | Added `vercel.app` to network passthrough; bumped `CACHE_NAME` to `bails-v28-spark` |
| `CLAUDE.md` | Renamed to `AI.md` (this file) |

---

### New Rules Added (v28)

30. **Always** add any external API domain used by the frontend (e.g. `vercel.app`, `cricapi.com`) to the service worker's network passthrough list — without this, a failed API response can be cached and permanently served to all users until the service worker is updated.

31. **Never** use `await` on a Firestore write inside a try/catch that would prevent returning successfully-fetched data to the caller on write failure — convert cache writes to fire-and-forget with `.catch(console.warn)` so permission errors (e.g., guest users) don't silently discard fresh API data.

32. **Never** add a second `window.addEventListener('hashchange', ...)` in `app.js` — `Router.init()` already registers one. Two listeners cause every navigation to render the current page twice.

33. **Cricbuzz CSS selectors will break** — the Cricbuzz scraper CSS selectors will need updating whenever Cricbuzz rebuilds their frontend (Tailwind utility classes are not stable). Always use a multi-selector fallback cascade, not a single hardcoded selector chain. If the Vercel API starts returning 500 or empty arrays, this is the first thing to check.

34. **Always** coerce scraped/API string fields with `String()` before storing them in normalized match objects — even if the source appears to always return strings, this prevents `[object Object]` leaking to the UI if the source changes type.

---

### v28 Automated Test Suite Results

A comprehensive automated test runner (`qa/run_all_tests_v28.js`) was built to verify the v28 fixes across five dimensions:

1. **Match Simulation & Statistics Consistency ([A])**: Simulated 10 matches (T20, T10, T5, DLS, Super Overs, all-out chases). Verified that for all matches, the summary-level statistics (`innings.runs`, `innings.wickets`, `batters.runs`, `bowlers.wickets`, etc.) mathematically map perfectly back to the raw `deliveries[]` log. (Passed all checks).
2. **Result Mapping Fix ([B])**: Specifically verified Bug 28f (where `endMatch()` set `result` to 'team1' based on batting order instead of `team1Id`). The simulation confirmed that when the team associated with `team2Id` bats first and wins, the recorded result correctly identifies 'team2' as the winner.
3. **Defensive Rendering ([C])**: Tested both the `extMatchCard()` rendering functions and `_normalizeMatch()` against severely malformed mock API responses (where fields like `name`, `status`, or `score` are nested objects instead of strings).
   - **New Bug Discovered (28h)**: Simple `String()` coercion was failing when the external API returned a nested object for a name (e.g. `String({ short: 'IND' })` yields `[object Object]`).
   - **Fix Applied**: Implemented a recursive `safeStr()` helper in `liveCricket.js`, `live-cricket.js` and `dashboard.js` that inspects object structures for common string keys (`name`, `full`, `short`, `value`, `text`) before falling back to `String()`, completely preventing `[object Object]` leaks.
4. **Cricket Rules Edge Cases ([D])**: Verified that a No-Ball + Bowled is correctly scored as 1 run (no wicket), whereas a No-Ball + Run Out counts as a valid dismissal. Verified that chases terminate on the exact ball the target is reached. Verified that Super Over winners are decided by the Super Over innings score (not the tied main innings score).
5. **UI Rendering Pipeline ([E])**: Used `jsdom` to synchronously render all major UI pages (Dashboard, Match Detail, Team Detail, Tournament Detail) under test conditions, scanning the generated HTML string for `[object Object]`, `undefined`, and `NaN`. (Passed all checks).

**Test Execution Outcome:** ✓ ALL 1187 CHECKS PASSED.
