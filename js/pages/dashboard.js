// BAILS — DASHBOARD
const DashboardPage = (() => {
  let _pollInterval = null;

  function startPolling() {
    stopPolling();
    _pollInterval = setInterval(() => {
      const hash = location.hash;
      if (hash && hash !== '#/' && !hash.startsWith('#/dashboard')) {
        stopPolling();
        return;
      }
      loadNearbyMatches();
    }, 30000);
  }

  function stopPolling() {
    if (_pollInterval) {
      clearInterval(_pollInterval);
      _pollInterval = null;
    }
  }

  async function render() {
    Utils.setActivePage('dashboard');
    const user    = Auth.getUser();
    const profile = Auth.getProfile();
    const name    = (profile && (profile.displayName || profile.username)) || (user && user.displayName) || null;
    const pic     = profile && (profile.profilePic || Utils.initialsAvatar(profile.displayName || '?'));
    const hour    = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

    Utils.render(`
      <div class="dash-welcome">
        <div class="dash-welcome-left">
          ${pic ? `<img src="${pic}" class="dash-avatar"/>` : `<div class="dash-avatar dash-avatar-placeholder">🏏</div>`}
          <div>
            <div class="dash-greeting">${greeting}${name ? ', ' + name.split(' ')[0] : ''}!</div>
            <div class="dash-subtitle">Here's what's happening in cricket</div>
          </div>
        </div>
        <div class="dash-quick-actions">
          <a href="#nearby-list" class="btn btn-outline btn-sm">🌐 Live Scores</a>
          <a href="#/tournaments" class="btn btn-accent btn-sm">+ Tournament</a>
          <a href="#/my-matches" class="btn btn-outline btn-sm">My Matches</a>
        </div>
      </div>

      ${user ? `<div id="dash-stat-strip" class="dash-stat-strip">
        <div class="dash-stat-item"><div class="dash-stat-val" style="color:var(--muted)">—</div><div class="dash-stat-lbl">Matches</div></div>
        <div class="dash-stat-item"><div class="dash-stat-val" style="color:var(--muted)">—</div><div class="dash-stat-lbl">Live Now</div></div>
        <div class="dash-stat-item"><div class="dash-stat-val" style="color:var(--muted)">—</div><div class="dash-stat-lbl">Wins</div></div>
      </div>` : ''}

      <div id="invitations-section"></div>

      <div class="dash-layout">
        <div class="dash-main">
          <div class="section-header">
            <span class="section-title">🏏 Live &amp; Upcoming Matches</span>
            <div style="display:flex;align-items:center;gap:8px">
              <span id="stale-data-warning" class="text-xs" style="display:none;color:var(--gold)">⚠️ API Limit (Delayed Data)</span>
            </div>
          </div>
          <div id="nearby-list"><div class="text-muted text-sm">Loading matches…</div></div>
        </div>
        <div class="dash-sidebar">
          <div class="section-header">
            <span class="section-title">📋 My Matches</span>
            <a href="#/my-matches" class="btn btn-ghost btn-sm" style="font-size:12px">All →</a>
          </div>
          <div id="my-matches-preview"><div class="text-muted text-sm">Loading…</div></div>
          <div id="following-section" style="margin-top:20px"></div>
          ${!user ? `<div class="card card-body" style="text-align:center;margin-top:16px">
            <div style="font-size:32px;margin-bottom:8px">🔐</div>
            <div style="font-weight:600;margin-bottom:6px">Sign in to Bails</div>
            <div class="text-sm text-muted" style="margin-bottom:14px">Track your matches, join tournaments and score live.</div>
            <a href="#/login" class="btn btn-accent btn-full">Sign In</a>
          </div>` : ''}
        </div>
      </div>
    `);

    if (user) loadStatStrip(user.uid);
    loadInvitations();
    loadNearbyMatches();
    loadFollowingTournaments();
    loadMyMatchesPreview();
    startPolling();
  }

  async function loadStatStrip(uid) {
    const strip = document.getElementById('dash-stat-strip');
    if (!strip) return;
    try {
      const snap = await db.collection('matches')
        .where('participants','array-contains', uid)
        .orderBy('scheduledAt','desc').limit(50).get();
      const all   = snap.docs.map(d => d.data());
      const total = all.length;
      const live  = all.filter(m => m.status === 'live').length;

      // Bug fix: wins were always 0 because the old logic checked m.admins
      // (who scored the match) instead of which team the user actually played for.
      // Now we inspect innings data to find which team the user batted / bowled for
      // and then check if that team won.
      let won = 0;
      all.forEach(m => {
        if (m.status !== 'completed' || !m.result || m.result === 'tie' || m.result === 'draw') return;
        const winTeamId = m.result === 'team1' ? m.team1Id : m.result === 'team2' ? m.team2Id : null;
        if (!winTeamId) return;
        const innings = Array.isArray(m.innings) ? m.innings : Object.values(m.innings || {});
        const userWon = innings.some(inn => {
          if (inn.battingTeamId === winTeamId  && inn.batters?.[uid])  return true;
          if (inn.bowlingTeamId === winTeamId  && inn.bowlers?.[uid])  return true;
          return false;
        });
        if (userWon) won++;
      });

      strip.innerHTML = `
        <div class="dash-stat-item">
          <div class="dash-stat-val">${total}</div>
          <div class="dash-stat-lbl">Matches</div>
        </div>
        <div class="dash-stat-item">
          <div class="dash-stat-val" style="color:${live>0?'var(--red)':'var(--text)'}">${live}</div>
          <div class="dash-stat-lbl">Live Now</div>
        </div>
        <div class="dash-stat-item">
          <div class="dash-stat-val" style="color:var(--accent)">${won}</div>
          <div class="dash-stat-lbl">Wins</div>
        </div>`;
    } catch(e) { if (strip) strip.remove(); }
  }

  async function loadInvitations() {
    const user = Auth.getUser(); if (!user) return;
    const snap = await db.collection('invitations')
      .where('toUid','==',user.uid).where('status','==','pending')
      .orderBy('createdAt','desc').limit(5).get();
    const section = document.getElementById('invitations-section');
    if (!section) return;
    if (snap.empty) { section.innerHTML = ''; return; }
    section.innerHTML =
      `<div class="section-header" style="margin-bottom:10px">
         <span class="section-title">🔔 Invitations</span>
         <span class="text-xs text-muted">${snap.size} pending</span>
       </div>` +
      snap.docs.map(d => {
        const inv  = d.data();
        const icon  = inv.type==='cohost'?'🤝':inv.type==='umpire'?'⚖️':'👕';
        const label = inv.type==='cohost'?'Co-host':inv.type==='umpire'?'Umpire':'Team member';
        return `<div class="invite-card">
          <div class="invite-card-info">
            <div class="invite-card-title">${icon} ${label} invitation</div>
            <div class="invite-card-sub">
              ${inv.tournamentName ? `<strong>${inv.tournamentName}</strong>` : ''}
              ${inv.fromName ? ` · from ${inv.fromName}` : ''}
            </div>
          </div>
          <div class="invite-actions">
            <button class="btn btn-sm btn-outline" onclick="DashboardPage.declineInv('${d.id}')">Decline</button>
            <button class="btn btn-sm btn-accent" onclick="DashboardPage.acceptInv('${d.id}','${inv.type}','${inv.tournamentId||''}','${inv.teamId||''}')">Accept</button>
          </div>
        </div>`;
      }).join('') + `<div style="margin-bottom:16px"></div>`;
  }

  async function acceptInv(invId, type, tournamentId, teamId) {
    const user = Auth.getUser(); if (!user) return;
    const profile = Auth.getProfile();
    const btn = document.querySelector(`[onclick*="acceptInv('${invId}'"]`);
    if (btn) { btn.disabled = true; btn.textContent = 'Accepting…'; }
    try {
      const batch = db.batch();
      batch.update(db.collection('invitations').doc(invId), { status: 'accepted' });
      if (type === 'cohost') {
        batch.update(db.collection('tournaments').doc(tournamentId), { coHosts: firebase.firestore.FieldValue.arrayUnion(user.uid) });
      } else if (type === 'umpire') {
        batch.update(db.collection('tournaments').doc(tournamentId), { umpires: firebase.firestore.FieldValue.arrayUnion(user.uid) });
      } else if (type === 'player' && teamId) {
        const playerName = profile?.displayName || user.displayName || 'Player';
        batch.update(db.collection('teams').doc(teamId), {
          [`players.${user.uid}`]: { uid: user.uid, name: playerName, role: 'Batsman', isGuest: false }
        });
      }
      await batch.commit();
      Utils.toast('Invitation accepted!', 'success');
      loadInvitations();
    } catch(e) {
      console.error('acceptInv failed:', e);
      Utils.toast('Failed to accept. Try again.', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Accept'; }
    }
  }

  async function declineInv(invId) {
    await db.collection('invitations').doc(invId).update({ status: 'declined' });
    Utils.toast('Declined.', 'info');
    loadInvitations();
  }

  async function loadNearbyMatches() {
    const list = document.getElementById('nearby-list'); if (!list) return;
    let bailsMatches = [];
    let extMatches = [];
    let staleData = false;

    try {
      const snap = await db.collection('matches').where('status','==','live').limit(6).get();
      bailsMatches = snap.docs.map(d => ({ isInternal: true, id:d.id, ...d.data() }));
      if (bailsMatches.length < 6) {
        const up = await db.collection('matches').where('status','==','upcoming')
          .orderBy('scheduledAt').limit(6-bailsMatches.length).get();
        bailsMatches = bailsMatches.concat(up.docs.map(d => ({ isInternal: true, id:d.id, ...d.data() })));
      }
    } catch(e) {}

    if (typeof LiveCricket !== 'undefined') {
      try {
        const extData = await LiveCricket.refreshIfStale(false);
        extMatches = (extData.matches || []).map(m => ({ ...m, isExternal: true }));
        if (extData.budgetExhausted) staleData = true;
      } catch(e) { console.warn('Live cricket fetch error in dashboard', e); }
    }

    const warningEl = document.getElementById('stale-data-warning');
    if (warningEl && staleData) warningEl.style.display = 'inline-block';

    const allMatches = [...bailsMatches, ...extMatches];
    
    allMatches.sort((a, b) => {
      const aLive = a.isExternal ? a.isLive : (a.status === 'live');
      const bLive = b.isExternal ? b.isLive : (b.status === 'live');
      if (aLive && !bLive) return -1;
      if (!aLive && bLive) return 1;
      const aTime = a.scheduledAt || 0;
      const bTime = b.scheduledAt || 0;
      return bTime > aTime ? 1 : (bTime < aTime ? -1 : 0);
    });

    if (!allMatches.length) {
      list.innerHTML = `<div class="empty-state" style="padding:32px"><div class="empty-icon">🏟️</div><div class="empty-title">No matches found</div><div class="empty-desc">Live and upcoming matches will appear here.</div></div>`;
      return;
    }
    list.innerHTML = `<div class="list-gap">` + allMatches.map(m => m.isExternal ? extMatchCard(m) : matchCard(m)).join('') + `</div>`;
  }

  function extMatchCard(m) {
    // Defensive helpers — prevent [object Object] if any field is an unexpected type
    const str = v => (v != null ? String(v) : '');
    const safeStr = v => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (typeof v === 'object' && !Array.isArray(v)) {
        const best = v.name || v.full || v.long || v.value || v.text || v.short || Object.values(v)[0];
        return best != null ? String(best) : '[?]';
      }
      return String(v);
    };
    const t1 = m.team1 && typeof m.team1 === 'object' ? m.team1 : { name: String(m.team1 || 'Team 1'), score: null };
    const t2 = m.team2 && typeof m.team2 === 'object' ? m.team2 : { name: String(m.team2 || 'Team 2'), score: null };
    return `<a href="#/live-cricket/${encodeURIComponent(m.id)}" class="card card-clickable match-card ext-match-card">
      <div class="match-card-teams">
        <div class="match-team-row"><span class="match-team-name">${safeStr(t1.name)}</span><span class="match-team-score">${str(t1.score) || '\u2014'}</span></div>
        <div class="match-team-row"><span class="match-team-name">${safeStr(t2.name)}</span><span class="match-team-score">${str(t2.score) || '\u2014'}</span></div>
      </div>
      <div class="match-meta">
        ${m.isLive ? `<span class="match-badge badge-live">LIVE</span>` : m.isCompleted ? `<span class="match-badge badge-completed">DONE</span>` : `<span class="match-badge badge-upcoming">UPCOMING</span>`}
        <span class="text-xs text-muted" style="color:var(--blue);font-weight:600">\ud83c\udf10 World</span>
        ${m.gender==='women' ? `<span class="ext-gender-tag">Women's</span>` : ''}
        <span class="text-xs text-muted">${str(m.matchType)}</span>
      </div>
    </a>`;
  }

  async function loadFollowingTournaments() {
    const profile   = Auth.getProfile();
    const following = (profile && profile.followingTournaments) || [];
    if (!following.length) return;
    const snaps     = await Promise.all(following.map(id => db.collection('tournaments').doc(id).get()));
    const tournaments = snaps.filter(s => s.exists).map(s => ({ id:s.id, ...s.data() }));
    if (!tournaments.length) return;
    const section = document.getElementById('following-section'); if (!section) return;
    section.innerHTML = `
      <div class="section-header"><span class="section-title">🏆 Following</span></div>
      <div class="list-gap">
        ${tournaments.map(t => `
          <a href="#/tournament/${t.id}" class="card card-clickable card-body" style="display:flex;align-items:center;gap:12px">
            <div style="width:36px;height:36px;border-radius:8px;background:var(--surface2);overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:18px;flex-shrink:0">
              ${t.picture ? `<img src="${t.picture}" style="width:100%;height:100%;object-fit:cover"/>` : '🏆'}
            </div>
            <div style="flex:1;min-width:0">
              <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.name}</div>
              <div class="text-xs text-muted">${t.matchCount||0} matches</div>
            </div>
          </a>`).join('')}
      </div>`;
  }

  async function loadMyMatchesPreview() {
    const user      = Auth.getUser();
    const container = document.getElementById('my-matches-preview'); if (!container) return;
    if (!user) { container.innerHTML = ''; return; }
    try {
      const snap = await db.collection('matches')
        .where('participants','array-contains', user.uid)
        .orderBy('scheduledAt','desc').limit(4).get();
      if (snap.empty) {
        container.innerHTML = `<div style="text-align:center;padding:20px;color:var(--subtext);font-size:13px">No matches yet. <a href="#/tournaments" style="color:var(--accent)">Join a tournament →</a></div>`;
        return;
      }
      container.innerHTML = `<div class="list-gap">` + snap.docs.map(d => matchCard({ id:d.id, ...d.data() })).join('') + `</div>`;
    } catch(e) { container.innerHTML = ''; }
  }

  function matchCard(m) {
    const badge = m.status==='live'
      ? `<span class="match-badge badge-live">LIVE</span>`
      : m.status==='upcoming'
      ? `<span class="match-badge badge-upcoming">UPCOMING</span>`
      : `<span class="match-badge badge-completed">COMPLETED</span>`;
    const inn1 = (m.innings||[])[0], inn2 = (m.innings||[])[1];
    // Guard against undefined wickets (innings map corruption on old data)
    const t1Score = inn1 ? `${inn1.runs}/${inn1.wickets ?? 0}` : '—';
    const t2Score = inn2 ? `${inn2.runs}/${inn2.wickets ?? 0}` : '—';
    const t1Ov   = inn1 ? `<span class="overs">(${Utils.formatOvers(inn1.balls)} ov)</span>` : '';
    const t2Ov   = inn2 ? `<span class="overs">(${Utils.formatOvers(inn2.balls)} ov)</span>` : '';
    const meta   = [m.format, m.venue].filter(Boolean).join(' · ');
    return `<a href="#/match/${m.id}" class="card card-clickable match-card">
      <div class="match-card-teams">
        <div class="match-team-row">
          <span class="match-team-name">${m.team1Name||'Team A'}</span>
          <span class="match-team-score">${t1Score}${t1Ov}</span>
        </div>
        <div class="match-team-row">
          <span class="match-team-name">${m.team2Name||'Team B'}</span>
          <span class="match-team-score">${t2Score}${t2Ov}</span>
        </div>
      </div>
      <div class="match-meta">
        ${badge}
        ${meta ? `<span class="text-xs text-muted">${meta}</span>` : ''}
        ${m.resultText ? `<span class="text-xs text-accent">${m.resultText}</span>` : ''}
      </div>
    </a>`;
  }

  return { render, acceptInv, declineInv };
})();
