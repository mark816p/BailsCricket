// BAILS — MY TOURNAMENTS
const TournamentsPage = (() => {
  async function render() {
    Utils.setActivePage('tournaments');
    const user = Auth.getUser();
    if (!user) {
      Utils.render(`<div class="empty-state"><div class="empty-icon">🔐</div><div class="empty-title">Sign in required</div><a href="#/login" class="btn btn-accent mt-16">Sign In</a></div>`);
      return;
    }
    Utils.render(`
      <div class="section-header">
        <span class="page-title">Tournaments</span>
        <button class="btn btn-sm btn-accent" onclick="TournamentsPage.createNew()">+ New</button>
      </div>
      <div id="tournaments-list"><div class="text-muted text-sm">Loading…</div></div>
    `);
    loadTournaments(user.uid);
  }

  async function loadTournaments(uid) {
    const list  = document.getElementById('tournaments-list');
    const snaps = await Promise.all([
      db.collection('tournaments').where('ownerId','==',uid).get(),
      db.collection('tournaments').where('coHosts','array-contains',uid).get(),
      db.collection('tournaments').where('umpires','array-contains',uid).get()
    ]);
    const seen = new Set(); const all = [];
    snaps.forEach(snap => snap.docs.forEach(d => {
      if (!seen.has(d.id)) { seen.add(d.id); all.push({ id: d.id, ...d.data() }); }
    }));
    all.sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    if (!all.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏆</div><div class="empty-title">No tournaments yet</div><div class="empty-desc">Create your first tournament to get started.</div><button class="btn btn-accent mt-16" onclick="TournamentsPage.createNew()">Create Tournament</button></div>`;
      return;
    }

    // Primary: count teams that have tournamentId set (works for all new data).
    // Fallback: if zero, count unique team IDs from the tournament's match docs
    // — this handles legacy data where teams were created before the tournamentId
    // field was stored on team documents.
    const teamCounts = await Promise.all(all.map(async t => {
      const count = await db.collection('teams').where('tournamentId','==',t.id)
        .get().then(s => s.size).catch(() => 0);
      if (count > 0) return count;
      // Fallback for old data
      const mSnap = await db.collection('matches').where('tournamentId','==',t.id)
        .get().catch(() => null);
      if (!mSnap) return 0;
      const teamIds = new Set();
      mSnap.docs.forEach(d => {
        const data = d.data();
        if (data.team1Id) teamIds.add(data.team1Id);
        if (data.team2Id) teamIds.add(data.team2Id);
      });
      return teamIds.size;
    }));

    list.innerHTML = all.map((t,i) => `
      <a href="#/tournament/${t.id}" class="card card-clickable" style="display:flex;align-items:center;gap:14px;padding:14px 16px;margin-bottom:8px">
        <div style="width:44px;height:44px;border-radius:10px;background:var(--surface2);display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;overflow:hidden">
          ${t.picture ? `<img src="${t.picture}" style="width:100%;height:100%;object-fit:cover"/>` : '🏆'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px">${t.name}</div>
          <div class="text-sm text-muted">${t.matchCount||0} matches · ${teamCounts[i]} team${teamCounts[i]!==1?'s':''}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
      </a>
    `).join('');
  }

  let _creating = false;
  async function createNew() {
    if (_creating) return;
    _creating = true;
    const user = Auth.getUser();
    const ref  = db.collection('tournaments').doc();
    await ref.set({
      id: ref.id, name: 'Untitled Tournament', nameLower: 'untitled tournament',
      ownerId: user.uid, coHosts: [], umpires: [], teams: [], matchCount: 0,
      format: 'league', rounds: [],
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Router.navigate(`/tournament/${ref.id}`);
    _creating = false;
  }

  return { render, createNew };
})();
