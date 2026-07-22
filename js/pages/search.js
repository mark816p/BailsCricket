// BAILS — SEARCH  (v26 — global everything)
// Player search: Bails users + 32k official cricketers
// Team search:   Bails teams + 300+ international/domestic/franchise/Ranji teams
// Tournament:    Bails tournaments + 200+ global competitions
// Match search:  Bails matches + smart search UI with team autocomplete + date range
const SearchPage = (() => {
  let activeType = 'player';
  let _teamsList = null;        // lazy-loaded from backend
  let _tourneyList = null;      // lazy-loaded from backend
  let _matchTeam1 = '';
  let _matchTeam2 = '';
  let _matchDateFrom = '';
  let _matchDateTo   = '';

  const EXT_API = (typeof LiveCricketConfig !== 'undefined' && LiveCricketConfig.API_BASE)
    ? LiveCricketConfig.API_BASE
    : 'https://bails-cricket-api.vercel.app/api';

  // Country → flag emoji
  const FLAGS = {
    'India':'🇮🇳','Australia':'🇦🇺','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Pakistan':'🇵🇰',
    'South Africa':'🇿🇦','New Zealand':'🇳🇿','West Indies':'🏝️','Sri Lanka':'🇱🇰',
    'Bangladesh':'🇧🇩','Afghanistan':'🇦🇫','Zimbabwe':'🇿🇼','Ireland':'🇮🇪',
    'Netherlands':'🇳🇱','Scotland':'🏴󠁧󠁢󠁳󠁣󠁴󠁿','USA':'🇺🇸','United States':'🇺🇸',
    'Canada':'🇨🇦','UAE':'🇦🇪','Namibia':'🇳🇦','Nepal':'🇳🇵','Oman':'🇴🇲',
    'Uganda':'🇺🇬','Kenya':'🇰🇪','Papua New Guinea':'🇵🇬','Hong Kong':'🇭🇰',
    'Singapore':'🇸🇬','Asia':'🌏','International':'🌍',
  };
  function flag(country) { return FLAGS[country] || '🌐'; }

  // ── RENDER ─────────────────────────────────────────────────────────────
  function render() {
    Utils.setActivePage('search');
    _matchTeam1 = _matchTeam2 = _matchDateFrom = _matchDateTo = '';
    Utils.render(`
      <div class="page-title">Search</div>
      <div class="search-wrap">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
        <input class="search-input" type="search" id="search-input" placeholder="Search…" autocomplete="off"/>
      </div>
      <div style="display:flex;gap:8px;margin-bottom:16px;overflow-x:auto;padding-bottom:4px">
        ${['player','team','tournament','match'].map(t =>
          `<button class="btn btn-sm ${t===activeType?'btn-accent':'btn-outline'}" id="filter-${t}" onclick="SearchPage.setType('${t}')">
            ${{player:'👤 Player',team:'👕 Team',tournament:'🏆 Tournament',match:'🏏 Match'}[t]}
          </button>`).join('')}
      </div>
      <div id="search-results">${emptyState()}</div>
    `);
    const inp = document.getElementById('search-input');
    inp.oninput = e => debounceSearch(e.target.value);
    inp.focus();
    // For match tab, skip the text input and show smart UI immediately
    if (activeType === 'match') { inp.style.display = 'none'; renderMatchUI(); }
    else { inp.style.display = ''; inp.placeholder = placeholderFor(activeType); }
  }

  function placeholderFor(t) {
    return { player:'Search player name…', team:'Search team name…', tournament:'Search tournament…', match:'' }[t] || 'Search…';
  }
  function emptyState() {
    const descs = {
      player: 'Find Bails users and official cricketers worldwide.',
      team: 'Find international, IPL, Ranji, county, and franchise teams.',
      tournament: 'Find ICC events, domestic leagues, and historical tournaments.',
      match: 'Select teams and date range to find matches.'
    };
    return `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">Start searching</div><div class="empty-desc">${descs[activeType]||''}</div></div>`;
  }

  let debTimer;
  function debounceSearch(q) {
    clearTimeout(debTimer);
    debTimer = setTimeout(() => doSearch(q), 280);
  }

  function setType(t) {
    activeType = t;
    document.querySelectorAll('[id^="filter-"]').forEach(b => {
      b.className = `btn btn-sm ${b.id === 'filter-'+t ? 'btn-accent' : 'btn-outline'}`;
    });
    const inp = document.getElementById('search-input');
    if (!inp) return;
    if (t === 'match') {
      inp.style.display = 'none';
      document.getElementById('search-results').innerHTML = '';
      renderMatchUI();
    } else {
      inp.style.display = '';
      inp.placeholder = placeholderFor(t);
      inp.value = '';
      document.getElementById('search-results').innerHTML = emptyState();
    }
  }

  async function doSearch(q) {
    const res = document.getElementById('search-results');
    if (!res || activeType === 'match') return;
    if (!q || !q.trim()) { res.innerHTML = emptyState(); return; }
    res.innerHTML = `<div class="text-muted text-sm" style="padding:8px 0">Searching…</div>`;
    if (activeType === 'player')     await searchPlayers(q, res);
    else if (activeType === 'team')  await searchTeams(q, res);
    else if (activeType === 'tournament') await searchTournaments(q, res);
  }

  // ── PLAYER SEARCH ─────────────────────────────────────────────────────
  async function searchPlayers(q, res) {
    const qLow = q.toLowerCase().trim();
    const [bailsSnap, extResult] = await Promise.allSettled([
      db.collection('users').where('username','>=',qLow).where('username','<=',qLow+'\uf8ff').limit(10).get(),
      fetch(`${EXT_API}/searchPlayers?q=${encodeURIComponent(q)}&limit=15`).then(r=>r.ok?r.json():{data:[]}).catch(()=>({data:[]}))
    ]);
    const bailsUsers = bailsSnap.status==='fulfilled' ? bailsSnap.value.docs.map(d=>({...d.data(),id:d.id,_isBails:true})) : [];
    const official   = (extResult.status==='fulfilled' && extResult.value?.data) ? extResult.value.data.filter(p => !bailsUsers.some(u=>(u.displayName||'').toLowerCase()===p.name.toLowerCase())) : [];
    if (!bailsUsers.length && !official.length) { res.innerHTML = noResults(q); return; }

    let html = '<div class="list-gap">';
    for (const u of bailsUsers) {
      const pic = u.profilePic || Utils.initialsAvatar(u.displayName || '?');
      html += `<a href="#/player/${u.uid||u.id}" class="card card-clickable card-body" style="display:flex;align-items:center;gap:14px">
        <img src="${pic}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;flex-shrink:0"/>
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:15px">${Utils.escapeHtml(u.displayName || u.username || 'User')} <span class="ext-gender-tag" style="background:var(--accent);color:#000;margin-left:6px">Bails User</span></div>
          <div class="text-xs text-muted">@${Utils.escapeHtml(u.username||'')} ${u.battingStyle?`· ${Utils.escapeHtml(u.battingStyle)}`:''}</div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </a>`;
    }
    for (const p of official) {
      const roleColor = {'Batter':'var(--accent)','Bowler':'var(--blue)','All-rounder':'var(--gold)','Wicket-keeper':'var(--green)'}[p.role]||'var(--muted)';
      const pseudoUsername = '@' + p.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      html += `<div class="card card-body" style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:50%;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${flag(p.country)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px">${p.name}</div>
          <div class="text-xs text-muted" style="margin-bottom:2px">${pseudoUsername}</div>
          <div class="text-xs" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px">
            ${p.country?`<span class="text-muted">${p.country}</span>`:''}
            ${p.role?`<span style="color:${roleColor};font-weight:600">${p.role}</span>`:''}
            ${p.gender==='women'?`<span class="ext-gender-tag" style="font-size:10px">Women's</span>`:''}
            <span style="color:var(--muted);opacity:.6;font-size:10px">🌐 Official</span>
          </div>
        </div>
      </div>`;
    }
    html += '</div>';
    if (official.length) html += `<div class="text-xs text-muted" style="margin-top:8px;padding:0 4px">🌐 Official cricket data · 32k+ players</div>`;
    res.innerHTML = html;
  }

  // ── TEAM SEARCH ────────────────────────────────────────────────────────
  async function searchTeams(q, res) {
    const qLow = q.toLowerCase().trim();
    // Load teams list once, cache in memory
    if (!_teamsList) {
      try {
        const r = await fetch(`${EXT_API}/searchTeams?q=.&limit=9999`);
        _teamsList = r.ok ? (await r.json()).data || [] : [];
      } catch { _teamsList = []; }
    }

    // Bails internal teams
    let bailsSnap;
    try {
      bailsSnap = await db.collection('teams').where('nameLower','>=',qLow).where('nameLower','<=',qLow+'\uf8ff').limit(10).get();
    } catch { bailsSnap = null; }
    const bailsTeams = bailsSnap ? bailsSnap.docs.map(d=>({...d.data(),id:d.id,_isBails:true})) : [];

    // Official teams fuzzy search
    const official = _teamsList.filter(t => {
      const hay = `${t.name} ${t.country||''} ${t.type||''}`.toLowerCase();
      return hay.includes(qLow);
    }).slice(0,20);

    if (!bailsTeams.length && !official.length) { res.innerHTML = noResults(q); return; }

    let html = '<div class="list-gap">';
    for (const t of bailsTeams) {
      html += `<a href="#/team/${t.id}" class="card card-clickable card-body" style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:10px;background:var(--surface2);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px">
          ${t.picture?`<img src="${t.picture}" style="width:100%;height:100%;object-fit:cover"/>`:'👕'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px">${t.name||''}</div>
          <div class="text-xs text-muted">${t.tournamentName||''} · <span style="color:var(--accent)">Bails</span></div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </a>`;
    }
    for (const t of official) {
      const typeColor = {'International':'var(--accent)','IPL':'var(--gold)','BBL':'var(--blue)','PSL':'var(--green)','CPL':'var(--red)','Ranji Trophy':'var(--orange, #f90)','County Cricket':'var(--purple,#8b5cf6)'}[t.type]||'var(--muted)';
      html += `<div class="card card-body" style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${flag(t.country)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px">${t.name}</div>
          <div class="text-xs" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px">
            ${t.country?`<span class="text-muted">${t.country}</span>`:''}
            ${t.type?`<span style="color:${typeColor};font-weight:600">${t.type}</span>`:''}
            <span style="color:var(--muted);opacity:.6;font-size:10px">🌐 Official</span>
          </div>
        </div>
      </div>`;
    }
    html += '</div>';
    if (official.length) html += `<div class="text-xs text-muted" style="margin-top:8px;padding:0 4px">🌐 Official data · 300+ teams</div>`;
    res.innerHTML = html;
  }

  // ── TOURNAMENT SEARCH ──────────────────────────────────────────────────
  async function searchTournaments(q, res) {
    const qLow = q.toLowerCase().trim();
    if (!_tourneyList) {
      try {
        const r = await fetch(`${EXT_API}/searchTournaments?q=.&limit=9999`);
        _tourneyList = r.ok ? (await r.json()).data || [] : [];
      } catch { _tourneyList = []; }
    }
    // Bails internal tournaments
    let bailsSnap;
    try {
      bailsSnap = await db.collection('tournaments').where('nameLower','>=',qLow).where('nameLower','<=',qLow+'\uf8ff').limit(10).get();
    } catch { bailsSnap = null; }
    const bailsTourneys = bailsSnap ? bailsSnap.docs.map(d=>({...d.data(),id:d.id,_isBails:true})) : [];

    const official = _tourneyList.filter(t => {
      const hay = `${t.name} ${t.country||''} ${t.type||''}`.toLowerCase();
      return hay.includes(qLow);
    }).slice(0,20);

    if (!bailsTourneys.length && !official.length) { res.innerHTML = noResults(q); return; }

    let html = '<div class="list-gap">';
    for (const t of bailsTourneys) {
      html += `<a href="#/tournament/${t.id}" class="card card-clickable card-body" style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:10px;background:var(--surface2);overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:22px">
          ${t.picture?`<img src="${t.picture}" style="width:100%;height:100%;object-fit:cover"/>`:'🏆'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px">${t.name}</div>
          <div class="text-xs text-muted">${t.matchCount||0} matches · <span style="color:var(--accent)">Bails</span></div>
        </div>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </a>`;
    }
    for (const t of official) {
      const icc = t.type === 'ICC';
      html += `<div class="card card-body" style="display:flex;align-items:center;gap:14px">
        <div style="width:44px;height:44px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:24px;flex-shrink:0">${icc?'🏆':flag(t.country)}</div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px">${t.name}</div>
          <div class="text-xs" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:2px">
            ${t.country?`<span class="text-muted">${t.country}</span>`:''}
            ${t.type?`<span style="color:${icc?'var(--gold)':'var(--accent)'};font-weight:600">${t.type}</span>`:''}
            ${t.frequency?`<span class="text-muted">${t.frequency}</span>`:''}
            ${t.inception?`<span class="text-muted">est. ${t.inception}</span>`:''}
            <span style="color:var(--muted);opacity:.6;font-size:10px">🌐 Official</span>
          </div>
        </div>
      </div>`;
    }
    html += '</div>';
    if (official.length) html += `<div class="text-xs text-muted" style="margin-top:8px;padding:0 4px">🌐 Official data · 200+ tournaments</div>`;
    res.innerHTML = html;
  }

  // ── MATCH SEARCH — SMART UI ────────────────────────────────────────────
  async function renderMatchUI() {
    // Pre-load teams list for the autocomplete
    if (!_teamsList) {
      try {
        const r = await fetch(`${EXT_API}/searchTeams?q=.&limit=9999`);
        _teamsList = r.ok ? (await r.json()).data || [] : [];
      } catch { _teamsList = []; }
    }

    document.getElementById('search-results').innerHTML = `
      <div class="card card-body" style="margin-bottom:16px">
        <div style="font-weight:700;font-size:14px;margin-bottom:14px">🏏 Find a Match</div>

        <div class="form-group" style="position:relative;margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block">Team 1</label>
          <input type="text" id="match-team1-inp" class="form-control" placeholder="e.g. India" autocomplete="off"
                 oninput="SearchPage._teamAutocomplete(this,'match-team1-dd','_matchTeam1')"
                 value="${_matchTeam1}"/>
          <div id="match-team1-dd" class="search-autocomplete-dd" style="display:none"></div>
        </div>

        <div style="text-align:center;color:var(--muted);font-size:18px;margin-bottom:10px">vs</div>

        <div class="form-group" style="position:relative;margin-bottom:12px">
          <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block">Team 2 <span style="opacity:.5">(optional)</span></label>
          <input type="text" id="match-team2-inp" class="form-control" placeholder="e.g. Australia" autocomplete="off"
                 oninput="SearchPage._teamAutocomplete(this,'match-team2-dd','_matchTeam2')"
                 value="${_matchTeam2}"/>
          <div id="match-team2-dd" class="search-autocomplete-dd" style="display:none"></div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
          <div class="form-group">
            <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block">From date</label>
            <input type="date" id="match-date-from" class="form-control" value="${_matchDateFrom}"
                   onchange="SearchPage._dateChange('from',this.value)" style="color-scheme:dark"/>
          </div>
          <div class="form-group">
            <label style="font-size:12px;font-weight:600;color:var(--muted);margin-bottom:4px;display:block">To date</label>
            <input type="date" id="match-date-to" class="form-control" value="${_matchDateTo}"
                   onchange="SearchPage._dateChange('to',this.value)" style="color-scheme:dark"/>
          </div>
        </div>

        <button class="btn btn-accent btn-full" onclick="SearchPage._runMatchSearch()">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right:6px"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          Search Matches
        </button>
      </div>
      <div id="match-results"></div>
    `;
  }

  function _teamAutocomplete(inp, ddId, stateKey) {
    const q = inp.value.trim().toLowerCase();
    const dd = document.getElementById(ddId);
    if (!dd) return;
    if (q.length < 1) { dd.style.display = 'none'; return; }
    const matches = (_teamsList || []).filter(t => t.name.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { dd.style.display = 'none'; return; }
    dd.innerHTML = matches.map(t =>
      `<div class="autocomplete-item" onclick="SearchPage._pickTeam('${inp.id}','${ddId}','${stateKey}','${t.name.replace(/'/g,"\\'")}')">
        <span style="font-size:16px">${flag(t.country)}</span>
        <span style="font-weight:600">${t.name}</span>
        <span class="text-xs text-muted" style="margin-left:auto">${t.type||''}</span>
      </div>`
    ).join('');
    dd.style.display = 'block';
  }

  function _pickTeam(inpId, ddId, stateKey, name) {
    const inp = document.getElementById(inpId);
    if (inp) inp.value = name;
    const dd  = document.getElementById(ddId);
    if (dd)  dd.style.display = 'none';
    if (stateKey === '_matchTeam1') _matchTeam1 = name;
    else _matchTeam2 = name;
  }

  function _dateChange(which, val) {
    if (which === 'from') _matchDateFrom = val;
    else _matchDateTo = val;
  }

  async function _runMatchSearch() {
    if (!_matchTeam1) { Utils.toast('Please enter at least Team 1', 'error'); return; }
    const resultEl = document.getElementById('match-results');
    if (!resultEl) return;
    resultEl.innerHTML = `<div class="text-muted text-sm" style="padding:8px 0">Searching…</div>`;

    // Bails internal matches
    let bailsMatches = [];
    try {
      const t1Low = _matchTeam1.toLowerCase();
      const snap = await db.collection('matches')
        .where('team1NameLower', '>=', t1Low)
        .where('team1NameLower', '<=', t1Low + '\uf8ff')
        .limit(20).get();
      bailsMatches = snap.docs.map(d => ({ id: d.id, ...d.data(), _isBails: true }));
      if (_matchTeam2) {
        const t2Low = _matchTeam2.toLowerCase();
        bailsMatches = bailsMatches.filter(m =>
          (m.team2NameLower || '').includes(t2Low) || (m.team1NameLower || '').includes(t2Low)
        );
      }
    } catch(e) {}

    // External (Cricbuzz scrape via backend)
    let extMatches = [];
    try {
      const params = new URLSearchParams({ team1: _matchTeam1 });
      if (_matchTeam2) params.set('team2', _matchTeam2);
      if (_matchDateFrom) params.set('from', _matchDateFrom);
      if (_matchDateTo)   params.set('to',   _matchDateTo);
      const r = await fetch(`${EXT_API}/searchMatches?${params}`);
      if (r.ok) { const j = await r.json(); extMatches = j.data || []; }
    } catch(e) {}

    if (!bailsMatches.length && !extMatches.length) {
      resultEl.innerHTML = `<div class="empty-state"><div class="empty-icon">🏏</div><div class="empty-title">No matches found</div><div class="empty-desc">Try different teams or a wider date range.</div></div>`;
      return;
    }

    let html = '<div class="list-gap">';
    for (const m of bailsMatches) {
      const badge = m.status==='live'?`<span class="match-badge badge-live">LIVE</span>`:m.status==='upcoming'?`<span class="match-badge badge-upcoming">UPCOMING</span>`:`<span class="match-badge badge-completed">DONE</span>`;
      html += `<a href="#/match/${m.id}" class="card card-clickable match-card">
        <div class="match-card-teams">
          <div class="match-team-row"><span class="match-team-name">${m.team1Name||'?'}</span></div>
          <div class="match-team-row"><span class="match-team-name">${m.team2Name||'?'}</span></div>
        </div>
        <div class="match-meta">${badge}<span class="text-xs text-muted">${m.format||''} · ${Utils.fmtDate(m.scheduledAt)}</span><span style="color:var(--accent);font-size:10px;font-weight:600">Bails</span></div>
      </a>`;
    }
    for (const m of extMatches) {
      const badge = m.isLive?`<span class="match-badge badge-live">LIVE</span>`:m.isCompleted?`<span class="match-badge badge-completed">DONE</span>`:`<span class="match-badge badge-upcoming">UPCOMING</span>`;
      html += `<a href="#/live-cricket/${encodeURIComponent(m.id)}" class="card card-clickable match-card">
        <div class="match-card-teams">
          <div class="match-team-row"><span class="match-team-name">${m.team1?.name||m.team1||'?'}</span><span class="match-team-score">${m.team1?.score||''}</span></div>
          <div class="match-team-row"><span class="match-team-name">${m.team2?.name||m.team2||'?'}</span><span class="match-team-score">${m.team2?.score||''}</span></div>
        </div>
        <div class="match-meta">${badge}<span class="text-xs text-muted">${m.statusText||''}</span><span style="color:var(--muted);font-size:10px">🌐 Live</span></div>
      </a>`;
    }
    html += '</div>';
    resultEl.innerHTML = html;
  }

  function noResults(q) {
    return `<div class="empty-state"><div class="empty-icon">🔍</div><div class="empty-title">No results for "${Utils.escapeHtml(q)}"</div></div>`;
  }

  return { render, setType, _teamAutocomplete, _pickTeam, _dateChange, _runMatchSearch };
})();
