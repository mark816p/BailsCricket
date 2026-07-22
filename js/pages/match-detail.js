// BAILS — MATCH DETAIL
const MatchDetailPage = (() => {
  let matchId, match, unsubscribe;

  // ── INNINGS NORMALIZER (mirrors match-scoring.js) ─────────────────
  function normalizeInnings(m) {
    if (!m) return;
    if (!m.innings) { m.innings = []; return; }
    if (!Array.isArray(m.innings)) {
      const keys = Object.keys(m.innings).map(Number).sort((a, b) => a - b);
      m.innings = keys.map(k => m.innings[String(k)] || m.innings[k] || {});
    }
    m.innings = m.innings.map(inn => ({
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

  async function render(path, parts, params) {
    matchId = params.id;
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
    Utils.render(`<div class="page-loading"><div class="page-loading-spinner"></div><div>Loading…</div></div>`);
    try {
      await loadData();
    } catch(e) {
      console.error('match-detail render error:', e);
      Utils.render(`<div class="empty-state"><div class="empty-icon">⚠️</div><div class="empty-title">Failed to load</div><div class="empty-desc">${e.message}</div><button class="btn btn-accent" style="margin-top:16px" onclick="MatchDetailPage.render()">Retry</button></div>`);
    }
  }

  async function loadData() {
    const snap = await db.collection('matches').doc(matchId).get();
    if (!snap.exists) { Utils.render('<p class="text-muted" style="padding:40px;text-align:center">Match not found.</p>'); return; }
    match = { id: snap.id, ...snap.data() };
    normalizeInnings(match);
    await Auth.whenReady();
    renderLayout();
    if (match.status === 'live') {
      unsubscribe = db.collection('matches').doc(matchId).onSnapshot(s => {
        if (!s.exists) return;
        match = { id: s.id, ...s.data() };
        normalizeInnings(match);
        refreshLiveHeader();
      });
    }
  }

  function renderLayout() {
    const user    = Auth.getUser();
    const isAdmin = Auth.isAdmin(match);
    const inn1    = (match.innings||[])[0];
    const inn2    = (match.innings||[])[1];
    const scoreText = inn1
      ? `${inn1.battingTeamName}: ${inn1.runs}/${inn1.wickets ?? 0} (${Utils.formatOvers(inn1.balls)} ov)`
      + (inn2 ? ` | ${inn2.battingTeamName}: ${inn2.runs}/${inn2.wickets ?? 0} (${Utils.formatOvers(inn2.balls)} ov)` : '')
      : 'Match not started';
    Utils.startTicker(() => scoreText);

    const statusBadge = match.status==='live'
      ? `<span class="match-badge badge-live" style="font-size:13px">● LIVE</span>`
      : match.status==='completed'
        ? `<span class="match-badge badge-completed" style="font-size:13px">COMPLETED</span>`
        : `<span class="match-badge badge-upcoming" style="font-size:13px">UPCOMING</span>`;

    Utils.render(`
      <div class="match-detail-hero" id="match-live-header">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          ${statusBadge}
          <div style="display:flex;gap:8px">
            ${isAdmin && match.status!=='completed' ? `<a href="#/match/${matchId}/score" class="btn btn-sm btn-accent" style="font-weight:700">${match.status==='live'?'▶ Resume':'▶ Score'}</a>` : ''}
            ${isAdmin ? `<button class="btn btn-sm btn-outline" onclick="MatchDetailPage.showMoM()">🏅 MoM</button>` : ''}
            <button class="btn btn-sm btn-outline" onclick="Utils.showQR('${location.origin}${location.pathname}#/match/${matchId}')">📲</button>
          </div>
        </div>
        ${renderLiveScore()}
        ${match.resultText ? `<div class="result-text">${Utils.escapeHtml(match.resultText)}</div>` : ''}
        ${match.toss ? `<div class="text-xs text-muted" style="margin-top:6px">${Utils.escapeHtml(match.toss)}</div>` : ''}
      </div>

      <div class="tabs" id="md-tabs">
        <div class="tab active" onclick="MatchDetailPage.switchTab('score')">Score</div>
        <div class="tab" onclick="MatchDetailPage.switchTab('worm')">Worm</div>
        <div class="tab" onclick="MatchDetailPage.switchTab('commentary')">Commentary</div>
        <div class="tab" onclick="MatchDetailPage.switchTab('stats')">Stats</div>
        <div class="tab" onclick="MatchDetailPage.switchTab('squads')">Squads</div>
        ${user ? `<div class="tab" onclick="MatchDetailPage.switchTab('chat')">Chat</div>` : ''}
      </div>
      <div id="md-tab-body" style="padding:16px"></div>
    `);
    renderTab('score');
  }

  function renderLiveScore() {
    const inn1 = (match.innings||[])[0];
    const inn2 = (match.innings||[])[1];
    if (!inn1) return `<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0"><div style="font-size:22px;font-weight:800">${Utils.escapeHtml(match.team1Name)}</div><div style="font-size:22px;font-weight:800">${Utils.escapeHtml(match.team2Name)}</div></div>`;
    const activeInn = inn2 || inn1;
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 0">
        <div>
          <div style="font-size:14px;color:var(--subtext);margin-bottom:2px">${Utils.escapeHtml(activeInn.battingTeamName)}</div>
          <div style="font-size:28px;font-weight:900;color:var(--accent)">${activeInn.runs}/${activeInn.wickets ?? 0}</div>
          <div style="font-size:12px;color:var(--muted)">${Utils.formatOvers(activeInn.balls)} ov · RR ${Utils.rr(activeInn.runs, activeInn.balls)}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:14px;color:var(--subtext);margin-bottom:2px">${Utils.escapeHtml(activeInn.bowlingTeamName)}</div>
          ${inn2 && inn1 ? `<div style="font-size:16px;font-weight:700;color:var(--subtext)">${inn1.runs}/${inn1.wickets ?? 0} (${Utils.formatOvers(inn1.balls)})</div>` : '<div class="text-muted text-sm">Yet to bat</div>'}
          ${inn2 ? `<div style="font-size:12px;color:var(--accent)">Target: ${inn1.runs+1} · Need: ${Math.max(0,inn1.runs+1-inn2.runs)} off ${Math.max(0,(match.overs||20)*6-inn2.balls)}b</div>` : ''}
        </div>
      </div>
    `;
  }

  function refreshLiveHeader() {
    const el = document.getElementById('match-live-header');
    if (!el) return;
    const inn1 = (match.innings||[])[0];
    const inn2 = (match.innings||[])[1];
    const activeInn = inn2||inn1;
    if (!activeInn) return;
    el.querySelector('.match-badge')?.replaceWith(Object.assign(document.createElement('span'), {
      className: 'match-badge badge-live', style:'font-size:13px', textContent:'● LIVE'
    }));
    const liveScoreEl = el.querySelector('[data-live-score]');
    if (liveScoreEl) liveScoreEl.innerHTML = renderLiveScore();
    // Re-render score tab if active
    const activeTab = document.querySelector('#md-tabs .tab.active');
    if (activeTab && activeTab.textContent.trim()==='Score') renderTab('score');
  }

  function switchTab(t) {
    const tabs = document.querySelectorAll('#md-tabs .tab');
    const names = ['score','worm','commentary','stats','squads','chat'];
    tabs.forEach((el,i) => el.classList.toggle('active', names[i]===t));
    renderTab(t);
  }

  function renderTab(t) {
    const body = document.getElementById('md-tab-body');
    if (!body) return;
    if      (t==='score')       body.innerHTML = renderScoreTab();
    else if (t==='worm')        { body.innerHTML = '<canvas id="worm-canvas" style="width:100%;max-height:340px"></canvas><div class="worm-legend" id="worm-legend"></div>'; drawWormChart(); }
    else if (t==='commentary')  { body.innerHTML = '<div id="commentary-body"><div class="text-muted text-sm">Loading…</div></div>'; loadCommentary(); }
    else if (t==='stats')       body.innerHTML = renderStatsTab();
    else if (t==='squads')      { body.innerHTML = '<div class="text-muted text-sm" style="padding:20px 0">Loading squads…</div>'; renderSquadsTab(); }
    else if (t==='chat')        { body.innerHTML = '<div id="chat-body" style="max-height:55vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;margin-bottom:12px"></div><div class="chat-input-row"><input type="text" id="chat-inp" placeholder="Message…" onkeydown="if(event.key===\'Enter\')MatchDetailPage.sendChat()"/><button class="btn btn-sm btn-accent" onclick="MatchDetailPage.sendChat()">Send</button></div>'; loadChat(); }
  }

  // ── SCORE TAB ──────────────────────────────────────────────────────
  function renderInnings(inn, teamName) {
    if (!inn) return '';
    const batters = Object.values(inn.batters||{}).sort((a,b)=>(b.runs||0)-(a.runs||0));
    const bowlers = Object.values(inn.bowlers||{}).sort((a,b)=>(a.runs||0)-(b.runs||0));
    const sr = b => b.balls ? ((b.runs/b.balls)*100).toFixed(1) : '0.0';
    const eco = b => b.balls ? ((b.runs/(b.balls/6))).toFixed(2) : '0.00';
    const inPP = match.powerplayOvers;
    return `
      <div style="margin-bottom:8px;font-weight:700;color:var(--subtext);font-size:13px;text-transform:uppercase;letter-spacing:.5px">${teamName}</div>
      <div style="color:var(--accent);font-size:22px;font-weight:900;margin-bottom:4px">${inn.runs}/${inn.wickets ?? 0} <span style="font-size:14px;font-weight:400;color:var(--muted)">(${Utils.formatOvers(inn.balls)} ov)</span></div>
      ${inPP ? `<div class="text-xs text-muted" style="margin-bottom:8px">PP: ${inn.powerplayRuns ?? 0}/${inn.powerplayWickets ?? 0}</div>` : ''}
      <div style="overflow-x:auto;margin-bottom:12px">
        <table class="stats-table"><thead><tr>
          <th style="text-align:left">Batter</th><th>R</th><th>B</th><th>4s</th><th>6s</th><th>SR</th>
        </tr></thead><tbody>
          ${batters.length ? batters.map(b=>`<tr>
            <td style="text-align:left">${b.name||b.uid||'?'}${b.uid===inn.striker?'<span class="striker-marker"> *</span>':''}${b.out?`<div class="text-xs text-muted">${b.outDesc||'out'}</div>`:''}</td>
            <td><b>${b.runs}</b></td><td>${b.balls}</td><td>${b.fours||0}</td><td>${b.sixes||0}</td><td>${sr(b)}</td>
          </tr>`).join('') : '<tr><td colspan="6" class="text-muted text-sm" style="padding:12px;text-align:center">No batting data yet.</td></tr>'}
        </tbody></table>
      </div>
      <div style="overflow-x:auto">
        <table class="stats-table"><thead><tr>
          <th style="text-align:left">Bowler</th><th>O</th><th>R</th><th>W</th><th>Econ</th>
        </tr></thead><tbody>
          ${bowlers.length ? bowlers.map(b=>`<tr>
            <td style="text-align:left">${b.name||b.uid||'?'}</td>
            <td>${Utils.formatOvers(b.balls||0)}</td><td>${b.runs}</td><td><b>${b.wickets??0}</b></td><td>${eco(b)}</td>
          </tr>`).join('') : '<tr><td colspan="5" class="text-muted text-sm" style="padding:12px;text-align:center">No bowling data yet.</td></tr>'}
        </tbody></table>
      </div>
    `;
  }

  function renderScoreTab() {
    const inn1 = (match.innings||[])[0];
    const inn2 = (match.innings||[])[1];
    const html = (inn1 ? renderInnings(inn1, inn1.battingTeamName||match.team1Name) : '')
               + (inn2 ? `<hr style="border-color:var(--border);margin:20px 0"/>` + renderInnings(inn2, inn2.battingTeamName||match.team2Name) : '');
    if (!html.trim()) return `<div class="empty-state"><div class="empty-icon">🏏</div><div class="empty-title">Match hasn't started</div><div class="empty-desc">Scorecard will appear once the match is live.</div></div>`;
    return `<div id="scorecard-export">${html}</div>
      <button class="btn btn-outline btn-sm" style="margin-top:16px" onclick="Utils.exportScorecard('scorecard-export')">📸 Save Scorecard</button>`;
  }

  // ── STATS TAB ──────────────────────────────────────────────────────
  function renderStatsTab() {
    const innings = match.innings||[];
    if (!innings.length) return `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No stats yet</div></div>`;
    const allB=[], allW=[];
    innings.forEach(inn => {
      Object.values(inn.batters||{}).forEach(b=>allB.push(b));
      Object.values(inn.bowlers||{}).forEach(b=>allW.push(b));
    });
    if (!allB.length && !allW.length) return `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No stats yet</div></div>`;
    const topBatter = [...allB].sort((a,b)=>(b.runs||0)-(a.runs||0))[0];
    const topBowler = [...allW].sort((a,b)=>(b.wickets||0)-(a.wickets||0)||(a.runs||0)-(b.runs||0))[0];
    const inn1 = innings[0], inn2 = innings[1];
    return `
      <div class="stats-grid">
        ${statCard('🏏 Top Scorer', topBatter ? `${topBatter.name||'?'}: ${topBatter.runs} (${topBatter.balls}b)` : '—')}
        ${statCard('🎳 Top Bowler', topBowler ? `${topBowler.name||'?'}: ${topBowler.wickets??0}/${topBowler.runs} (${Utils.formatOvers(topBowler.balls||0)})` : '—')}
        ${inn1 ? statCard(`⚡ PP — ${inn1.battingTeamName}`, `${inn1.powerplayRuns??0}/${inn1.powerplayWickets??0}`) : ''}
        ${inn2 ? statCard(`⚡ PP — ${inn2.battingTeamName}`, `${inn2.powerplayRuns??0}/${inn2.powerplayWickets??0}`) : ''}
        ${match.manOfMatch ? statCard('🏅 Man of the Match', match.manOfMatch) : ''}
      </div>
      <div style="margin-top:16px">
        ${allB.map(b=>`<div class="player-row" style="cursor:default">
          <div style="flex:1"><div style="font-weight:600">${b.name||b.uid||'?'}</div>
            <div class="text-xs text-muted">${b.runs}(${b.balls}) · SR ${b.balls?((b.runs/b.balls)*100).toFixed(1):'—'} · 4s:${b.fours||0} 6s:${b.sixes||0}</div></div>
          <div class="text-muted text-sm">${b.out?'Out':'Not Out'}</div>
        </div>`).join('')}
      </div>
    `;
  }

  function statCard(label, val) {
    return `<div class="stat-card"><div class="stat-label">${label}</div><div class="stat-value" style="font-size:15px">${val}</div></div>`;
  }

  // ── WORM CHART ─────────────────────────────────────────────────────
  async function drawWormChart() {
    const canvas = document.getElementById('worm-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      // Can genuinely happen in real browsers (privacy extensions blocking
      // canvas fingerprinting, low-memory conditions) — degrade gracefully
      // with a text message instead of the canvas itself throwing later.
      canvas.replaceWith(Object.assign(document.createElement('div'), {
        className: 'text-muted text-sm',
        style: 'padding:24px 0;text-align:center',
        textContent: 'Chart unavailable in this browser.'
      }));
      return;
    }
    try {
      const snap = await db.collection('matches').doc(matchId).collection('deliveries')
        .orderBy('inningsIdx').orderBy('over').orderBy('ball').get();
      const deliveries = snap.docs.map(d => d.data());
      if (!deliveries.length) {
        ctx.fillStyle = 'var(--muted)';
        ctx.font = '14px system-ui';
        ctx.fillText('No deliveries yet.', 20, 80);
        return;
      }

      // Use index position (not object reference indexOf) to map deliveries to innings
      const buildData = (innIdx) => {
        const overRuns = {};
        deliveries
          .filter(d => d.inningsIdx === innIdx)
          .forEach(d => { overRuns[d.over] = (overRuns[d.over]||0) + (d.runs||0); });
        let cum = 0;
        const pts = [{ over: 0, runs: 0 }];
        const overNums = Object.keys(overRuns).map(Number).sort((a,b)=>a-b);
        overNums.forEach(ov => { cum += overRuns[ov]; pts.push({ over: ov+1, runs: cum }); });
        return pts;
      };

      const data1 = buildData(0);
      const data2 = (match.innings||[]).length > 1 ? buildData(1) : [];

      const W = canvas.offsetWidth || 320;
      const H = 260;
      canvas.width  = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      canvas.style.height = H + 'px';
      ctx.scale(devicePixelRatio, devicePixelRatio);

      const pad = { top:20, right:20, bottom:40, left:45 };
      const pw = W - pad.left - pad.right;
      const ph = H - pad.top  - pad.bottom;
      const maxOvers = match.overs || 20;
      const allRuns  = [...data1, ...data2].map(p=>p.runs);
      const maxRuns  = Math.max(...allRuns, 10);

      const toX = ov  => pad.left + (ov/maxOvers)*pw;
      const toY = run => pad.top  + ph - (run/maxRuns)*ph;

      // Grid
      ctx.strokeStyle = '#2c2c35'; ctx.lineWidth = 1;
      for (let i=0; i<=5; i++) {
        const y = pad.top + (i/5)*ph;
        ctx.beginPath(); ctx.moveTo(pad.left,y); ctx.lineTo(pad.left+pw,y); ctx.stroke();
        ctx.fillStyle='#9898a8'; ctx.font='10px system-ui'; ctx.textAlign='right';
        ctx.fillText(Math.round(maxRuns*(1-i/5)), pad.left-6, y+3);
      }
      for (let i=0; i<=maxOvers; i+=5) {
        const x = toX(i);
        ctx.beginPath(); ctx.moveTo(x,pad.top); ctx.lineTo(x,pad.top+ph); ctx.stroke();
        ctx.fillStyle='#9898a8'; ctx.font='10px system-ui'; ctx.textAlign='center';
        ctx.fillText(i, x, pad.top+ph+14);
      }
      ctx.fillStyle='#9898a8'; ctx.textAlign='center';
      ctx.fillText('Overs', pad.left+pw/2, H-4);

      const drawLine = (pts, color) => {
        if (!pts.length) return;
        ctx.beginPath(); ctx.strokeStyle=color; ctx.lineWidth=2.5;
        pts.forEach((p,i) => { i===0 ? ctx.moveTo(toX(p.over),toY(p.runs)) : ctx.lineTo(toX(p.over),toY(p.runs)); });
        ctx.stroke();
        pts.forEach(p => {
          ctx.beginPath(); ctx.arc(toX(p.over),toY(p.runs),3,0,Math.PI*2);
          ctx.fillStyle=color; ctx.fill();
        });
      };

      drawLine(data1, '#22c55e');
      if (data2.length) drawLine(data2, '#3b82f6');

      const inn1 = (match.innings||[])[0];
      const inn2 = (match.innings||[])[1];
      const leg = document.getElementById('worm-legend');
      if (leg) {
        leg.innerHTML = `<div class="worm-legend-item"><div class="worm-legend-dot" style="background:#22c55e"></div>${inn1?.battingTeamName||match.team1Name}</div>
          ${data2.length ? `<div class="worm-legend-item"><div class="worm-legend-dot" style="background:#3b82f6"></div>${inn2?.battingTeamName||match.team2Name}</div>` : ''}`;
      }
    } catch(e) {
      console.error('worm chart error:', e);
      ctx.fillStyle = '#9898a8'; ctx.font = '13px system-ui';
      ctx.fillText('Chart unavailable.', 20, 80);
    }
  }

  // ── SQUADS TAB ─────────────────────────────────────────────────────
  async function renderSquadsTab() {
    const body = document.getElementById('md-tab-body');
    if (!body) return;
    try {
      const [t1Snap, t2Snap] = await Promise.all([
        db.collection('teams').doc(match.team1Id).get(),
        db.collection('teams').doc(match.team2Id).get()
      ]);
      const renderSquad = async (snap, teamName) => {
        if (!snap.exists) return `<div class="text-muted text-sm">No squad data.</div>`;
        const players = Object.entries(snap.data().players||{}).map(([uid,p]) => ({ uid, ...p }));
        if (!players.length) return `<div class="text-muted text-sm">No squad data.</div>`;
        // Resolve display names for non-guest players
        const nonGuests = players.filter(p => !p.isGuest && (!p.name || p.name === p.uid));
        if (nonGuests.length) {
          await Promise.all(nonGuests.map(async p => {
            try {
              const s = await db.collection('users').doc(p.uid).get();
              if (s.exists && s.data().displayName) p.name = s.data().displayName;
            } catch(_) {}
          }));
        }
        return players.map(p => {
          const role = p.role || 'Player';
          const roleCls = role==='Captain'?'captain':role==='Wicketkeeper'||role==='Wicket-keeper'?'wk':'';
          return `<div class="player-row" style="cursor:default">
            <img src="${p.profilePic||Utils.initialsAvatar(p.name||p.uid||'?')}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0"/>
            <div style="flex:1;min-width:0">
              <span style="font-weight:500">${p.name||p.uid||'?'}</span>
              ${p.isGuest?'<span class="guest-badge" style="margin-left:6px">Guest</span>':''}
            </div>
            <span class="player-role-badge ${roleCls}">${role}</span>
          </div>`;
        }).join('');
      };
      const [html1, html2] = await Promise.all([
        renderSquad(t1Snap, match.team1Name),
        renderSquad(t2Snap, match.team2Name)
      ]);
      body.innerHTML = `
        <div style="margin-bottom:20px">
          <div style="font-weight:700;margin-bottom:8px;color:var(--accent)">${match.team1Name}</div>
          ${html1}
        </div>
        <div>
          <div style="font-weight:700;margin-bottom:8px;color:var(--blue)">${match.team2Name}</div>
          ${html2}
        </div>
      `;
    } catch(e) {
      if (body) body.innerHTML = '<div class="text-muted text-sm">Could not load squad data.</div>';
    }
  }

  // ── COMMENTARY ─────────────────────────────────────────────────────
  async function loadCommentary() {
    const body = document.getElementById('commentary-body');
    if (!body) return;
    try {
      const snap = await db.collection('matches').doc(matchId).collection('deliveries')
        .orderBy('timestamp').get();
      const deliveries = snap.docs.map(d=>d.data()).reverse();
      if (!deliveries.length) { body.innerHTML='<div class="text-muted text-sm">No balls bowled yet.</div>'; return; }
      body.innerHTML = deliveries.map(d => {
        const run = d.isWide?'Wide':d.isNoBall?'No Ball':d.wicket?`${d.wicket.type} — W!`:d.legalRuns===0?'Dot ball':`${d.legalRuns} run${d.legalRuns!==1?'s':''}`;
        const cls = d.wicket?'wicket':d.boundaryType===6?'six':d.boundaryType===4?'four':'';
        return `<div class="commentary-item ${cls}">
          <div class="comm-over text-xs text-muted">${d.over+1}.${d.ball+1}</div>
          <div class="comm-body">
            <div class="text-sm"><b>${d.bowlerName}</b> to <b>${d.batsmanName||'?'}</b> — ${run}${d.wicket?.fielder?` (${d.wicket.fielder})`:''}</div>
            ${d.note?`<div class="text-xs text-muted">${d.note}</div>`:''}
          </div>
          <div class="over-ball ${cls}" style="flex-shrink:0">${d.isWide?'Wd':d.isNoBall?'Nb':d.wicket?'W':d.legalRuns||'·'}</div>
        </div>`;
      }).join('');
    } catch(e) { if (body) body.innerHTML='<div class="text-muted text-sm">Commentary unavailable.</div>'; }
  }

  // ── CHAT ───────────────────────────────────────────────────────────
  function loadChat() {
    db.collection('matches').doc(matchId).collection('chat')
      .orderBy('timestamp').onSnapshot(snap => {
        const body = document.getElementById('chat-body');
        if (!body) return;
        const user = Auth.getUser();
        body.innerHTML = snap.docs.map(d=>{
          const m = d.data();
          const isMe = m.uid===user?.uid;
          return `<div style="display:flex;gap:8px;${isMe?'flex-direction:row-reverse':''}">
            <img src="${m.pic||Utils.initialsAvatar(m.name||'?')}" style="width:32px;height:32px;border-radius:50%;object-fit:cover;flex-shrink:0"/>
            <div class="chat-bubble ${isMe?'mine':''}">
              ${!isMe?`<div class="text-xs text-muted" style="margin-bottom:2px">${m.name||'?'}</div>`:''}
              <div class="text-sm">${m.text}</div>
            </div>
          </div>`;
        }).join('');
        body.scrollTop = body.scrollHeight;
      });
  }

  async function sendChat() {
    const inp = document.getElementById('chat-inp');
    const text = inp?.value.trim();
    if (!text) return;
    const user = Auth.getUser();
    const profile = Auth.getProfile();
    inp.value = '';
    await db.collection('matches').doc(matchId).collection('chat').add({
      uid: user.uid, name: profile?.displayName||user.displayName||'?',
      pic: profile?.profilePic||null, text,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  // ── MAN OF THE MATCH ───────────────────────────────────────────────
  async function showMoM() {
    const inn1 = (match.innings||[])[0];
    const inn2 = (match.innings||[])[1];
    const allPlayers = [
      ...Object.values((inn1?.batters||{})),
      ...Object.values((inn2?.batters||{}))
    ].filter((p,i,a)=>a.findIndex(x=>x.uid===p.uid)===i);
    Utils.modal(`
      <div class="modal-header">
        <h2 class="modal-title">🏅 Man of the Match</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">Select player</label>
        <select id="mom-sel">
          <option value="">Select…</option>
          ${allPlayers.map(p=>`<option value="${p.name||p.uid}">${p.name||p.uid||'?'}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Or enter name</label>
        <input type="text" id="mom-inp" value="${match.manOfMatch||''}" placeholder="Player name…"/>
      </div>
      <button class="btn btn-accent btn-full" onclick="MatchDetailPage.saveMoM()">Save</button>
    `);
  }

  async function saveMoM() {
    const name = document.getElementById('mom-inp')?.value.trim() || document.getElementById('mom-sel')?.value;
    if (!name) { Utils.toast('Enter a name.','error'); return; }
    await db.collection('matches').doc(matchId).update({ manOfMatch: name });
    Utils.closeModal();
    Utils.toast('Man of the Match saved!','success');
    match.manOfMatch = name;
  }

  return { render, switchTab, sendChat, showMoM, saveMoM };
})();
