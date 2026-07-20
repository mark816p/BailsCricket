// BAILS — MATCH SCORING (v20)
const MatchScoringPage = (() => {
  let matchId, match;
  let _scoreState = { isNoBall:false, isWide:false, runs:null, boundary:null, wicket:null };
  let customOvers = 10, reviews = 2, electChoice = 'bat', ppOvers = 6;

  // ── INNINGS NORMALIZER ────────────────────────────────────────────
  // Converts Firestore-corrupted map-shaped innings back to a real JS array
  // and fills defaults so scoring code can always assume a clean structure.
  function normalizeInnings(m) {
    if (!m) return;
    if (!m.innings) { m.innings = []; return; }
    if (!Array.isArray(m.innings)) {
      const keys = Object.keys(m.innings).map(Number).sort((a, b) => a - b);
      m.innings = keys.map(k => m.innings[String(k)] || m.innings[k] || {});
    }
    m.innings = m.innings.map(inn => ({
      // Bug B fix: include team identity fields in defaults so undefined never
      // leaks into the UI even for old/corrupted innings documents
      battingTeamId: '', battingTeamName: '',
      bowlingTeamId: '', bowlingTeamName: '',
      runs: 0, wickets: 0, balls: 0,
      batters: {}, bowlers: {}, partnerships: [],
      powerplayRuns: 0, powerplayWickets: 0,
      striker: null, nonStriker: null, currentBowler: null,
      currentPartnership: null,
      ...inn
    }));
  }

  // ── BATTER/BOWLER REPAIR ──────────────────────────────────────────
  // Bug 7/8: if striker/nonStriker/currentBowler are set but their entries
  // are missing from batters/bowlers (Firestore corruption from v18), fetch
  // names from the team docs and write minimal entries so scoring can proceed.
  async function repairMissingBatterEntries() {
    const inn = currentInnings();
    if (!inn || !inn.striker) return;
    const idx = inningsIdx();
    const missingBatters  = [inn.striker, inn.nonStriker].filter(u => u && !inn.batters?.[u]);
    const missingBowlers  = [inn.currentBowler].filter(u => u && !inn.bowlers?.[u]);
    if (!missingBatters.length && !missingBowlers.length) return;

    try {
      const [batSnap, bowlSnap] = await Promise.all([
        inn.battingTeamId  ? db.collection('teams').doc(inn.battingTeamId).get()  : Promise.resolve(null),
        inn.bowlingTeamId  ? db.collection('teams').doc(inn.bowlingTeamId).get()  : Promise.resolve(null)
      ]);
      const batPlayers  = Object.entries((batSnap?.exists  ? batSnap.data()  : {}).players||{}).map(([u,p])=>({uid:u,...p}));
      const bowlPlayers = Object.entries((bowlSnap?.exists ? bowlSnap.data() : {}).players||{}).map(([u,p])=>({uid:u,...p}));

      const upd = {};
      missingBatters.forEach(uid => {
        const p    = batPlayers.find(x => x.uid === uid);
        const name = p?.name || uid;
        upd[`innings.${idx}.batters.${uid}`] = { uid, name, runs:0, balls:0, fours:0, sixes:0, out: uid !== inn.striker };
      });
      missingBowlers.forEach(uid => {
        const p    = bowlPlayers.find(x => x.uid === uid);
        const name = p?.name || uid;
        upd[`innings.${idx}.bowlers.${uid}`] = { uid, name, runs:0, balls:0, wickets:0 };
      });

      await db.collection('matches').doc(matchId).update(upd);
      match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
      normalizeInnings(match);
      Utils.toast('Match data auto-repaired.', 'success');
    } catch(e) {
      console.warn('repairMissingBatterEntries failed:', e);
    }
  }

  // ── RENDER ENTRY POINT ────────────────────────────────────────────
  async function render(path, parts, params) {
    matchId = params.id;
    Utils.render(`<div class="page-loading"><div class="page-loading-spinner"></div><div>Loading…</div></div>`);
    try {
      await Auth.whenReady();
      const snap = await db.collection('matches').doc(matchId).get();
      if (!snap.exists) { Utils.render('<p class="text-muted" style="padding:40px;text-align:center">Match not found.</p>'); return; }
      match = { id: snap.id, ...snap.data() };
      normalizeInnings(match);

      if (!Auth.isAdmin(match)) {
        Utils.render(`<div class="empty-state"><div class="empty-icon">🔐</div><div class="empty-title">Not authorised</div><div class="empty-desc">Only match admins can score.</div><a href="#/match/${matchId}" class="btn btn-outline" style="margin-top:16px">← Back</a></div>`);
        return;
      }
      if (match.status === 'upcoming') {
        renderSetup();
      } else if (match.status === 'live') {
        const inn = currentInnings();
        // Bug 3 fix: only show the 2nd innings opener modal if we genuinely have
        // 2+ innings AND the last innings hasn't had its openers selected yet.
        // (Previously this fired if ANY innings had striker==null, which happened
        // when Bug 1 incorrectly ended the 1st innings early.)
        const needsOpeners = inn
          && match.innings.length > 1
          && inn.striker == null
          && inn.nonStriker == null;
        // Bug 7/8 fix: repair missing batter/bowler map entries before rendering
        if (!needsOpeners) await repairMissingBatterEntries();
        renderScoring();
        if (needsOpeners) await setupNewInningsOpeners();
      } else {
        Utils.render(`<div class="empty-state"><div class="empty-icon">🏁</div><div class="empty-title">Match completed</div><div class="empty-desc">${match.resultText||''}</div><a href="#/match/${matchId}" class="btn btn-accent" style="margin-top:16px">View Scorecard</a></div>`);
      }
    } catch(e) {
      console.error('match-scoring render error:', e);
      Utils.render(`<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Failed to load</div><div class="empty-desc">${e.message||'Check connection and try again.'}</div><button class="btn btn-accent" style="margin-top:16px" onclick="MatchScoringPage.render()">Retry</button></div>`);
    }
  }

  // ── SETUP ─────────────────────────────────────────────────────────
  function renderSetup() {
    _setupTeamsCache = null;
    Utils.render(`
      <a href="#/match/${matchId}" class="back-btn" style="margin-bottom:16px">← Back to match</a>
      <div class="page-title" style="margin-bottom:4px">Match Setup</div>
      <div class="page-sub" style="margin-bottom:20px">${match.team1Name} vs ${match.team2Name}</div>

      <div class="card card-body" style="margin-bottom:14px">
        <div class="form-group">
          <label class="form-label">Format</label>
          <select id="setup-format" onchange="MatchScoringPage.onFormatChange()">
            ${Object.keys(Utils.FORMATS).map(f=>`<option value="${f}" ${match.format===f?'selected':''}>${f}</option>`).join('')}
          </select>
        </div>
        <div id="custom-overs-wrap" class="form-group hidden">
          <label class="form-label">Custom Overs</label>
          <div class="stepper-row">
            <button class="stepper-btn" onclick="MatchScoringPage.adjustOvers(-1)">−</button>
            <span id="custom-overs-val" class="stepper-val">10</span>
            <button class="stepper-btn" onclick="MatchScoringPage.adjustOvers(1)">+</button>
          </div>
        </div>
        <div class="form-grid-2">
          <div class="form-group">
            <label class="form-label">Reviews per team</label>
            <div class="stepper-row">
              <button class="stepper-btn" onclick="MatchScoringPage.adjustReviews(-1)">−</button>
              <span id="reviews-val" class="stepper-val">2</span>
              <button class="stepper-btn" onclick="MatchScoringPage.adjustReviews(1)">+</button>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Powerplay Overs</label>
            <div class="stepper-row">
              <button class="stepper-btn" onclick="MatchScoringPage.adjustPP(-1)">−</button>
              <span id="pp-overs-val" class="stepper-val">${match.powerplayOvers||6}</span>
              <button class="stepper-btn" onclick="MatchScoringPage.adjustPP(1)">+</button>
            </div>
          </div>
        </div>
      </div>

      <div class="card card-body" style="margin-bottom:14px">
        <div class="form-group">
          <label class="form-label">Toss won by</label>
          <select id="toss-winner" onchange="MatchScoringPage.loadSetupPlayers()">
            <option value="${match.team1Id}">${match.team1Name}</option>
            <option value="${match.team2Id}">${match.team2Name}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label">Elected to</label>
          <div class="toggle-btn">
            <button class="toggle-opt active" id="elect-bat" onclick="MatchScoringPage.setElect('bat')">Bat First</button>
            <button class="toggle-opt" id="elect-bowl" onclick="MatchScoringPage.setElect('bowl')">Bowl First</button>
          </div>
        </div>
      </div>

      <div class="card card-body" style="margin-bottom:14px">
        <div class="form-group">
          <label class="form-label">Opening Batters <span class="text-muted text-xs">(batting team)</span></label>
          <select id="striker-sel" style="margin-bottom:8px"><option value="">Striker…</option></select>
          <select id="nonstriker-sel"><option value="">Non-Striker…</option></select>
        </div>
        <div class="form-group">
          <label class="form-label">Opening Bowler <span class="text-muted text-xs">(bowling team)</span></label>
          <select id="bowler-sel"><option value="">Bowler…</option></select>
        </div>
      </div>

      <button class="btn btn-accent btn-full" id="start-match-btn" style="font-size:16px;padding:16px;font-weight:900" onclick="MatchScoringPage.startMatch()">▶  Start Match</button>
    `);
    onFormatChange();
    loadSetupPlayers();
  }

  function onFormatChange() {
    const fmt = document.getElementById('setup-format')?.value;
    document.getElementById('custom-overs-wrap')?.classList.toggle('hidden', fmt !== 'Custom');
  }
  function adjustOvers(d)   { customOvers = Math.max(1, customOvers+d); const el=document.getElementById('custom-overs-val'); if(el) el.textContent=customOvers; }
  function adjustReviews(d) { reviews = Math.max(0, reviews+d); const el=document.getElementById('reviews-val'); if(el) el.textContent=reviews; }
  function adjustPP(d)      { ppOvers  = Math.max(0, (ppOvers||0)+d); const el=document.getElementById('pp-overs-val'); if(el) el.textContent=ppOvers; }
  function setElect(e) {
    electChoice = e;
    document.getElementById('elect-bat')?.classList.toggle('active', e==='bat');
    document.getElementById('elect-bowl')?.classList.toggle('active', e==='bowl');
    loadSetupPlayers();
  }

  let _setupTeamsCache = null;
  async function loadSetupPlayers() {
    if (!_setupTeamsCache) {
      const [t1Snap, t2Snap] = await Promise.all([
        db.collection('teams').doc(match.team1Id).get(),
        db.collection('teams').doc(match.team2Id).get()
      ]);
      const t1 = t1Snap.exists ? t1Snap.data() : {};
      const t2 = t2Snap.exists ? t2Snap.data() : {};
      const t1Players = Object.entries(t1.players||{}).map(([uid,p]) => ({ uid, ...p }));
      const t2Players = Object.entries(t2.players||{}).map(([uid,p]) => ({ uid, ...p }));
      const allUids = [...new Set([...t1Players,...t2Players].filter(p=>!p.uid.startsWith('guest_')).map(p=>p.uid))];
      const profiles = {};
      await Promise.all(allUids.map(async uid => {
        try { const s=await db.collection('users').doc(uid).get(); if(s.exists) profiles[uid]=s.data().displayName; } catch(_){}
      }));
      _setupTeamsCache = { t1Players, t2Players, profiles };
    }
    const { t1Players, t2Players, profiles } = _setupTeamsCache;
    const fillSel = (selId, players, placeholder) => {
      const sel = document.getElementById(selId); if (!sel) return;
      sel.innerHTML = `<option value="">${placeholder}</option>`;
      players.forEach(p => {
        const o = document.createElement('option');
        const name = profiles[p.uid] || p.name || p.uid;
        o.value = p.uid; o.textContent = name; o.dataset.name = name;
        sel.appendChild(o);
      });
    };
    const tossWinner  = document.getElementById('toss-winner')?.value || match.team1Id;
    const battingFirst = tossWinner===match.team1Id ? (electChoice==='bat'?match.team1Id:match.team2Id) : (electChoice==='bat'?match.team2Id:match.team1Id);
    const batPlayers  = battingFirst===match.team1Id ? t1Players : t2Players;
    const bowlPlayers = battingFirst===match.team1Id ? t2Players : t1Players;
    fillSel('striker-sel',    batPlayers,  'Striker…');
    fillSel('nonstriker-sel', batPlayers,  'Non-Striker…');
    fillSel('bowler-sel',     bowlPlayers, 'Bowler…');
  }

  async function startMatch() {
    const btn = document.getElementById('start-match-btn');
    if (btn?.disabled) return;
    if (btn) { btn.disabled=true; btn.textContent='Starting…'; }
    try {
      const fmt    = document.getElementById('setup-format').value;
      const overs  = fmt==='Custom' ? customOvers : Utils.FORMATS[fmt];
      const tossWinnerId   = document.getElementById('toss-winner').value;
      const tossWinnerName = tossWinnerId===match.team1Id ? match.team1Name : match.team2Name;
      const striker = document.getElementById('striker-sel').value;
      const nonStr  = document.getElementById('nonstriker-sel').value;
      const bowler  = document.getElementById('bowler-sel').value;
      if (!striker||!nonStr||!bowler||striker===nonStr) { Utils.toast('Select valid opening players.','error'); if(btn){btn.disabled=false;btn.textContent='▶  Start Match';} return; }
      const strikerEl = document.getElementById('striker-sel');
      const nonStrEl  = document.getElementById('nonstriker-sel');
      const bowlerEl  = document.getElementById('bowler-sel');
      const sName  = strikerEl.options[strikerEl.selectedIndex]?.dataset.name  || striker;
      const nsName = nonStrEl.options[nonStrEl.selectedIndex]?.dataset.name    || nonStr;
      const bName  = bowlerEl.options[bowlerEl.selectedIndex]?.dataset.name    || bowler;
      const battingTeamId   = tossWinnerId===match.team1Id ? (electChoice==='bat'?match.team1Id:match.team2Id) : (electChoice==='bat'?match.team2Id:match.team1Id);
      const bowlingTeamId   = battingTeamId===match.team1Id ? match.team2Id : match.team1Id;
      const battingTeamName = battingTeamId===match.team1Id ? match.team1Name : match.team2Name;
      const bowlingTeamName = bowlingTeamId===match.team1Id ? match.team1Name : match.team2Name;
      const innings0 = {
        battingTeamId, battingTeamName, bowlingTeamId, bowlingTeamName,
        runs:0, wickets:0, balls:0, partnerships:[], powerplayRuns:0, powerplayWickets:0,
        batters: {
          [striker]: { uid:striker, name:sName,  runs:0,balls:0,fours:0,sixes:0,out:false },
          [nonStr]:  { uid:nonStr,  name:nsName, runs:0,balls:0,fours:0,sixes:0,out:false }
        },
        bowlers: { [bowler]: { uid:bowler, name:bName, runs:0,balls:0,wickets:0 } },
        striker, nonStriker:nonStr, currentBowler:bowler,
        currentPartnership: { batter1:sName, batter2:nsName, runs:0, balls:0 }
      };
      await db.collection('matches').doc(matchId).update({
        status:'live', overs, format:fmt,
        toss:`${tossWinnerName} won the toss and elected to ${electChoice} first.`,
        powerplayOvers: ppOvers,
        reviews: { [match.team1Id]:reviews, [match.team2Id]:reviews },
        innings: [innings0],
        participants: firebase.firestore.FieldValue.arrayUnion(striker, nonStr, bowler)
      });
      match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
      normalizeInnings(match);
      _scoreState = { isNoBall:false, isWide:false, runs:null, boundary:null, wicket:null };
      renderScoring();
    } catch(e) {
      console.error('startMatch error:', e);
      Utils.toast('Failed to start match. Try again.','error');
      if(btn){btn.disabled=false;btn.textContent='▶  Start Match';}
    }
  }

  // ── SCORING ───────────────────────────────────────────────────────
  function currentInnings() { return (match.innings||[]).slice(-1)[0]; }
  function inningsIdx()      { return Math.max(0, (match.innings||[]).length - 1); }

  function renderScoring() {
    const inn = currentInnings();
    if (!inn) { Utils.toast('No innings data.','error'); return; }

    const strikerData  = (inn.batters||{})[inn.striker]       || { name: inn.striker  || 'Striker',      runs:0, balls:0, fours:0, sixes:0 };
    const nonStrData   = (inn.batters||{})[inn.nonStriker]    || { name: inn.nonStriker || 'Non-Striker', runs:0, balls:0 };
    const bowlerData   = (inn.bowlers||{})[inn.currentBowler] || { name: inn.currentBowler || 'Bowler',  runs:0, balls:0, wickets:0 };

    const overs       = match.overs || 20;
    const currentOver = Math.floor(inn.balls / 6);
    const ballsRemain = overs * 6 - inn.balls;
    const inPP        = match.powerplayOvers && currentOver < match.powerplayOvers;
    const target      = (match.innings||[]).length > 1 && inningsIdx()===1 ? (match.innings[0].runs + 1) : null;
    const needed      = target ? target - inn.runs : null;
    const isSuperOver = match.superOver;
    const rev1 = (match.reviews||{})[match.team1Id] ?? reviews;
    const rev2 = (match.reviews||{})[match.team2Id] ?? reviews;

    // Safe name display — never render raw "undefined" string
    const safe = v => (v && v !== 'undefined') ? v : '—';

    Utils.render(`
      <div class="scoring-topbar">
        <a href="#/match/${matchId}" class="btn btn-ghost btn-sm" style="padding-left:0;font-size:13px">← Match</a>
        <span class="text-sm text-muted" style="font-weight:600">${safe(inn.battingTeamName)}</span>
        <div style="display:flex;gap:6px">
          <button class="btn btn-sm btn-outline" onclick="MatchScoringPage.showDLS()" title="DLS">🌧️</button>
          <button class="btn btn-sm btn-outline" onclick="MatchScoringPage.endInnings()">End Inn.</button>
        </div>
      </div>

      ${isSuperOver ? '<div class="super-over-banner">⚡ SUPER OVER</div>' : ''}
      ${inPP ? `<div class="powerplay-banner">⚡ Powerplay — Overs 1–${match.powerplayOvers}</div>` : ''}
      ${match.dlsApplied ? `<div class="dls-banner">🌧️ DLS: ${match.dlsTarget} in ${match.dlsOvers} overs</div>` : ''}

      <div class="scoring-header">
        <div class="scoring-header-row">
          <div>
            <div class="scoring-score">${inn.runs}/${inn.wickets ?? 0}</div>
            <div class="scoring-subline">
              ${Utils.formatOvers(inn.balls)} / ${overs} ov
              &nbsp;·&nbsp; RR ${Utils.rr(inn.runs, inn.balls)}
              ${target ? `&nbsp;·&nbsp;<span class="need-chip">Need <b>${needed}</b> off ${ballsRemain}b</span>` : ''}
            </div>
          </div>
          <div class="rev-chips">
            <div class="rev-chip"><span>${(match.team1Name||'T1').slice(0,3)}</span><b>${rev1}</b></div>
            <div class="rev-chip"><span>${(match.team2Name||'T2').slice(0,3)}</span><b>${rev2}</b></div>
          </div>
        </div>

        <div class="scoring-players">
          <div class="scoring-player-chip striker" title="On strike">
            🏏 <span>${safe(strikerData.name)}</span>
            <b>${strikerData.runs}(${strikerData.balls})</b>
          </div>
          <div class="scoring-player-chip" title="Non-striker">
            <span>${safe(nonStrData.name)}</span>
            <b>${nonStrData.runs}(${nonStrData.balls})</b>
          </div>
          <div class="scoring-player-chip bowler-chip" title="Bowling">
            🎳 <span>${safe(bowlerData.name)}</span>
            <b>${Utils.formatOvers(bowlerData.balls)}-${bowlerData.runs}-${bowlerData.wickets ?? 0}</b>
          </div>
        </div>

        ${inn.currentPartnership && inn.currentPartnership.batter1 && inn.currentPartnership.batter2
          ? `<div class="partnership-chip">🤝 ${safe(inn.currentPartnership.batter1)} &amp; ${safe(inn.currentPartnership.batter2)} — ${inn.currentPartnership.runs}(${inn.currentPartnership.balls})</div>`
          : ''}

        <div class="over-header">
          <span class="scoring-section-label" style="margin:0">This over</span>
          <button class="btn btn-ghost btn-sm" style="font-size:11px;padding:2px 6px" onclick="MatchScoringPage.viewPreviousOvers()">All overs ›</button>
        </div>
        <div class="over-balls" id="over-balls-display">
          <span class="text-muted text-xs">Loading…</span>
        </div>
      </div>

      <div class="scoring-panel">
        <div class="extra-row">
          <label class="extra-toggle" id="lbl-noball">
            <input type="checkbox" id="inp-noball" onchange="MatchScoringPage.toggleExtra('noball')"/>
            <span>No Ball</span>
          </label>
          <label class="extra-toggle" id="lbl-wide">
            <input type="checkbox" id="inp-wide" onchange="MatchScoringPage.toggleExtra('wide')"/>
            <span>Wide</span>
          </label>
        </div>

        <div class="scoring-section-label" style="margin-bottom:8px">Runs <span class="text-muted" style="font-weight:400;font-size:10px">— tap 4 or 6 for boundary</span></div>
        <div class="run-opts">
          ${[0,1,2,3,4,5,6].map(r=>`<button class="run-opt" data-runs="${r}" onclick="MatchScoringPage.setRuns(${r})">${r}</button>`).join('')}
        </div>

        <div id="wicket-section">
          <div class="scoring-section-label" style="margin-top:16px;margin-bottom:8px" id="wicket-label">
            Wicket
            ${_scoreState.isNoBall ? '<span class="text-xs" style="color:var(--gold);font-weight:400"> — only Run Out valid on No Ball</span>' : ''}
          </div>
          <div class="wicket-opts" id="wicket-opts">
            ${_renderWicketButtons()}
          </div>
        </div>

        <div class="review-row">
          <button class="btn btn-sm btn-outline review-btn" onclick="MatchScoringPage.takeReview('${match.team1Id}','${match.team1Name||'Team 1'}')">
            Review — ${match.team1Name||'T1'} (${rev1} left)
          </button>
          <button class="btn btn-sm btn-outline review-btn" onclick="MatchScoringPage.takeReview('${match.team2Id}','${match.team2Name||'Team 2'}')">
            Review — ${match.team2Name||'T2'} (${rev2} left)
          </button>
        </div>

        <input type="text" id="inp-note" placeholder="Delivery note (optional)…" style="margin-top:12px"/>

        <div class="confirm-wrap">
          <button class="confirm-btn" id="confirm-btn" onclick="MatchScoringPage.confirmDelivery()">✓  Confirm Delivery</button>
        </div>
      </div>
    `);
    loadCurrentOverBalls();
  }

  async function loadCurrentOverBalls() {
    try {
      const inn  = currentInnings();
      const over = Math.floor(inn.balls / 6);
      const snap = await db.collection('matches').doc(matchId).collection('deliveries')
        .where('inningsIdx','==',inningsIdx()).where('over','==',over).orderBy('ball').get();
      const el = document.getElementById('over-balls-display');
      if (!el) return;
      const balls = snap.docs.map(d=>d.data());
      if (!balls.length) { el.innerHTML = '<span class="text-muted text-xs">No balls yet this over.</span>'; return; }
      el.innerHTML = balls.map(b => {
        const cls = b.isWide||b.isNoBall?'extra':b.wicket&&!b.isNoBall?'wicket':b.boundaryType===6?'six':b.boundaryType===4?'four':'';
        const lbl = b.isWide?'Wd':b.isNoBall?'Nb':b.wicket&&b.isValidDismissal?'W':b.legalRuns===0?'·':String(b.legalRuns);
        return `<div class="over-ball ${cls}" title="${b.batsmanName||'?'}: ${lbl}">${lbl}</div>`;
      }).join('');
    } catch(e) {
      const el = document.getElementById('over-balls-display');
      if (el) el.innerHTML = '<span class="text-muted text-xs">Over data unavailable.</span>';
    }
  }

  // ── STATE HELPERS ─────────────────────────────────────────────────
  function _renderWicketButtons() {
    return Utils.WICKET_TYPES.map(w => {
      const disabledOnNB = _scoreState.isNoBall && w !== 'Run Out' && !w.startsWith('Retired');
      return `<button class="wicket-opt${_scoreState.wicket===w?' active':''}${disabledOnNB?' disabled-nb':''}" data-w="${w}"
        style="${disabledOnNB?'opacity:.35;cursor:not-allowed;':''}"
        onclick="MatchScoringPage.setWicket('${w}')">${w}</button>`;
    }).join('');
  }

  // Targeted update used by toggleExtra() instead of a full renderScoring().
  // A full re-render would wipe the delivery-note text box, desync the run-
  // button highlight from _scoreState, and re-trigger an unnecessary Firestore
  // read via loadCurrentOverBalls() on every single checkbox tap — this
  // updates only the two small pieces of the DOM that actually need to change.
  function _updateWicketSection() {
    const label = document.getElementById('wicket-label');
    const opts  = document.getElementById('wicket-opts');
    if (label) label.innerHTML = `Wicket${_scoreState.isNoBall ? ' <span class="text-xs" style="color:var(--gold);font-weight:400"> — only Run Out valid on No Ball</span>' : ''}`;
    if (opts)  opts.innerHTML  = _renderWicketButtons();
  }

  function toggleExtra(t) {
    if (t==='noball') {
      _scoreState.isNoBall = document.getElementById('inp-noball').checked;
      _scoreState.isWide   = false;
      document.getElementById('inp-wide').checked = false;
      document.getElementById('lbl-wide')?.classList.remove('checked');
      document.getElementById('lbl-noball')?.classList.toggle('checked', _scoreState.isNoBall);
      // On NB, clear any non-Run-Out wicket selection
      if (_scoreState.isNoBall && _scoreState.wicket && _scoreState.wicket !== 'Run Out' && !_scoreState.wicket.startsWith('Retired')) {
        _scoreState.wicket = null;
      }
    } else {
      _scoreState.isWide   = document.getElementById('inp-wide').checked;
      _scoreState.isNoBall = false;
      document.getElementById('inp-noball').checked = false;
      document.getElementById('lbl-noball')?.classList.remove('checked');
      document.getElementById('lbl-wide')?.classList.toggle('checked', _scoreState.isWide);
    }
    _updateWicketSection(); // targeted — does NOT touch the note field, run highlights, or over-balls display
    syncExtraCheckboxes();
    updateConfirmBtn();
  }

  function setRuns(r) {
    _scoreState.runs     = r;
    _scoreState.boundary = (r===4||r===6) ? r : null;
    document.querySelectorAll('.run-opt').forEach(b => b.classList.toggle('active', +b.dataset.runs===r));
    syncExtraCheckboxes();
    updateConfirmBtn();
  }
  function setBoundary(b) { setRuns(b); }

  function setWicket(w) {
    // Bug 1 fix: block invalid dismissals on No Ball
    if (_scoreState.isNoBall && w !== 'Run Out' && !w.startsWith('Retired')) {
      Utils.toast(`${w} is not valid on a No Ball. Only Run Out is allowed.`, 'error');
      return;
    }
    _scoreState.wicket = _scoreState.wicket === w ? null : w;
    const opts = document.getElementById('wicket-opts');
    if (opts) opts.innerHTML = _renderWicketButtons();
    syncExtraCheckboxes();
    updateConfirmBtn();
  }

  function syncExtraCheckboxes() {
    const nb = document.getElementById('inp-noball');
    const wd = document.getElementById('inp-wide');
    if (nb) nb.checked = !!_scoreState.isNoBall;
    if (wd) wd.checked = !!_scoreState.isWide;
    document.getElementById('lbl-noball')?.classList.toggle('checked', !!_scoreState.isNoBall);
    document.getElementById('lbl-wide')?.classList.toggle('checked', !!_scoreState.isWide);
  }

  function updateConfirmBtn() {
    const btn = document.getElementById('confirm-btn');
    if (!btn || btn.disabled) return;
    const { isNoBall, isWide, boundary, wicket } = _scoreState;
    const runs = boundary ?? _scoreState.runs ?? 0;
    const parts = [];
    if (isNoBall) parts.push('No Ball');
    if (isWide)   parts.push('Wide');
    if (boundary===6)      parts.push('SIX 🏏');
    else if (boundary===4) parts.push('FOUR 🎯');
    else if (runs>0)       parts.push(`${runs} run${runs!==1?'s':''}`);
    else if (!isNoBall && !isWide) parts.push('Dot ball');
    if (wicket) parts.push(wicket + ' ⚡');
    btn.textContent = '✓  ' + (parts.join(' + ') || 'Confirm Delivery');
    if (wicket)            { btn.style.background='var(--red)';  btn.style.color='#fff'; }
    else if (boundary===6) { btn.style.background='var(--gold)'; btn.style.color='#000'; }
    else                   { btn.style.background='var(--accent)'; btn.style.color='#000'; }
  }

  // ── FIELDER MODAL ─────────────────────────────────────────────────
  function promptFielder(wicketType) {
    return new Promise(resolve => {
      const label = wicketType==='Run Out' ? 'Who ran the batter out?' : 'Who took the catch / made the stumping?';
      // blocking=true — scorer must explicitly choose, can't dismiss by tapping outside
      Utils.modal(`
        <div class="modal-header">
          <h2 class="modal-title">Fielder Details</h2>
        </div>
        <p class="text-sm text-muted" style="margin-bottom:14px">${label}</p>
        <div class="form-group">
          <input type="text" id="fielder-inp" placeholder="Player name (optional)" autocomplete="off"/>
        </div>
        <button class="btn btn-accent btn-full" onclick="MatchScoringPage._resolveFielder(false)">Confirm</button>
        <button class="btn btn-outline btn-full" style="margin-top:8px" onclick="MatchScoringPage._resolveFielder(true)">Skip</button>
      `, null, true);
      window.__fielderResolve = resolve;
      setTimeout(() => document.getElementById('fielder-inp')?.focus(), 80);
    });
  }

  // ── CONFIRM DELIVERY ──────────────────────────────────────────────
  async function confirmDelivery() {
    const btn = document.getElementById('confirm-btn');
    if (btn?.disabled) return;
    if (btn) { btn.disabled=true; btn.innerHTML='<span class="btn-spinner"></span> Saving…'; btn.style.background='var(--surface3)'; btn.style.color='var(--subtext)'; }

    try {
      const inn      = currentInnings();
      const idx      = inningsIdx();
      const base     = `innings.${idx}`;
      const boundary = _scoreState.boundary;
      const runs     = boundary ?? _scoreState.runs ?? 0;
      const isNB     = _scoreState.isNoBall;
      const isW      = _scoreState.isWide;
      const wicket   = _scoreState.wicket;
      const note     = document.getElementById('inp-note')?.value.trim() || null;
      const legalBall  = !isNB && !isW;
      const totalRuns  = runs + (isNB||isW ? 1 : 0);
      const isRetired  = wicket && wicket.startsWith('Retired');
      const currentOver = Math.floor(inn.balls / 6);
      const inPP        = match.powerplayOvers && currentOver < match.powerplayOvers;
      const maxBalls    = (match.overs||20) * 6;

      // Bug 1 fix: only a valid dismissal when NOT a No Ball, OR it's a Run Out
      // (Run Out is the only dismissal allowed off a No Ball in cricket)
      const isValidWicket = wicket && !isRetired && (!isNB || wicket === 'Run Out');

      const newBalls   = inn.balls   + (legalBall ? 1 : 0);
      const newWickets = (inn.wickets ?? 0) + (isValidWicket ? 1 : 0); // Bug 1 fix
      const overComplete = legalBall && newBalls > 0 && newBalls % 6 === 0;

      let fielder = '';
      if (isValidWicket && ['Caught Out','Run Out','Caught Behind','Stumping'].includes(wicket)) {
        fielder = await promptFielder(wicket) || '';
      }

      const ballCountSnap = await db.collection('matches').doc(matchId).collection('deliveries')
        .where('inningsIdx','==',idx).where('over','==',currentOver).get();
      const ballNum = ballCountSnap.size;

      const delivery = {
        matchId, inningsIdx: idx,
        over: currentOver, ball: ballNum,
        batsmanUid:   inn.striker,
        batsmanName:  (inn.batters||{})[inn.striker]?.name       || '',
        bowlerUid:    inn.currentBowler,
        bowlerName:   (inn.bowlers||{})[inn.currentBowler]?.name || '',
        runs: totalRuns, legalRuns: runs,
        isNoBall: isNB, isWide: isW,
        isBoundary: boundary != null,
        boundaryType: boundary,
        wicket:           wicket ? { type:wicket, fielder } : null,
        isValidDismissal: !!isValidWicket, // for display: NB+Bowled shows 'Nb' not 'W'
        powerplay: !!inPP,
        note,
        timestamp: firebase.firestore.FieldValue.serverTimestamp()
      };

      const upd = {};
      upd[`${base}.runs`]  = firebase.firestore.FieldValue.increment(totalRuns);
      if (legalBall)       upd[`${base}.balls`]   = firebase.firestore.FieldValue.increment(1);
      if (isValidWicket)   upd[`${base}.wickets`] = firebase.firestore.FieldValue.increment(1); // Bug 1 fix

      if (!isW) {
        upd[`${base}.batters.${inn.striker}.runs`]  = firebase.firestore.FieldValue.increment(runs);
        upd[`${base}.batters.${inn.striker}.balls`] = firebase.firestore.FieldValue.increment(1);
        if (boundary===4) upd[`${base}.batters.${inn.striker}.fours`] = firebase.firestore.FieldValue.increment(1);
        if (boundary===6) upd[`${base}.batters.${inn.striker}.sixes`] = firebase.firestore.FieldValue.increment(1);
      }

      if (legalBall) upd[`${base}.bowlers.${inn.currentBowler}.balls`] = firebase.firestore.FieldValue.increment(1);
      upd[`${base}.bowlers.${inn.currentBowler}.runs`] = firebase.firestore.FieldValue.increment(totalRuns);
      if (isValidWicket && wicket !== 'Run Out') upd[`${base}.bowlers.${inn.currentBowler}.wickets`] = firebase.firestore.FieldValue.increment(1);

      if (isValidWicket && fielder) {
        const fKey = fielder.toLowerCase().replace(/\s+/g,'_') || 'unknown';
        upd[`fielding.${fKey}.name`]   = fielder;
        upd[`fielding.${fKey}.uid`]    = fKey;
        upd[wicket==='Run Out' ? `fielding.${fKey}.runOuts` : `fielding.${fKey}.catches`] = firebase.firestore.FieldValue.increment(1);
      }

      if (!wicket && !isW) {
        upd[`${base}.currentPartnership.runs`]  = firebase.firestore.FieldValue.increment(runs);
        upd[`${base}.currentPartnership.balls`] = firebase.firestore.FieldValue.increment(1);
      }

      if (inPP) {
        upd[`${base}.powerplayRuns`] = firebase.firestore.FieldValue.increment(totalRuns);
        if (isValidWicket) upd[`${base}.powerplayWickets`] = firebase.firestore.FieldValue.increment(1);
      }

      if (isValidWicket) {
        upd[`${base}.batters.${inn.striker}.out`]     = true;
        upd[`${base}.batters.${inn.striker}.outDesc`] = wicket + (fielder ? ` (${fielder})` : '');
        if (inn.currentPartnership) {
          upd[`${base}.partnerships`] = firebase.firestore.FieldValue.arrayUnion(inn.currentPartnership);
        }
      }

      await Promise.all([
        db.collection('matches').doc(matchId).collection('deliveries').add(delivery),
        db.collection('matches').doc(matchId).update(upd)
      ]);

      try {
        if (newWickets >= 10 || newBalls >= maxBalls) {
          match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
          normalizeInnings(match);
          await handleInningsEnd();
          return;
        }

        let curStriker    = inn.striker;
        let curNonStriker = inn.nonStriker;

        if (isValidWicket) {
          match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
          normalizeInnings(match);
          const updInn    = currentInnings();
          const newBatter = await promptNewBatter(updInn);
          if (newBatter) {
            const nsName = (updInn.batters||{})[updInn.nonStriker]?.name || '';
            await db.collection('matches').doc(matchId).update({
              [`${base}.striker`]:                    newBatter.uid,
              [`${base}.batters.${newBatter.uid}`]:   { uid:newBatter.uid, name:newBatter.name, runs:0, balls:0, fours:0, sixes:0, out:false },
              [`${base}.currentPartnership`]:          { batter1:newBatter.name, batter2:nsName, runs:0, balls:0 },
              participants: firebase.firestore.FieldValue.arrayUnion(newBatter.uid)
            });
            curStriker = newBatter.uid;
          }
        }

        const endUpd = {};

        if (!isValidWicket && legalBall && runs % 2 !== 0) {
          endUpd[`${base}.striker`]    = curNonStriker;
          endUpd[`${base}.nonStriker`] = curStriker;
          [curStriker, curNonStriker]  = [curNonStriker, curStriker];
        }

        if (overComplete) {
          endUpd[`${base}.striker`]    = curNonStriker;
          endUpd[`${base}.nonStriker`] = curStriker;
          [curStriker, curNonStriker]  = [curNonStriker, curStriker];

          const newBowler = await promptNewBowler(inn);
          if (newBowler) {
            endUpd[`${base}.currentBowler`] = newBowler.uid;
            if (!(inn.bowlers||{})[newBowler.uid]) {
              endUpd[`${base}.bowlers.${newBowler.uid}`] = { uid:newBowler.uid, name:newBowler.name, runs:0, balls:0, wickets:0 };
            }
            endUpd.participants = firebase.firestore.FieldValue.arrayUnion(newBowler.uid);
          }
        }

        if (Object.keys(endUpd).length > 0) await db.collection('matches').doc(matchId).update(endUpd);

        match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
        normalizeInnings(match);
        const finalInn = currentInnings();

        if (finalInn.wickets >= 10 || finalInn.balls >= maxBalls) {
          await handleInningsEnd();
        } else {
          _scoreState = { isNoBall:false, isWide:false, runs:null, boundary:null, wicket:null };
          renderScoring();
        }
      } catch(postErr) {
        console.error('confirmDelivery post-write error:', postErr);
        Utils.toast('Delivery saved — refreshing…', 'info');
        try {
          match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
          normalizeInnings(match);
          _scoreState = { isNoBall:false, isWide:false, runs:null, boundary:null, wicket:null };
          renderScoring();
        } catch(renderErr) {
          Utils.toast('Saved but view failed to refresh — reload the page.', 'error');
        }
      }
    } catch(e) {
      console.error('confirmDelivery error:', e);
      Utils.toast('Failed to save delivery — check connection.', 'error');
      if (btn) { btn.disabled=false; btn.style.background='var(--accent)'; btn.style.color='#000'; btn.textContent='✓  Confirm Delivery'; }
    }
  }

  // ── NEW BATTER MODAL ──────────────────────────────────────────────
  // Bug 4 fix: use Promise.all to fetch all profiles before populating the
  // select, so the dropdown is never empty when the modal appears.
  // Bug 2 fix: blocking=true so tapping backdrop doesn't silently hang.
  function promptNewBatter(inn) {
    return new Promise(resolve => {
      const outUids = Object.values(inn.batters||{}).filter(b=>b.out).map(b=>b.uid);
      // Show modal with loading indicator while fetching squad
      Utils.modal(`
        <div class="modal-header"><h2 class="modal-title">New Batter In</h2></div>
        <div class="form-group">
          <label class="form-label">Select from squad</label>
          <select id="new-bat-sel"><option value="">Loading squad…</option></select>
        </div>
        <div class="form-group">
          <label class="form-label">Or enter name manually</label>
          <input type="text" id="new-bat-name" placeholder="Player name…"/>
        </div>
        <button class="btn btn-accent btn-full" onclick="MatchScoringPage._resolveNewBatter()">Confirm</button>
      `, null, true); // blocking
      window.__newBatterResolve = resolve;

      // Fetch squad + profiles in parallel, then populate in one batch
      db.collection('teams').doc(inn.battingTeamId).get().then(async snap => {
        const sel = document.getElementById('new-bat-sel');
        if (!sel) return;
        if (!snap.exists) { sel.innerHTML = '<option value="">No squad found</option>'; return; }
        const players  = Object.entries(snap.data().players||{}).map(([uid,p]) => ({ uid, ...p }));
        const eligible = players.filter(p => !outUids.includes(p.uid) && p.uid !== inn.striker && p.uid !== inn.nonStriker);
        // Bug 4 fix: await all profile fetches before building options
        const profileMap = {};
        await Promise.all(eligible.filter(p => !p.isGuest).map(async p => {
          try { const s=await db.collection('users').doc(p.uid).get(); if(s.exists && s.data().displayName) profileMap[p.uid]=s.data().displayName; } catch(_) {}
        }));
        sel.innerHTML = '<option value="">Select…</option>' + eligible.map(p => {
          const name = profileMap[p.uid] || p.name || p.uid;
          return `<option value="${p.uid}" data-name="${name}">${name}</option>`;
        }).join('');
      }).catch(() => {
        const sel = document.getElementById('new-bat-sel');
        if (sel) sel.innerHTML = '<option value="">Could not load squad</option>';
      });
    });
  }

  // ── NEW BOWLER MODAL ──────────────────────────────────────────────
  function promptNewBowler(inn) {
    return new Promise(resolve => {
      Utils.modal(`
        <div class="modal-header"><h2 class="modal-title">New Bowler</h2></div>
        <div class="form-group">
          <label class="form-label">Select from squad</label>
          <select id="new-bowl-sel"><option value="">Loading squad…</option></select>
        </div>
        <div class="form-group">
          <label class="form-label">Or enter name manually</label>
          <input type="text" id="new-bowl-name" placeholder="Player name…"/>
        </div>
        <button class="btn btn-accent btn-full" onclick="MatchScoringPage._resolveNewBowler()">Confirm</button>
      `, null, true); // blocking
      window.__newBowlerResolve = resolve;

      db.collection('teams').doc(inn.bowlingTeamId).get().then(async snap => {
        const sel = document.getElementById('new-bowl-sel');
        if (!sel) return;
        if (!snap.exists) { sel.innerHTML = '<option value="">No squad found</option>'; return; }
        const players = Object.entries(snap.data().players||{}).map(([uid,p]) => ({ uid, ...p }));
        const profileMap = {};
        await Promise.all(players.filter(p => !p.isGuest).map(async p => {
          try { const s=await db.collection('users').doc(p.uid).get(); if(s.exists && s.data().displayName) profileMap[p.uid]=s.data().displayName; } catch(_) {}
        }));
        sel.innerHTML = '<option value="">Select…</option>' + players.map(p => {
          const name = profileMap[p.uid] || p.name || p.uid;
          return `<option value="${p.uid}" data-name="${name}">${name}</option>`;
        }).join('');
      }).catch(() => {
        const sel = document.getElementById('new-bowl-sel');
        if (sel) sel.innerHTML = '<option value="">Could not load squad</option>';
      });
    });
  }

  // Bug A fix: two-step review — first confirm action, then record result
  async function takeReview(teamId, teamName) {
    const current = (match.reviews||{})[teamId] ?? reviews;
    if (current <= 0) { Utils.toast(`${teamName} has no reviews left.`, 'error'); return; }
    const takeIt = await Utils.confirmModal(`<strong>${teamName}</strong> is taking a review.<br>Proceed?`, 'Take Review');
    if (!takeIt) return; // genuinely cancelled — review NOT used, no state change

    // Once a review is taken, there is no valid "cancel" left — the only two
    // real outcomes are upheld or not upheld. Using Confirm/Cancel semantics
    // here (as confirmModal does) would make an accidental backdrop-tap or
    // "Cancel" tap silently record "not upheld" and burn the review without
    // the scorer realising it had a consequence. Use an explicit two-choice,
    // blocking modal instead — no ambiguous escape route.
    const upheld = await new Promise(resolve => {
      window.__reviewOutcomeResolve = resolve;
      Utils.modal(`
        <div class="modal-header"><h2 class="modal-title">Review Outcome</h2></div>
        <p class="text-sm" style="margin-bottom:18px">Was <strong>${teamName}</strong>'s review successful?</p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-danger" style="flex:1" onclick="MatchScoringPage._resolveReviewOutcome(false)">✕ Not Upheld</button>
          <button class="btn btn-accent" style="flex:1" onclick="MatchScoringPage._resolveReviewOutcome(true)">✓ Upheld</button>
        </div>
      `, null, true); // blocking — must tap one of the two real outcomes
    });

    const newCount = upheld ? current : current - 1;
    await db.collection('matches').doc(matchId).update({ [`reviews.${teamId}`]: newCount });
    match.reviews = { ...(match.reviews||{}), [teamId]: newCount };
    Utils.toast(`${teamName}: review ${upheld?'upheld ✓':'failed ✗'}. ${newCount} left.`, upheld?'success':'info');
    renderScoring();
  }

  // ── INNINGS TRANSITION ────────────────────────────────────────────
  async function handleInningsEnd() {
    const idx = inningsIdx();
    if (idx === 0) {
      Utils.toast('1st innings complete! Setting up 2nd innings…', 'info');
      const inn1 = match.innings[0];
      const inn2Stub = {
        battingTeamId:inn1.bowlingTeamId, battingTeamName:inn1.bowlingTeamName,
        bowlingTeamId:inn1.battingTeamId, bowlingTeamName:inn1.battingTeamName,
        runs:0, wickets:0, balls:0, partnerships:[],
        powerplayRuns:0, powerplayWickets:0,
        batters:{}, bowlers:{}, striker:null, nonStriker:null,
        currentBowler:null, currentPartnership:null
      };
      await db.collection('matches').doc(matchId).update({ innings: [match.innings[0], inn2Stub] });
      match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
      normalizeInnings(match);
      await setupNewInningsOpeners();
    } else {
      const inn1 = match.innings[0];
      const inn2 = match.innings[match.innings.length - 1];
      if (inn1 && inn2 && inn1.runs === inn2.runs && !match.superOver) {
        const doSuper = await Utils.confirmModal(`Match tied at ${inn1.runs}!<br>Play a Super Over?`, 'Yes, Super Over!');
        if (doSuper) { await startSuperOver(); return; }
      }
      await endMatch();
    }
  }

  async function setupNewInningsOpeners() {
    const capturedIdx = inningsIdx(); // Bug C fix: capture NOW before modal shows
    const inn = currentInnings();

    const batSnap  = await db.collection('teams').doc(inn.battingTeamId).get();
    const batPlayers = Object.entries((batSnap.exists ? batSnap.data() : {}).players||{}).map(([uid,p])=>({uid,...p}));
    // Bug 4 fix: fetch all profiles in parallel before rendering modal
    const batProfileMap = {};
    await Promise.all(batPlayers.filter(p=>!p.isGuest).map(async p => {
      try { const s=await db.collection('users').doc(p.uid).get(); if(s.exists && s.data().displayName) batProfileMap[p.uid]=s.data().displayName; } catch(_) {}
    }));
    const batOpts = batPlayers.map(p => {
      const name = batProfileMap[p.uid] || p.name || p.uid;
      return `<option value="${p.uid}" data-name="${name}">${name}</option>`;
    }).join('');

    const bowlSnap    = await db.collection('teams').doc(inn.bowlingTeamId).get();
    const bowlPlayers = Object.entries((bowlSnap.exists ? bowlSnap.data() : {}).players||{}).map(([uid,p])=>({uid,...p}));
    const bowlProfileMap = {};
    await Promise.all(bowlPlayers.filter(p=>!p.isGuest).map(async p => {
      try { const s=await db.collection('users').doc(p.uid).get(); if(s.exists && s.data().displayName) bowlProfileMap[p.uid]=s.data().displayName; } catch(_) {}
    }));
    const bowlOpts = bowlPlayers.map(p => {
      const name = bowlProfileMap[p.uid] || p.name || p.uid;
      return `<option value="${p.uid}" data-name="${name}">${name}</option>`;
    }).join('');

    window.__innings2SetupIdx = capturedIdx; // Bug C fix: store for use at confirm time

    await new Promise(resolve => {
      Utils.modal(`
        <div class="modal-header"><h2 class="modal-title">2nd Innings — Openers</h2></div>
        <div class="form-group"><label class="form-label">Striker</label>
          <select id="s2-striker"><option value="">Select…</option>${batOpts}</select></div>
        <div class="form-group"><label class="form-label">Non-Striker</label>
          <select id="s2-nonstr"><option value="">Select…</option>${batOpts}</select></div>
        <div class="form-group"><label class="form-label">Opening Bowler</label>
          <select id="s2-bowler"><option value="">Select…</option>${bowlOpts}</select></div>
        <button class="btn btn-accent btn-full" onclick="MatchScoringPage._resolveInnings2Setup()">Start 2nd Innings ▶</button>
      `, null, true); // blocking
      window.__innings2Resolve = resolve;
    });
  }

  window._resolveInnings2Setup = async function() {
    const sEl  = document.getElementById('s2-striker');
    const nsEl = document.getElementById('s2-nonstr');
    const bEl  = document.getElementById('s2-bowler');
    const s=sEl?.value, ns=nsEl?.value, b=bEl?.value;
    if (!s||!ns||!b||s===ns) { Utils.toast('Select valid players.','error'); return; }
    const sName  = sEl.options[sEl.selectedIndex]?.dataset.name   || s;
    const nsName = nsEl.options[nsEl.selectedIndex]?.dataset.name || ns;
    const bName  = bEl.options[bEl.selectedIndex]?.dataset.name   || b;
    const idx = window.__innings2SetupIdx ?? inningsIdx(); // Bug C fix
    const upd = {};
    upd[`innings.${idx}.striker`]           = s;
    upd[`innings.${idx}.nonStriker`]        = ns;
    upd[`innings.${idx}.currentBowler`]     = b;
    upd[`innings.${idx}.batters.${s}`]      = { uid:s,  name:sName,  runs:0,balls:0,fours:0,sixes:0,out:false };
    upd[`innings.${idx}.batters.${ns}`]     = { uid:ns, name:nsName, runs:0,balls:0,fours:0,sixes:0,out:false };
    upd[`innings.${idx}.bowlers.${b}`]      = { uid:b,  name:bName,  runs:0,balls:0,wickets:0 };
    upd[`innings.${idx}.currentPartnership`]= { batter1:sName, batter2:nsName, runs:0, balls:0 };
    await db.collection('matches').doc(matchId).update(upd);
    await db.collection('matches').doc(matchId).update({ participants: firebase.firestore.FieldValue.arrayUnion(s,ns,b) });
    match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
    normalizeInnings(match);
    Utils.closeModal();
    if (window.__innings2Resolve) { window.__innings2Resolve(); window.__innings2Resolve=null; }
    _scoreState = { isNoBall:false, isWide:false, runs:null, boundary:null, wicket:null };
    renderScoring();
  };

  window._resolveNewBatter = function() {
    const sel  = document.getElementById('new-bat-sel');
    const name = document.getElementById('new-bat-name')?.value.trim();
    if (name) {
      const uid = 'guest_' + Utils.uid();
      Utils.closeModal();
      if (window.__newBatterResolve) { window.__newBatterResolve({ uid, name }); window.__newBatterResolve=null; }
      return;
    }
    const uid = sel?.value; if (!uid) { Utils.toast('Select or enter a batter name.','error'); return; }
    const n = sel.options[sel.selectedIndex]?.dataset.name || uid;
    Utils.closeModal();
    if (window.__newBatterResolve) { window.__newBatterResolve({ uid, name:n }); window.__newBatterResolve=null; }
  };

  window._resolveNewBowler = function() {
    const sel  = document.getElementById('new-bowl-sel');
    const name = document.getElementById('new-bowl-name')?.value.trim();
    if (name) {
      const uid = 'guest_' + Utils.uid();
      Utils.closeModal();
      if (window.__newBowlerResolve) { window.__newBowlerResolve({ uid, name }); window.__newBowlerResolve=null; }
      return;
    }
    const uid = sel?.value; if (!uid) { Utils.toast('Select or enter a bowler name.','error'); return; }
    const n = sel.options[sel.selectedIndex]?.dataset.name || uid;
    Utils.closeModal();
    if (window.__newBowlerResolve) { window.__newBowlerResolve({ uid, name:n }); window.__newBowlerResolve=null; }
  };

  async function startSuperOver() {
    Utils.toast('Starting Super Over!','success');
    const inn1 = match.innings[0];
    const soStub = {
      battingTeamId:inn1.bowlingTeamId, battingTeamName:inn1.bowlingTeamName,
      bowlingTeamId:inn1.battingTeamId, bowlingTeamName:inn1.battingTeamName,
      runs:0, wickets:0, balls:0, partnerships:[], powerplayRuns:0, powerplayWickets:0,
      batters:{}, bowlers:{}, striker:null, nonStriker:null, currentBowler:null, currentPartnership:null
    };
    await db.collection('matches').doc(matchId).update({ superOver:true, overs:1, innings:[...match.innings, soStub] });
    match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
    normalizeInnings(match);
    await setupNewInningsOpeners();
  }

  // ── DLS ───────────────────────────────────────────────────────────
  function showDLS() {
    const inn1 = match.innings[0];
    const inn2 = match.innings[1];
    if (!inn1) { Utils.toast('Complete 1st innings first.','info'); return; }
    Utils.modal(`
      <div class="modal-header">
        <h2 class="modal-title">🌧️ DLS Calculator</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <p class="text-sm text-muted" style="margin-bottom:14px">
        ${inn1.battingTeamName} scored ${inn1.runs}/${inn1.wickets ?? 0} in ${Utils.formatOvers(inn1.balls)} overs.
      </p>
      <div class="form-grid-2">
        <div class="form-group">
          <label class="form-label">Overs available for ${inn2?.battingTeamName||'Team 2'}</label>
          <input type="number" id="dls-overs" value="${match.overs||20}" min="1" max="${match.overs||50}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Wickets already fallen</label>
          <input type="number" id="dls-wickets" value="${inn2?inn2.wickets??0:0}" min="0" max="9"/>
        </div>
      </div>
      <button class="btn btn-accent btn-full" onclick="MatchScoringPage.applyDLS()">Calculate & Apply</button>
    `);
  }
  async function applyDLS() {
    const inn1 = match.innings[0];
    const target = Utils.calcDLSTarget(inn1.runs, match.overs||50, parseInt(document.getElementById('dls-overs').value), parseInt(document.getElementById('dls-wickets').value));
    await db.collection('matches').doc(matchId).update({ dlsApplied:true, dlsTarget:target, dlsOvers:parseInt(document.getElementById('dls-overs').value) });
    match = { id:matchId, ...(await db.collection('matches').doc(matchId).get()).data() };
    normalizeInnings(match);
    Utils.closeModal();
    Utils.toast(`DLS target: ${target} in ${document.getElementById('dls-overs').value} overs.`,'success');
    renderScoring();
  }

  async function endInnings() {
    const ok = await Utils.confirmModal('End the current innings now?', 'End Innings', true);
    if (!ok) return;
    await handleInningsEnd();
  }

  async function endMatch() {
    const inn1 = match.innings[0];
    const inn2 = match.innings.slice(-1)[0];
    let result='draw', resultText='Match drawn.';
    if (inn1 && inn2 && match.innings.length > 1) {
      const target = match.dlsApplied ? match.dlsTarget : inn1.runs + 1;
      // Determine WHICH match team (team1Id or team2Id) corresponds to each innings
      // battingTeamId. This is necessary because batting order is decided by toss
      // and may not match the team1/team2 registration order.
      const inn1TeamKey = inn1.battingTeamId === match.team1Id ? 'team1' : 'team2';
      const inn2TeamKey = inn2.battingTeamId === match.team1Id ? 'team1' : 'team2';
      if      (inn2.runs >= target)      { result=inn2TeamKey; resultText=`${inn2.battingTeamName} won by ${10-(inn2.wickets??0)} wicket${(inn2.wickets??0)<9?'s':''}.`; }
      else if (inn1.runs > inn2.runs)    { result=inn1TeamKey; resultText=`${inn1.battingTeamName} won by ${inn1.runs-inn2.runs} run${inn1.runs-inn2.runs!==1?'s':''}.`; }
      else if (inn1.runs === inn2.runs)  { result='tie';       resultText='Match tied!'; }
    }
    await db.collection('matches').doc(matchId).update({ status:'completed', result, resultText });
    Utils.toast(resultText,'success');
    Router.navigate(`/match/${matchId}`);
  }

  async function viewPreviousOvers() {
    try {
      const idx  = inningsIdx();
      const snap = await db.collection('matches').doc(matchId).collection('deliveries')
        .where('inningsIdx','==',idx).orderBy('timestamp').get();
      const all  = snap.docs.map(d=>d.data());
      const overs= {};
      all.forEach(d => { if(!overs[d.over]) overs[d.over]=[]; overs[d.over].push(d); });
      const overKeys = Object.keys(overs).map(Number).sort((a,b)=>b-a);
      Utils.modal(`
        <div class="modal-header">
          <h2 class="modal-title">All Overs</h2>
          <button class="modal-close" onclick="Utils.closeModal()">✕</button>
        </div>
        <div style="max-height:65vh;overflow-y:auto;padding-right:4px">
          ${overKeys.length ? overKeys.map(ov=>`
            <div style="margin-bottom:18px">
              <div style="font-weight:700;margin-bottom:6px;color:var(--accent);font-size:13px">
                Over ${ov+1}
                <span class="text-muted" style="font-weight:400;font-size:12px"> — ${overs[ov].reduce((s,d)=>s+(d.runs||0),0)} runs</span>
              </div>
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                ${overs[ov].map(d=>{
                  const cls=d.isWide||d.isNoBall?'extra':d.wicket&&d.isValidDismissal?'wicket':d.boundaryType===6?'six':d.boundaryType===4?'four':'';
                  const lbl=d.isWide?'Wd':d.isNoBall?'Nb':d.wicket&&d.isValidDismissal?'W':d.legalRuns===0?'·':String(d.legalRuns);
                  return `<div class="over-ball ${cls}" title="${d.batsmanName||'?'}: ${lbl}${d.note?' – '+d.note:''}">${lbl}</div>`;
                }).join('')}
              </div>
            </div>
          `).join('') : '<div class="text-muted text-sm">No overs recorded yet.</div>'}
        </div>
      `);
    } catch(e) { Utils.toast('Could not load over history.','error'); }
  }

  return {
    render, onFormatChange, adjustOvers, adjustReviews, adjustPP, setElect,
    startMatch, confirmDelivery, toggleExtra, setRuns, setBoundary, setWicket,
    updateConfirmBtn, takeReview, viewPreviousOvers, endInnings, showDLS, applyDLS,
    loadSetupPlayers,
    _resolveFielder(skip) {
      const name = skip ? '' : (document.getElementById('fielder-inp')?.value.trim() || '');
      Utils.closeModal();
      if (window.__fielderResolve) { window.__fielderResolve(name); window.__fielderResolve=null; }
    },
    _resolveNewBatter()    { window._resolveNewBatter?.(); },
    _resolveNewBowler()    { window._resolveNewBowler?.(); },
    _resolveInnings2Setup(){ window._resolveInnings2Setup?.(); },
    _resolveReviewOutcome(val) {
      Utils.closeModal();
      if (window.__reviewOutcomeResolve) { window.__reviewOutcomeResolve(val); window.__reviewOutcomeResolve = null; }
    },
  };
})();
