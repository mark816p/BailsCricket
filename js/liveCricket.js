// BAILS — LIVE CRICKET (EXTERNAL DATA) — CORE MODULE  (v22 redesign)
//
// Shows men's & women's live/upcoming/recent matches from CricketData.org
// (see js/liveCricketConfig.js for setup + the "why this provider" note).
// This is READ-ONLY reference data — never mixed with Bails' own scored
// matches, and never writable by end users.
//
// ── WHY THERE'S NO "UNLIMITED" TIER ─────────────────────────────────────────
// Every legitimate cricket data API was checked again for v22 (CricketData.org,
// RapidAPI wrappers, Sportmonks, Roanuz, EntitySport, elitesportapi). None of
// them offer a free-and-truly-unlimited tier — "unlimited" only exists on paid
// plans ($65+/mo territory). CricketData.org's 100/day free tier is still the
// best legitimate option. What changed in v22 is the LOADING STRATEGY, which
// matters far more than the raw quota number:
//
// ── v22 LOADING STRATEGY: search-driven, per-match cache, daily clear ──────
//   1. LIST TIER (unchanged from v21): one shared Firestore doc
//      (externalCache/liveMatches) holds today's "current matches" list.
//      Whichever client finds it stale is the one that spends 1 hit
//      refreshing it for everyone. Same TTL/budget mechanism as before.
//   2. SEARCH is entirely client-side against that already-loaded list —
//      typing in the search box costs ZERO extra API calls, it's just
//      filtering an array already sitting in memory.
//   3. MATCH-DETAIL TIER (new): tapping into a specific match is the "user
//      request" that's allowed to go deeper. If that match is already in the
//      list (the overwhelming common case), NO network call happens at all —
//      we just reuse what's already loaded. Only if a match has fallen off
//      the current list entirely (e.g. an old direct link) do we spend 1 hit
//      calling match_scorecard for that ONE match — and the result is cached
//      per-match (matchCache/{id}) so no other user ever re-fetches that same
//      match again today.
//   4. DAILY CLEAR: every cached doc carries a `date` field (UTC). Anything
//      read on a later date is treated as expired and gets overwritten on
//      next access — this is the practical equivalent of "clearing the cache
//      once a day" without needing a Cloud Functions cron job (Spark plan has
//      none). COMPLETED matches are the one exception: a finished match's
//      scorecard never changes again, so its cache entry is treated as valid
//      forever once isCompleted is true — this avoids ever re-spending a hit
//      on data that can't change.
//   5. COMPRESSION: every cached object is trimmed to only the fields the UI
//      actually renders (see _normalizeMatch / _trimScorecard below) — no raw
//      API payloads are ever stored verbatim.
const LiveCricket = (() => {
  const LIST_DOC   = () => db.collection('externalCache').doc('liveMatches');
  const USAGE_DOC  = () => db.collection('externalCache').doc('apiUsage');
  const MATCH_DOC  = id => db.collection('matchCache').doc(_safeDocId(id));

  function _todayUTC() { return new Date().toISOString().slice(0, 10); }

  // Firestore doc IDs can't contain '/', and have a length ceiling — sanitize
  // any external match id before using it as a doc key.
  function _safeDocId(id) {
    return String(id).replace(/[/\s]+/g, '_').slice(0, 300) || 'unknown';
  }

  // ── QUOTA GATE ──────────────────────────────────────────────────────────
  // Atomically checks + increments today's hit count. Returns true if an
  // external call is allowed, false if today's budget is already spent.
  // This is the ONLY place allowed to authorize a call to the external API.
  async function _tryConsumeBudget() {
    const today = _todayUTC();
    try {
      return await db.runTransaction(async tx => {
        const snap = await tx.get(USAGE_DOC());
        const data = snap.exists ? snap.data() : null;
        const hits = (data && data.date === today) ? (data.hits || 0) : 0;
        if (hits >= LiveCricketConfig.DAILY_HIT_BUDGET) return false;
        tx.set(USAGE_DOC(), { date: today, hits: hits + 1 }, { merge: false });
        return true;
      });
    } catch (e) {
      console.warn('LiveCricket budget check failed — skipping external call to be safe:', e);
      return false;
    }
  }

  // ── GENDER CLASSIFIER ───────────────────────────────────────────────────
  // No explicit gender field exists upstream — "Women/Women's" in the match
  // name, team names, or series name is the standard ICC/board convention.
  function classifyGender(raw, t1, t2) {
    const hay = `${raw.name || ''} ${t1 || ''} ${t2 || ''} ${raw.series || ''}`.toLowerCase();
    return /\bwomen'?s?\b/.test(hay) ? 'women' : 'men';
  }

  // ── NORMALIZER (list tier) — lean/compressed on purpose ────────────────
  // Handles two API shapes:
  //   1. Custom Bails backend (Vercel scraper): already returns structured
  //      objects { team1: { name, logo, score, overs }, team2: {...}, ... }
  //   2. CricketData.org (legacy): returns flat arrays { teams: [], score: [], teamInfo: [] }
  // We detect which shape we have by checking if team1 is already an object
  // with a string .name — if so, pass through directly to avoid double-wrapping
  // (which previously caused "[object Object]" rendering everywhere).
  function _normalizeMatch(raw) {
    // ── PATH A: Already-normalized shape (our custom Vercel scraper backend) ──
    if (raw.team1 && typeof raw.team1 === 'object' && typeof raw.team1.name === 'string') {
      // Defensive String() coercion on every field — prevents [object Object]
      // in template literals if a field unexpectedly comes back as an object
      // from Firestore or a partially-broken API response.
      const s = v => (v != null && v !== '' && v !== false) ? String(v) : null;
      // safeStr: if a value is itself a nested object (e.g. { short:'IND', full:'India' })
      // extract the most useful string from known keys before calling String().
      const safeStr = v => {
        if (v == null) return null;
        if (typeof v === 'string') return v || null;
        if (typeof v === 'object' && !Array.isArray(v)) {
          const best = v.name || v.full || v.long || v.value || v.text || v.short || Object.values(v)[0];
          return best != null ? String(best) : null;
        }
        return String(v) || null;
      };
      return {
        id:         raw.id || `${safeStr(raw.team1.name)}-${safeStr(raw.team2.name)}-${safeStr(raw.dateGMT) || ''}`.replace(/\s+/g, '_'),
        name:       safeStr(raw.name) || `${safeStr(raw.team1.name)} vs ${safeStr(raw.team2.name)}`,
        matchType:  String(safeStr(raw.matchType) || 'MATCH').toUpperCase(),
        statusText: safeStr(raw.statusText) || safeStr(raw.status) || (raw.isLive ? 'Live' : raw.isCompleted ? 'Completed' : 'Upcoming'),
        isLive:     !!raw.isLive,
        isUpcoming: !!raw.isUpcoming,
        isCompleted: !!raw.isCompleted,
        venue:      safeStr(raw.venue) || '',
        dateGMT:    safeStr(raw.dateGMT) || safeStr(raw.dateTimeGMT) || '',
        team1:      { name: safeStr(raw.team1.name) || 'Team 1', logo: raw.team1.logo || null, score: safeStr(raw.team1.score), overs: safeStr(raw.team1.overs) },
        team2:      { name: safeStr(raw.team2.name) || 'Team 2', logo: raw.team2.logo || null, score: safeStr(raw.team2.score), overs: safeStr(raw.team2.overs) },
        gender:     safeStr(raw.gender) || classifyGender(raw, safeStr(raw.team1.name), safeStr(raw.team2.name)),
        source:     safeStr(raw.source) || 'Bails Custom API'
      };
    }

    // ── PATH B: CricketData.org flat-array shape (legacy / fallback) ────────
    const teams    = Array.isArray(raw.teams)    ? raw.teams    : [];
    const teamInfo = Array.isArray(raw.teamInfo) ? raw.teamInfo : [];
    const scores   = Array.isArray(raw.score)    ? raw.score    : [];

    const t1 = teams[0] || 'Team 1';
    const t2 = teams[1] || 'Team 2';

    const findLogo  = name => (teamInfo.find(t => t && t.name === name) || {}).img || null;
    const findScore = (name, idx) => {
      const byName = scores.find(s => s && s.inning && name && s.inning.toLowerCase().includes(String(name).toLowerCase()));
      return byName || scores[idx] || null;
    };

    const s1 = findScore(t1, 0);
    const s2 = findScore(t2, 1);
    const fmtScore = s => s ? `${s.r ?? 0}/${s.w ?? 0}` : null;
    const fmtOvers = s => (s && s.o != null) ? s.o : null;

    const started = !!raw.matchStarted;
    const ended   = !!raw.matchEnded;

    return {
      id:        raw.id || raw.matchId || (`${t1}-${t2}-${raw.dateTimeGMT || raw.date || ''}`).replace(/\s+/g, '_'),
      name:      raw.name || `${t1} vs ${t2}`,
      matchType: (raw.matchType || '').toUpperCase() || 'MATCH',
      statusText: raw.status || (ended ? 'Completed' : started ? 'Live' : 'Upcoming'),
      isLive:    started && !ended,
      isUpcoming: !started,
      isCompleted: ended,
      venue:     raw.venue || '',
      dateGMT:   raw.dateTimeGMT || raw.date || '',
      team1: { name: t1, logo: findLogo(t1), score: fmtScore(s1), overs: fmtOvers(s1) },
      team2: { name: t2, logo: findLogo(t2), score: fmtScore(s2), overs: fmtOvers(s2) },
      gender: classifyGender(raw, t1, t2),
      source: 'CricketData.org'
    };
  }

  // ── SCORECARD TRIMMER (match-detail fallback tier) ─────────────────────
  // match_scorecard's exact field names are less certain than currentMatches
  // (older CricAPI wrappers used capitalised R/M/B/4s/6s/SR keys, current v1
  // docs suggest lowercase r/b/4s/6s/sr — this tries both, and degrades to
  // "no extra detail" rather than crashing if neither shape matches).
  // Only the top 3 batters (by runs) and top 3 bowlers (by wickets) per
  // innings are kept — this is the actual "compress as much as possible"
  // lever: a full XI's worth of batting/bowling lines is dropped in favour
  // of just the highlights, which is what a summary view needs anyway.
  function _trimScorecard(raw) {
    const innings = Array.isArray(raw.scorecard) ? raw.scorecard : [];
    if (!innings.length) return null;

    const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };

    return innings.map(inn => {
      // scores is sometimes [[...]] (nested) and sometimes [...] flat depending
      // on API generation — flatten defensively either way.
      const rawRows = Array.isArray(inn.scores) ? inn.scores.flat() : [];
      const isBowling = /bowl/i.test(inn.title || '');

      if (isBowling) {
        const bowlers = rawRows.map(r => ({
          name: r.bowler || r.name || '?',
          o: r.O ?? r.o ?? 0,
          r: num(r.R ?? r.r),
          w: num(r.W ?? r.w)
        })).sort((a,b) => b.w - a.w).slice(0, 3);
        return { title: inn.title || 'Bowling', bowlers };
      }
      const batters = rawRows.map(r => ({
        name: r.batsman || r.name || '?',
        r: num(r.R ?? r.r),
        b: num(r.B ?? r.b),
        four: num(r['4s']),
        six:  num(r['6s'])
      })).sort((a,b) => b.r - a.r).slice(0, 3);
      return { title: inn.title || 'Batting', batters };
    }).filter(x => (x.batters && x.batters.length) || (x.bowlers && x.bowlers.length));
  }

  // ── LIST TIER: get whatever is cached right now, no network/budget check ──
  async function getCachedList() {
    try {
      const snap = await LIST_DOC().get();
      if (!snap.exists) return { matches: [], fetchedAtMs: 0 };
      const data = snap.data();
      const fetchedAtMs = data.fetchedAt?.toMillis ? data.fetchedAt.toMillis() : 0;
      return { matches: data.matches || [], fetchedAtMs };
    } catch (e) {
      console.warn('LiveCricket getCachedList failed:', e);
      return { matches: [], fetchedAtMs: 0 };
    }
  }

  // ── LIST TIER: main entry point for the list/search view ───────────────
  // force=true still goes through the budget gate — a manual Refresh tap
  // cannot bypass the daily quota, it only bypasses the TTL staleness check.
  async function refreshIfStale(force = false) {
    let cachedMatches = [], fetchedAtMs = 0;
    try {
      const snap = await LIST_DOC().get();
      if (snap.exists) {
        const data = snap.data();
        cachedMatches = data.matches || [];
        fetchedAtMs   = data.fetchedAt?.toMillis ? data.fetchedAt.toMillis() : 0;
      }
    } catch (e) {
      console.warn('LiveCricket list cache read failed:', e);
    }

    const hasLive = cachedMatches.some(m => m.isLive);
    const ttl     = hasLive ? LiveCricketConfig.TTL_WHEN_LIVE_MS : LiveCricketConfig.TTL_WHEN_IDLE_MS;
    const isStale = fetchedAtMs === 0 || (Date.now() - fetchedAtMs) > ttl;

    if (!isStale && !force) {
      return { matches: cachedMatches, fetchedAtMs, fromNetwork: false, budgetExhausted: false };
    }

    const allowed = await _tryConsumeBudget();
    if (!allowed) {
      return { matches: cachedMatches, fetchedAtMs, fromNetwork: false, budgetExhausted: true };
    }

    try {
      const url = `${LiveCricketConfig.API_BASE}/currentMatches?apikey=${encodeURIComponent(LiveCricketConfig.API_KEY)}&offset=0`;
      const res  = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      if (json.status !== 'success' || !Array.isArray(json.data)) {
        throw new Error(json.status || 'Unexpected response shape');
      }
      const matches = json.data.map(_normalizeMatch);
      // Cache write: fire-and-forget — don't let a permission error (e.g., guest
      // user who is not signed in) prevent fresh data from being returned to the UI.
      LIST_DOC().set({
        matches,
        fetchedAt: firebase.firestore.FieldValue.serverTimestamp(),
        date: _todayUTC()
      }).catch(cacheErr => console.warn('LiveCricket cache write failed (non-fatal):', cacheErr.message));
      return { matches, fetchedAtMs: Date.now(), fromNetwork: true, budgetExhausted: false };
    } catch (e) {
      console.warn('LiveCricket external fetch failed — serving stale cache:', e);
      return { matches: cachedMatches, fetchedAtMs, fromNetwork: false, budgetExhausted: false, error: true };
    }
  }

  // ── MATCH-DETAIL TIER: the "search-driven, load-once, share-with-everyone" part ──
  // knownListMatch: pass the match object from the already-loaded list if you
  // have it (common case) — this avoids ANY network call, since everything
  // the summary view needs is already sitting in memory. Only when a match
  // can't be found anywhere (list cache miss AND matchCache miss) does this
  // spend a real hit on match_scorecard, and that result is then shared with
  // every other user who looks at the same match for the rest of the day.
  async function getMatchDetail(matchId, knownListMatch = null) {
    const ref = MATCH_DOC(matchId);
    const today = _todayUTC();

    // 1. Already cached today (or permanently, if completed)?
    try {
      const snap = await ref.get();
      if (snap.exists) {
        const data = snap.data();
        const stillValid = data.isCompleted || data.date === today;
        if (stillValid) return { match: data, fromNetwork: false, budgetExhausted: false };
      }
    } catch (e) {
      console.warn('LiveCricket matchCache read failed:', e);
    }

    // 2. Not cached (or expired) — do we already have it from the live list?
    //    This is the common path and costs zero extra network calls.
    if (knownListMatch) {
      const toStore = { ...knownListMatch, scorecard: null, date: today };
      try { await ref.set(toStore); } catch (e) { console.warn('LiveCricket matchCache write failed:', e); }
      return { match: toStore, fromNetwork: false, budgetExhausted: false };
    }

    // 3. Genuinely unknown match (e.g. a stale direct link) — fall back to a
    //    real API call, budget-gated like everything else.
    const allowed = await _tryConsumeBudget();
    if (!allowed) return { match: null, fromNetwork: false, budgetExhausted: true };

    try {
      const url = `${LiveCricketConfig.API_BASE}/match_scorecard?apikey=${encodeURIComponent(LiveCricketConfig.API_KEY)}&id=${encodeURIComponent(matchId)}`;
      const res  = await fetch(url);
      const json = await res.json();
      if (json.status !== 'success' || !json.data) throw new Error(json.status || 'Unexpected response shape');

      const base = _normalizeMatch(json.data);
      let scorecard = null;
      try { scorecard = _trimScorecard(json.data); } catch (e) { console.warn('Scorecard shape unrecognised, showing summary only:', e); }

      const toStore = { ...base, scorecard, date: today };
      await ref.set(toStore);
      return { match: toStore, fromNetwork: true, budgetExhausted: false };
    } catch (e) {
      console.warn('LiveCricket match-detail fetch failed:', e);
      return { match: null, fromNetwork: false, budgetExhausted: false, error: true };
    }
  }

  return { refreshIfStale, getCachedList, getMatchDetail, classifyGender };
})();
