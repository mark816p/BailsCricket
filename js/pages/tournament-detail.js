// BAILS — TOURNAMENT DETAIL
const TournamentDetailPage = (() => {
  let tournamentId, tournament, matches, teams;

  async function render(path, parts, params) {
    tournamentId = params.id;
    Utils.setActivePage('tournaments');
    Utils.render(`<div class="text-muted text-sm" style="padding:40px;text-align:center">Loading…</div>`);
    await Auth.whenReady(); // avoid wrongly hiding host controls on a slow connection
    const snap = await db.collection('tournaments').doc(tournamentId).get();
    if (!snap.exists) { Utils.render('<p class="text-muted" style="padding:40px">Tournament not found.</p>'); return; }
    tournament = { id: snap.id, ...snap.data() };
    await fetchData();
    renderLayout();
  }

  async function fetchData() {
    const [mSnap, tSnap] = await Promise.all([
      db.collection('matches').where('tournamentId','==',tournamentId).orderBy('scheduledAt').get(),
      db.collection('teams').where('tournamentId','==',tournamentId).get()
    ]);
    matches = mSnap.docs.map(d => ({ id:d.id, ...d.data() }));
    teams   = tSnap.docs.map(d => ({ id:d.id, ...d.data() }));

    // Fallback for old data: if no teams found via tournamentId (field wasn't set
    // in older versions), extract unique teams from match documents and fetch them.
    if (teams.length === 0 && matches.length > 0) {
      const teamIds = [...new Set(matches.flatMap(m => [m.team1Id, m.team2Id].filter(Boolean)))];
      if (teamIds.length) {
        const teamSnaps = await Promise.all(teamIds.map(id => db.collection('teams').doc(id).get()));
        teams = teamSnaps.filter(s => s.exists).map(s => ({ id:s.id, ...s.data() }));
        // Backfill tournamentId on stale team docs so future queries work
        const batch = db.batch();
        let dirty = false;
        teams.forEach(t => { if (!t.tournamentId) { batch.update(db.collection('teams').doc(t.id), { tournamentId }); dirty = true; } });
        if (dirty) batch.commit().catch(e => console.warn('tournamentId backfill failed:', e));
      }
    }
  }

  function renderLayout() {
    const isHost  = Auth.isHost(tournament);
    const user    = Auth.getUser();
    const isFollowing = (Auth.getProfile()?.followingTournaments||[]).includes(tournamentId);
    const bg = tournament.picture
      ? `<img class="tournament-hero-img" src="${tournament.picture}" alt=""/>`
      : `<div style="height:140px;background:linear-gradient(135deg,var(--surface2),var(--surface3))"></div>`;

    Utils.render(`
      <div class="tournament-hero">
        ${bg}
        <div class="tournament-hero-overlay">
          <div style="display:flex;align-items:flex-end;justify-content:space-between">
            <div>
              <h1 class="tournament-hero-name" id="t-name">${tournament.name}</h1>
              <div class="tournament-hero-meta">${matches.length} matches · ${teams.length} teams</div>
            </div>
            <div style="display:flex;gap:8px">
              ${user && !isHost ? `<button class="btn btn-sm btn-outline" onclick="TournamentDetailPage.toggleFollow()">${isFollowing?'★ Following':'☆ Follow'}</button>` : ''}
              ${isHost ? `<button class="btn btn-sm btn-outline" onclick="TournamentDetailPage.openSettings()">⚙ Edit</button>` : ''}
            </div>
          </div>
        </div>
      </div>

      ${isHost ? `<div class="t-actions-row">
        <button class="btn btn-sm btn-accent" onclick="TournamentDetailPage.addMatch()">+ Match</button>
        <button class="btn btn-sm btn-outline" onclick="TournamentDetailPage.addTeam()">+ Team</button>
        <button class="btn btn-sm btn-outline" onclick="TournamentDetailPage.addCoHost()">+ Co-host</button>
        <button class="btn btn-sm btn-outline" onclick="TournamentDetailPage.addUmpire()">+ Umpire</button>
      </div>` : ''}

      <div class="tabs">
        <div class="tab active" onclick="TournamentDetailPage.switchTab('matches')">Matches</div>
        <div class="tab" onclick="TournamentDetailPage.switchTab('teams')">Teams</div>
        <div class="tab" onclick="TournamentDetailPage.switchTab('points')">Points</div>
        <div class="tab" onclick="TournamentDetailPage.switchTab('bracket')">Bracket</div>
        <div class="tab" onclick="TournamentDetailPage.switchTab('stats')">Stats</div>
      </div>
      <div id="t-tab-body"></div>
    `);
    renderTab('matches');
  }

  function switchTab(t) {
    document.querySelectorAll('.tabs .tab').forEach((el,i) =>
      el.classList.toggle('active', ['matches','teams','points','bracket','stats'][i] === t));
    renderTab(t);
  }

  function renderTab(t) {
    const body = document.getElementById('t-tab-body');
    if (!body) return;
    if (t==='matches')  body.innerHTML = renderMatches();
    else if (t==='teams')   body.innerHTML = renderTeams();
    else if (t==='points')  body.innerHTML = renderPointsTable();
    else if (t==='bracket') body.innerHTML = renderBracket();
    else if (t==='stats')   body.innerHTML = renderStats();
  }

  function renderMatches() {
    if (!matches.length) return `<div class="empty-state"><div class="empty-icon">🏏</div><div class="empty-title">No matches yet</div></div>`;
    return `<div class="card-grid-2">` + matches.map(m => {
      const badge = m.status==='live'?`<span class="match-badge badge-live">LIVE</span>`:m.status==='upcoming'?`<span class="match-badge badge-upcoming">UPCOMING</span>`:`<span class="match-badge badge-completed">COMPLETED</span>`;
      const inn1=(m.innings||[])[0], inn2=(m.innings||[])[1];
      return `<a href="#/match/${m.id}" class="card card-clickable match-card">
        <div class="match-card-teams">
          <div class="match-team-row"><span class="match-team-name">${m.team1Name}</span><span class="match-team-score">${inn1?inn1.runs+'/'+(inn1.wickets ?? 0):'—'}</span></div>
          <div class="match-team-row"><span class="match-team-name">${m.team2Name}</span><span class="match-team-score">${inn2?inn2.runs+'/'+(inn2.wickets ?? 0):'—'}</span></div>
        </div>
        <div class="match-meta">${badge}<span class="text-xs text-muted">${m.format||''}${m.bracketRound?' · '+m.bracketRound:''}</span></div>
      </a>`;
    }).join('') + `</div>`;
  }

  function renderTeams() {
    if (!teams.length) return `<div class="empty-state"><div class="empty-icon">👕</div><div class="empty-title">No teams yet</div></div>`;
    return `<div class="card-grid-2">` + teams.map(t => {
      const playerCount = Object.keys(t.players||{}).length;
      return `<a href="#/team/${t.id}" class="team-card card card-clickable">
        <div class="team-logo">
          ${t.picture
            ? `<img src="${t.picture}" alt="${t.name}" style="width:100%;height:100%;object-fit:cover"/>`
            : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:20px">👕</div>`}
        </div>
        <div class="team-info"><div class="team-name">${t.name}</div><div class="team-sub">${playerCount} player${playerCount!==1?'s':''}</div></div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </a>`;
    }).join('') + `</div>`;
  }

  function renderPointsTable() {
    const table = computePoints();
    if (!table.length) return `<div class="empty-state"><div class="empty-icon">📊</div><div class="empty-title">No data yet</div></div>`;
    return `<div style="overflow-x:auto"><table class="points-table"><thead><tr>
      <th>#</th><th>Team</th><th>P</th><th>W</th><th>L</th><th>T</th><th>NR</th><th>Pts</th><th>NRR</th>
    </tr></thead><tbody>
    ${table.map((row,i) => `<tr>
      <td>${i+1}</td>
      <td><span class="qual-dot ${i<2?'qualified':'eliminated'}"></span>${row.teamName}</td>
      <td>${row.played}</td><td>${row.won}</td><td>${row.lost}</td><td>${row.tied}</td><td>${row.nr}</td>
      <td><strong>${row.points}</strong></td>
      <td style="color:${row.nrr>=0?'var(--accent)':'var(--red)'}">${row.nrr>=0?'+':''}${row.nrr.toFixed(3)}</td>
    </tr>`).join('')}</tbody></table></div>`;
  }

  function renderBracket() {
    const completed = matches.filter(m => m.status==='completed');
    if (!completed.length) return `<div class="empty-state"><div class="empty-icon">🏅</div><div class="empty-title">No completed matches</div><div class="empty-desc">Bracket populates as matches finish.</div></div>`;
    const byRound = {};
    matches.forEach(m => { const r=m.bracketRound||'League'; if(!byRound[r]) byRound[r]=[]; byRound[r].push(m); });
    return `<div class="bracket-wrap"><div class="bracket">
      ${Object.entries(byRound).map(([roundName,rMatches]) => `
        <div class="bracket-round">
          <div class="bracket-round-title">${roundName}</div>
          ${rMatches.map(m => {
            const inn1=(m.innings||[])[0], inn2=(m.innings||[])[1];
            const t1w=m.result==='team1', t2w=m.result==='team2';
            return `<div class="bracket-match">
              <div class="bracket-team ${t1w?'winner':''}">${m.team1Name}<span class="bracket-team-score">${inn1?inn1.runs+'/'+(inn1.wickets ?? 0):'—'}</span></div>
              <div style="height:1px;background:var(--border)"></div>
              <div class="bracket-team ${t2w?'winner':''}">${m.team2Name}<span class="bracket-team-score">${inn2?inn2.runs+'/'+(inn2.wickets ?? 0):'—'}</span></div>
            </div><div style="height:12px"></div>`;
          }).join('')}
        </div>`).join('<div style="display:flex;align-items:center"><div style="width:32px;height:2px;background:var(--border)"></div></div>')}
    </div></div>`;
  }

  function renderStats() {
    const battersMap = {}, bowlersMap = {};
    matches.forEach(m => {
      (m.innings||[]).forEach(inn => {
        Object.values(inn.batters||{}).forEach(b => {
          if (!battersMap[b.uid]) battersMap[b.uid] = { name:b.name, runs:0, balls:0, fifties:0, hundreds:0 };
          battersMap[b.uid].runs  += b.runs||0; battersMap[b.uid].balls += b.balls||0;
          if ((b.runs||0)>=100) battersMap[b.uid].hundreds++; else if ((b.runs||0)>=50) battersMap[b.uid].fifties++;
        });
        Object.values(inn.bowlers||{}).forEach(b => {
          if (!bowlersMap[b.uid]) bowlersMap[b.uid] = { name:b.name, wickets:0, runs:0, balls:0 };
          bowlersMap[b.uid].wickets+=b.wickets||0; bowlersMap[b.uid].runs+=b.runs||0; bowlersMap[b.uid].balls+=b.balls||0;
        });
      });
    });
    const batters = Object.values(battersMap).sort((a,b)=>b.runs-a.runs).slice(0,5);
    const bowlers = Object.values(bowlersMap).sort((a,b)=>b.wickets-a.wickets||a.runs-b.runs).slice(0,5);
    if (!batters.length) return `<div class="empty-state"><div class="empty-icon">📈</div><div class="empty-title">No stats yet</div></div>`;
    return `
      <div class="section-title" style="margin-bottom:12px">🏏 Top Batters</div>
      <div style="overflow-x:auto"><table class="stats-table" style="margin-bottom:20px"><thead><tr><th>#</th><th>Batter</th><th>R</th><th>Avg</th><th>SR</th><th>50s</th><th>100s</th></tr></thead><tbody>
      ${batters.map((b,i)=>`<tr><td><span class="rank-badge ${['gold','silver','bronze','',''][i]}">${i+1}</span></td><td>${b.name}</td><td><b>${b.runs}</b></td><td>${b.hundreds+b.fifties?(b.runs/(b.hundreds+b.fifties)).toFixed(1):'—'}</td><td>${b.balls?((b.runs/b.balls)*100).toFixed(1):'—'}</td><td>${b.fifties}</td><td>${b.hundreds}</td></tr>`).join('')}
      </tbody></table></div>
      <div class="section-title" style="margin-bottom:12px">🎳 Top Bowlers</div>
      <div style="overflow-x:auto"><table class="stats-table"><thead><tr><th>#</th><th>Bowler</th><th>W</th><th>O</th><th>R</th><th>Econ</th></tr></thead><tbody>
      ${bowlers.map((b,i)=>`<tr><td><span class="rank-badge ${['gold','silver','bronze','',''][i]}">${i+1}</span></td><td>${b.name}</td><td><b>${b.wickets}</b></td><td>${Utils.formatOvers(b.balls)}</td><td>${b.runs}</td><td>${b.balls?((b.runs/(b.balls/6))).toFixed(2):'—'}</td></tr>`).join('')}
      </tbody></table></div>`;
  }

  function computePoints() {
    const map = {};
    teams.forEach(t => { map[t.id]={teamName:t.name,played:0,won:0,lost:0,tied:0,nr:0,points:0,runsFor:0,oversFor:0,runsAgainst:0,oversAgainst:0}; });
    matches.filter(m=>m.status==='completed').forEach(m => {
      const r1=map[m.team1Id],r2=map[m.team2Id]; if(!r1||!r2) return;
      const i1=(m.innings||[])[0],i2=(m.innings||[])[1]; if(!i1||!i2) return;
      r1.played++;r2.played++;
      r1.runsFor+=i1.runs;r1.oversFor+=i1.balls;r2.runsFor+=i2.runs;r2.oversFor+=i2.balls;
      r1.runsAgainst+=i2.runs;r1.oversAgainst+=i2.balls;r2.runsAgainst+=i1.runs;r2.oversAgainst+=i1.balls;
      if(m.result==='team1'){r1.won++;r1.points+=2;r2.lost++;}
      else if(m.result==='team2'){r2.won++;r2.points+=2;r1.lost++;}
      else if(m.result==='tie'){r1.tied++;r2.tied++;r1.points++;r2.points++;}
      else{r1.nr++;r2.nr++;r1.points++;r2.points++;}
    });
    return Object.values(map).map(r=>({
      ...r, nrr:r.oversFor&&r.oversAgainst?(r.runsFor/(r.oversFor/6))-(r.runsAgainst/(r.oversAgainst/6)):0
    })).sort((a,b)=>b.points-a.points||b.nrr-a.nrr);
  }

  async function toggleFollow() {
    const user = Auth.getUser(); if (!user) { Router.navigate('/login'); return; }
    const profile = Auth.getProfile();
    const isFollowing = (profile?.followingTournaments||[]).includes(tournamentId);
    await db.collection('users').doc(user.uid).update({
      followingTournaments: isFollowing
        ? firebase.firestore.FieldValue.arrayRemove(tournamentId)
        : firebase.firestore.FieldValue.arrayUnion(tournamentId)
    });
    Utils.toast(isFollowing ? 'Unfollowed.' : 'Following tournament!', 'success');
    await fetchData(); renderLayout();
  }

  // ── ADD MATCH ──────────────────────────────────────────────────────────────
  async function addMatch() {
    if (!teams.length) { Utils.toast('Add at least one team first.', 'error'); return; }
    const teamOptions  = teams.map(t=>`<option value="${t.id}">${t.name}</option>`).join('');
    const formatOptions = Object.keys(Utils.FORMATS).map(f=>`<option value="${f}">${f}</option>`).join('');
    const roundOptions  = ['League','Quarter Final','Semi Final','Final','3rd Place Play-off'].map(r=>`<option value="${r}">${r}</option>`).join('');
    Utils.modal(`
      <div class="modal-header"><h2 class="modal-title">Add Match</h2><button class="modal-close" onclick="Utils.closeModal()">✕</button></div>
      <div class="form-grid-2">
        <div class="form-group"><label class="form-label">Team 1</label><select id="m-t1">${teamOptions}</select></div>
        <div class="form-group"><label class="form-label">Team 2</label><select id="m-t2">${teamOptions}</select></div>
        <div class="form-group"><label class="form-label">Format</label><select id="m-fmt">${formatOptions}</select></div>
        <div class="form-group"><label class="form-label">Bracket Round</label><select id="m-round">${roundOptions}</select></div>
        <div class="form-group"><label class="form-label">Date &amp; Time</label><input type="datetime-local" id="m-date"/></div>
        <div class="form-group"><label class="form-label">Venue</label><input type="text" id="m-venue" placeholder="e.g. Wankhede Stadium"/></div>
      </div>
      <button class="btn btn-accent btn-full" id="save-match-btn" onclick="TournamentDetailPage.saveMatch()">Add Match</button>
    `);
  }

  async function saveMatch() {
    const btn = document.getElementById('save-match-btn');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const t1Id=document.getElementById('m-t1').value, t2Id=document.getElementById('m-t2').value;
      if (t1Id===t2Id) { Utils.toast('Teams must be different.','error'); return; }
      const fmt=document.getElementById('m-fmt').value;
      const dt=document.getElementById('m-date').value;
      const venue=document.getElementById('m-venue').value.trim();
      const bracketRound=document.getElementById('m-round').value;
      const t1=teams.find(t=>t.id===t1Id), t2=teams.find(t=>t.id===t2Id);
      const ref=db.collection('matches').doc();
      const user=Auth.getUser();
      await ref.set({
        id:ref.id, tournamentId,
        team1Id:t1Id, team1Name:t1.name, team1NameLower:t1.name.toLowerCase(),
        team2Id:t2Id, team2Name:t2.name, team2NameLower:t2.name.toLowerCase(),
        format:fmt, overs:Utils.FORMATS[fmt], venue, bracketRound,
        status:'upcoming',
        scheduledAt: dt ? new Date(dt) : firebase.firestore.FieldValue.serverTimestamp(),
        admins:[user.uid], participants:[], innings:[], result:null,
        powerplayOvers: fmt==='ODI'?10:fmt==='T20'?6:0,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      await db.collection('tournaments').doc(tournamentId).update({ matchCount: firebase.firestore.FieldValue.increment(1) });
      Utils.closeModal(); Utils.toast('Match added!','success');
      await fetchData(); renderTab('matches');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add Match'; }
    }
  }

  // ── ADD TEAM ───────────────────────────────────────────────────────────────
  async function addTeam() {
    Utils.modal(`
      <div class="modal-header"><h2 class="modal-title">Add Team</h2><button class="modal-close" onclick="Utils.closeModal()">✕</button></div>
      <div class="form-group"><label class="form-label">Team Name</label><input type="text" id="team-name" placeholder="e.g. Mumbai Mavericks"/></div>
      <div class="form-group">
        <label class="form-label">Team Logo <span style="color:var(--muted)">(optional · compressed to ≤100 KB)</span></label>
        <div class="img-upload-wrap" onclick="document.getElementById('team-logo-input').click()">
          <div id="team-logo-preview" style="font-size:32px;margin-bottom:8px">👕</div>
          <div class="text-sm text-muted">Tap to upload</div>
          <input type="file" id="team-logo-input" accept="image/*" style="display:none" onchange="TournamentDetailPage.handleLogoSelect(event)"/>
        </div>
      </div>
      <button class="btn btn-accent btn-full" id="save-team-btn" onclick="TournamentDetailPage.saveTeam()">Add Team</button>
    `);
  }

  let pendingLogoBase64 = null;
  async function handleLogoSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    Utils.toast('Compressing…','info');
    pendingLogoBase64 = await Utils.compressToBase64(file, 100);
    if (pendingLogoBase64) {
      document.getElementById('team-logo-preview').innerHTML =
        `<img src="${pendingLogoBase64}" style="width:60px;height:60px;border-radius:10px;object-fit:cover"/>`;
    }
  }

  async function saveTeam() {
    const btn = document.getElementById('save-team-btn');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const name = document.getElementById('team-name').value.trim();
      if (!name) { Utils.toast('Enter a team name.','error'); return; }
      const ref = db.collection('teams').doc();
      await ref.set({
        id:ref.id, name, nameLower:name.toLowerCase(), tournamentId,
        ownerId: Auth.getUser().uid, // required — TeamDetailPage's own admin checks fall back to this
        picture: pendingLogoBase64 || null,
        players:{},
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      pendingLogoBase64 = null;
      Utils.closeModal(); Utils.toast('Team created!','success');
      await fetchData(); renderTab('teams');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Add Team'; }
    }
  }

  // ── ADD CO-HOST / UMPIRE ───────────────────────────────────────────────────
  async function addCoHost() { await addRole('cohost','Co-host'); }
  async function addUmpire() { await addRole('umpire','Umpire'); }

  async function addRole(type, label) {
    Utils.modal(`
      <div class="modal-header"><h2 class="modal-title">Add ${label}</h2><button class="modal-close" onclick="Utils.closeModal()">✕</button></div>
      <p class="text-sm text-muted" style="margin-bottom:12px">Search by the person's Bails username to invite them.</p>
      <div class="form-group">
        <label class="form-label">Username</label>
        <input type="text" id="role-search" placeholder="e.g. virat18" oninput="TournamentDetailPage.searchUser(event,'${type}')"/>
      </div>
      <div id="role-results"></div>
    `);
  }

  async function searchUser(e, type) {
    const q = e.target.value.toLowerCase().trim(); if (!q) return;
    const snap = await db.collection('users').where('username','>=',q).where('username','<=',q+'\uf8ff').limit(8).get();
    const res = document.getElementById('role-results');
    if (!res) return;
    if (snap.empty) { res.innerHTML='<div class="text-muted text-sm">No user found.</div>'; return; }
    const myUid = Auth.getUser()?.uid;
    res.innerHTML = snap.docs
      .filter(d => d.data().uid !== myUid) // exclude self
      .map(d => {
        const u = d.data();
        const safeName = (u.displayName||'').replace(/&/g,'&amp;').replace(/"/g,'&quot;');
        const safePic  = (u.profilePic || Utils.initialsAvatar(u.displayName||'?')).replace(/"/g,'&quot;');
        return `<div class="player-row" style="cursor:default" data-uid="${u.uid}" data-name="${safeName}" data-type="${type}">
          <img src="${safePic}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;flex-shrink:0"/>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${u.displayName||''}</div>
            <div class="text-xs text-muted">@${u.username}</div>
          </div>
          <button class="btn btn-sm btn-accent" onclick="TournamentDetailPage.sendRoleInviteFromEl(this)">Invite</button>
        </div>`;
      }).join('');
  }

  async function sendRoleInviteFromEl(btn) {
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = 'Sending…';
    const row = btn.closest('[data-uid]');
    if (!row) { btn.disabled = false; btn.textContent = 'Invite'; return; }
    await sendRoleInvite(row.dataset.uid, row.dataset.name, row.dataset.type);
    btn.textContent = 'Sent ✓';
  }

  async function sendRoleInvite(toUid, toName, type) {
    const user = Auth.getUser();
    // Simple duplicate check — just by toUid + tournamentId + type
    // Avoids needing a composite index on the invitations collection
    const existing = await db.collection('invitations')
      .where('toUid','==',toUid)
      .where('tournamentId','==',tournamentId)
      .where('type','==',type)
      .get();
    const hasPending = existing.docs.some(d => d.data().status === 'pending');
    if (hasPending) { Utils.toast(`${toName} already has a pending invite.`, 'info'); return; }

    await db.collection('invitations').add({
      toUid,
      tournamentId,
      tournamentName: tournament.name,
      fromUid: user.uid,
      fromName: Auth.getProfile()?.displayName || 'Someone',
      type,
      status: 'pending',
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Utils.toast(`Invitation sent to ${toName}!`, 'success');
  }

  // ── EDIT TOURNAMENT ────────────────────────────────────────────────────────
  async function openSettings() {
    const safeName = tournament.name.replace(/"/g,'&quot;');
    Utils.modal(`
      <div class="modal-header"><h2 class="modal-title">Edit Tournament</h2><button class="modal-close" onclick="Utils.closeModal()">✕</button></div>
      <div class="form-group"><label class="form-label">Name</label><input type="text" id="t-edit-name" value="${safeName}"/></div>
      <div class="form-group">
        <label class="form-label">Cover Image <span style="color:var(--muted)">(compressed to ≤100 KB)</span></label>
        <div class="img-upload-wrap" onclick="document.getElementById('t-img-input').click()">
          ${tournament.picture
            ? `<img src="${tournament.picture}" id="t-img-preview" style="width:100%;height:80px;object-fit:cover;border-radius:8px"/>`
            : `<div id="t-img-preview" style="font-size:32px;text-align:center">🏆</div>`}
          <div class="text-sm text-muted" style="margin-top:8px">Tap to change</div>
          <input type="file" id="t-img-input" accept="image/*" style="display:none" onchange="TournamentDetailPage.handleTImgSelect(event)"/>
        </div>
      </div>
      <button class="btn btn-accent btn-full" id="save-t-btn" onclick="TournamentDetailPage.saveTournamentSettings()">Save Changes</button>
      <button class="btn btn-danger btn-full" style="margin-top:8px" onclick="TournamentDetailPage.deleteTournament()">Delete Tournament</button>
    `);
  }

  let pendingTImgBase64 = null;
  async function handleTImgSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    Utils.toast('Compressing…','info');
    pendingTImgBase64 = await Utils.compressToBase64(file, 100);
    if (pendingTImgBase64) {
      const prev = document.getElementById('t-img-preview');
      if (prev) prev.outerHTML = `<img src="${pendingTImgBase64}" id="t-img-preview" style="width:100%;height:80px;object-fit:cover;border-radius:8px"/>`;
    }
  }

  async function saveTournamentSettings() {
    const btn = document.getElementById('save-t-btn');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const name = document.getElementById('t-edit-name').value.trim();
      if (!name) { Utils.toast('Enter a name.','error'); return; }
      const upd = { name, nameLower: name.toLowerCase() };
      if (pendingTImgBase64) { upd.picture = pendingTImgBase64; pendingTImgBase64 = null; }
      await db.collection('tournaments').doc(tournamentId).update(upd);
      tournament = { ...tournament, ...upd };
      Utils.closeModal(); Utils.toast('Saved!','success');
      const el = document.getElementById('t-name');
      if (el) el.textContent = name;
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
    }
  }

  async function deleteTournament() {
    const ok = await Utils.confirmModal('Delete this tournament? This cannot be undone.', 'Delete', true);
    if (!ok) return;
    await db.collection('tournaments').doc(tournamentId).delete();
    Utils.closeModal(); Router.navigate('/tournaments'); Utils.toast('Tournament deleted.','info');
  }

  return {
    render, switchTab, addMatch, saveMatch, addTeam, handleLogoSelect, saveTeam,
    addCoHost, addUmpire, searchUser, sendRoleInvite, sendRoleInviteFromEl,
    openSettings, handleTImgSelect, saveTournamentSettings, deleteTournament, toggleFollow
  };
})();
