// BAILS — LIVE CRICKET PAGE  (v22 redesign)
// External reference scores (men's & women's) — not scored by Bails.
//
// LOADING MODEL:
// - The list view loads once per page visit via LiveCricket.refreshIfStale()
//   (shared cache + TTL + daily budget — see js/liveCricket.js).
// - The search box below filters that already-loaded list CLIENT-SIDE ONLY —
//   typing never triggers a network call.
// - Tapping into a specific match is the one action allowed to "search
//   deeper": LiveCricket.getMatchDetail() reuses the in-memory list data if
//   available (zero network cost, the common case) and only falls back to a
//   real API call for matches that aren't in today's list at all.
const LiveCricketPage = (() => {
  let _matches = [];
  let _fetchedAtMs = 0;
  let _statusFilter = 'all';   // all | live | upcoming | completed
  let _genderFilter = 'all';   // all | men | women
  let _searchQuery  = '';
  let _detailId = null;
  let _detailMatch = null;     // populated by getMatchDetail() — may include a trimmed scorecard
  let _pollInterval = null;

  function startPolling() {
    stopPolling();
    _pollInterval = setInterval(async () => {
      if (!location.hash.startsWith('#/live-cricket')) { stopPolling(); return; }
      const result = await LiveCricket.refreshIfStale(false);
      if (result.fetchedAtMs > _fetchedAtMs) {
        _matches = result.matches || [];
        _fetchedAtMs = result.fetchedAtMs || 0;
        if (_detailId) {
          const known = _matches.find(x => String(x.id) === String(_detailId)) || null;
          const dRes = await LiveCricket.getMatchDetail(_detailId, known);
          _detailMatch = dRes.match;
          renderDetail();
        } else {
          renderList();
        }
      }
    }, 30000);
  }

  function stopPolling() {
    if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
  }

  async function render(path, parts, params) {
    _detailId = params && params.id ? params.id : null;
    Utils.render(`<div class="page-loading"><div class="page-loading-spinner"></div><div>Loading live scores…</div></div>`);
    const result = await LiveCricket.refreshIfStale(false);
    _matches = result.matches || [];
    _fetchedAtMs = result.fetchedAtMs || 0;
    if (result.budgetExhausted) {
      Utils.toast('Showing the last known scores — a fresh check will happen soon.', 'info');
    }
    if (_detailId) { await loadAndRenderDetail(); } else { renderList(); }
    startPolling();
  }

  function _agoLabel() {
    if (!_fetchedAtMs) return 'never';
    const mins = Math.max(0, Math.round((Date.now() - _fetchedAtMs) / 60000));
    if (mins < 1) return 'just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.round(mins / 60);
    return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`;
  }

  function _filtered() {
    const q = _searchQuery.trim().toLowerCase();
    return _matches.filter(m => {
      if (_statusFilter === 'live'      && !m.isLive)      return false;
      if (_statusFilter === 'upcoming'  && !m.isUpcoming)  return false;
      if (_statusFilter === 'completed' && !m.isCompleted) return false;
      if (_genderFilter !== 'all' && m.gender !== _genderFilter) return false;
      if (q) {
        const hay = `${m.name} ${m.team1.name} ${m.team2.name} ${m.matchType} ${m.venue}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  function renderList() {
    Utils.setActivePage('');
    const list = _filtered();
    const hadFocus = document.activeElement && document.activeElement.id === 'ext-search-inp';

    Utils.render(`
      <div class="page-title" style="margin-bottom:2px">🌐 Live Cricket</div>
      <div class="page-sub" style="margin-bottom:4px">Men's &amp; women's matches from around the world</div>
      <div class="text-xs text-muted" style="margin-bottom:14px">
        Updated ${_agoLabel()} · <button class="btn-linklike" onclick="LiveCricketPage.forceRefresh()">🔄 Refresh</button>
      </div>

      <div class="form-group" style="margin-bottom:10px">
        <input type="text" id="ext-search-inp" placeholder="Search team, series, or venue…"
               value="${_searchQuery.replace(/"/g,'&quot;')}"
               oninput="LiveCricketPage.onSearchInput(event)"/>
      </div>

      <div class="chip-row" style="margin-bottom:8px">
        ${['all','live','upcoming','completed'].map(s => `
          <button class="filter-chip ${_statusFilter===s?'active':''}" onclick="LiveCricketPage.setStatusFilter('${s}')">
            ${s==='all'?'All':s==='live'?'🔴 Live':s==='upcoming'?'Upcoming':'Completed'}
          </button>`).join('')}
      </div>
      <div class="chip-row" style="margin-bottom:18px">
        ${['all','men','women'].map(g => `
          <button class="filter-chip ${_genderFilter===g?'active':''}" onclick="LiveCricketPage.setGenderFilter('${g}')">
            ${g==='all'?'All':g==='men'?"Men's":"Women's"}
          </button>`).join('')}
      </div>

      <div id="live-cricket-list">
        ${list.length ? list.map(m => extMatchCard(m)).join('') : `
          <div class="empty-state">
            <div class="empty-icon">🏏</div>
            <div class="empty-title">No matches found</div>
            <div class="empty-desc">${_matches.length ? 'Try a different search or filter.' : "Nothing cached yet — tap Refresh, or check back once today's quota resets."}</div>
          </div>`}
      </div>
    `);
    // Keep focus + cursor position in the search box across re-renders triggered by typing
    const inp = document.getElementById('ext-search-inp');
    if (inp && (hadFocus || _searchFocusPending)) {
      inp.focus();
      inp.setSelectionRange(inp.value.length, inp.value.length);
      _searchFocusPending = false;
    }
  }

  let _searchFocusPending = false;
  function onSearchInput(e) {
    _searchQuery = e.target.value;
    _searchFocusPending = true;
    renderList();
  }

  function extMatchCard(m) {
    const badge = m.isLive ? `<span class="match-badge badge-live">LIVE</span>`
                : m.isCompleted ? `<span class="match-badge badge-completed">DONE</span>`
                : `<span class="match-badge badge-upcoming">UPCOMING</span>`;
    const genderTag = m.gender === 'women' ? `<span class="ext-gender-tag">Women's</span>` : '';
    // Defensive helpers — prevent [object Object] if any field is an unexpected type
    const str = v => (v != null ? Utils.escapeHtml(String(v)) : '');
    // safeStr: handles the edge case where a name field is itself a nested object
    const safeStr = v => {
      if (v == null) return '';
      if (typeof v === 'string') return Utils.escapeHtml(v);
      if (typeof v === 'object' && !Array.isArray(v)) {
        const best = v.name || v.full || v.long || v.value || v.text || v.short || Object.values(v)[0];
        return best != null ? Utils.escapeHtml(String(best)) : '[?]';
      }
      return Utils.escapeHtml(String(v));
    };
    const score = (s, o) => s ? str(s) + (o != null ? ` (${str(o)})` : '') : '\u2014';
    const t1 = m.team1 && typeof m.team1 === 'object' ? m.team1 : { name: String(m.team1 || 'Team 1'), score: null, overs: null };
    const t2 = m.team2 && typeof m.team2 === 'object' ? m.team2 : { name: String(m.team2 || 'Team 2'), score: null, overs: null };
    return `<a href="#/live-cricket/${encodeURIComponent(m.id)}" class="card card-clickable match-card ext-match-card">
      <div class="match-card-teams">
        <div class="match-team-row">
          <span class="match-team-name">${safeStr(t1.name)}</span>
          <span class="match-team-score">${score(t1.score, t1.overs)}</span>
        </div>
        <div class="match-team-row">
          <span class="match-team-name">${safeStr(t2.name)}</span>
          <span class="match-team-score">${score(t2.score, t2.overs)}</span>
        </div>
      </div>
      <div class="match-meta">
        ${badge}
        ${genderTag}
        <span class="text-xs text-muted">${str(m.matchType)}${m.venue ? ' \u00b7 ' + str(m.venue) : ''}</span>
      </div>
      <div class="text-xs text-muted ext-source-tag">via ${str(m.source)}</div>
    </a>`;
  }

  // ── DETAIL VIEW ─────────────────────────────────────────────────────────
  // This is the "search-driven load" trigger: if the match is already sitting
  // in the in-memory list (_matches, from the page's own refreshIfStale call),
  // getMatchDetail() reuses it directly — zero network cost. Only a match
  // that isn't in today's list at all falls back to a real API call.
  async function loadAndRenderDetail() {
    const known = _matches.find(x => String(x.id) === String(_detailId)) || null;
    Utils.render(`<div class="page-loading"><div class="page-loading-spinner"></div><div>Loading match…</div></div>`);
    const result = await LiveCricket.getMatchDetail(_detailId, known);
    _detailMatch = result.match;
    if (result.budgetExhausted && !_detailMatch) {
      Utils.toast('Full detail unavailable right now — showing what we have.', 'info');
    }
    renderDetail();
  }

  function renderDetail() {
    const m = _detailMatch;
    if (!m) {
      Utils.render(`<div class="empty-state">
        <div class="empty-icon">🔍</div>
        <div class="empty-title">Match not found</div>
        <div class="empty-desc">It isn't in today's live list and couldn't be fetched separately.</div>
        <a href="#/live-cricket" class="btn btn-outline" style="margin-top:16px">← All Live Cricket</a>
      </div>`);
      return;
    }
    Utils.render(`
      <div class="page-title" style="margin-bottom:4px">${m.name}</div>
      <div class="text-xs text-muted" style="margin-bottom:18px">${m.matchType}${m.venue ? ' · '+m.venue : ''} · via ${m.source}</div>

      <div class="card card-body ext-detail-card">
        <div class="ext-detail-team-row">
          ${m.team1.logo ? `<img src="${m.team1.logo}" class="ext-team-logo"/>` : ''}
          <div style="flex:1">
            <div class="ext-detail-team-name">${m.team1.name}</div>
            <div class="ext-detail-score">${m.team1.score || 'Yet to bat'}${m.team1.overs!=null?` <span class="text-muted text-sm">(${m.team1.overs} ov)</span>`:''}</div>
          </div>
        </div>
        <div class="ext-detail-team-row">
          ${m.team2.logo ? `<img src="${m.team2.logo}" class="ext-team-logo"/>` : ''}
          <div style="flex:1">
            <div class="ext-detail-team-name">${m.team2.name}</div>
            <div class="ext-detail-score">${m.team2.score || 'Yet to bat'}${m.team2.overs!=null?` <span class="text-muted text-sm">(${m.team2.overs} ov)</span>`:''}</div>
          </div>
        </div>
        <div class="result-text" style="margin-top:10px">${m.statusText}</div>
      </div>

      ${renderScorecardHighlights(m.scorecard)}

      <div class="text-xs text-muted" style="margin-top:14px">
        Updated ${_agoLabel()} · <button class="btn-linklike" onclick="LiveCricketPage.forceRefresh()">🔄 Refresh</button>
      </div>
    `);
  }

  function renderScorecardHighlights(scorecard) {
    if (!Array.isArray(scorecard) || !scorecard.length) return '';
    return `<div style="margin-top:16px">
      <div class="scoring-section-label" style="margin-bottom:8px">Top Performers</div>
      ${scorecard.map(inn => `
        <div class="card card-body" style="margin-bottom:10px">
          <div style="font-weight:700;font-size:13px;margin-bottom:8px">${inn.title}</div>
          ${inn.batters ? inn.batters.map(b => `
            <div class="text-sm" style="display:flex;justify-content:space-between;padding:3px 0">
              <span>${b.name}</span><span class="text-muted">${b.r} (${b.b}b)${b.four?`, ${b.four}×4`:''}${b.six?`, ${b.six}×6`:''}</span>
            </div>`).join('') : ''}
          ${inn.bowlers ? inn.bowlers.map(b => `
            <div class="text-sm" style="display:flex;justify-content:space-between;padding:3px 0">
              <span>${b.name}</span><span class="text-muted">${b.w}/${b.r} (${b.o} ov)</span>
            </div>`).join('') : ''}
        </div>`).join('')}
    </div>`;
  }

  function setStatusFilter(s) { _statusFilter = s; renderList(); }
  function setGenderFilter(g) { _genderFilter = g; renderList(); }

  async function forceRefresh() {
    Utils.toast('Refreshing…', 'info');
    const result = await LiveCricket.refreshIfStale(true);
    _matches = result.matches || [];
    _fetchedAtMs = result.fetchedAtMs || 0;
    if (result.budgetExhausted) {
      Utils.toast('Showing the last known scores for now.', 'info');
    } else if (result.fromNetwork) {
      Utils.toast('Live scores updated.', 'success');
    } else {
      Utils.toast('Already up to date.', 'info');
    }
    if (_detailId) { await loadAndRenderDetail(); } else { renderList(); }
  }

  return { render, setStatusFilter, setGenderFilter, forceRefresh, onSearchInput };
})();
