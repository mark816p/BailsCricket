// BAILS — MY MATCHES
const MyMatchesPage = (() => {
  let currentTab = 'upcoming';

  async function render() {
    Utils.setActivePage('my-matches');
    const user = Auth.getUser();
    if (!user) {
      Utils.render(`<div class="empty-state"><div class="empty-icon">🔐</div><div class="empty-title">Sign in required</div><a href="#/login" class="btn btn-accent mt-16">Sign In</a></div>`);
      return;
    }
    Utils.render(`
      <div class="section-header"><span class="page-title">My Matches</span></div>
      <div class="tabs" id="match-tabs">
        <div class="tab active" onclick="MyMatchesPage.switchTab('upcoming')">Upcoming</div>
        <div class="tab" onclick="MyMatchesPage.switchTab('live')">Live</div>
        <div class="tab" onclick="MyMatchesPage.switchTab('completed')">Completed</div>
      </div>
      <div id="match-list"><div class="text-muted text-sm">Loading…</div></div>
    `);
    loadMatches('upcoming');
  }

  function switchTab(tab) {
    currentTab = tab;
    document.querySelectorAll('#match-tabs .tab').forEach((t,i) => t.classList.toggle('active',['upcoming','live','completed'][i]===tab));
    loadMatches(tab);
  }

  async function loadMatches(status) {
    const user = Auth.getUser();
    const list = document.getElementById('match-list');
    if (!list) return;
    list.innerHTML = `<div class="text-muted text-sm">Loading…</div>`;
    const snap = await db.collection('matches').where('participants','array-contains',user.uid).where('status','==',status).orderBy('scheduledAt',status==='completed'?'desc':'asc').limit(30).get();
    if (snap.empty) { list.innerHTML = `<div class="empty-state"><div class="empty-icon">🏏</div><div class="empty-title">No ${status} matches</div></div>`; return; }
    list.innerHTML = snap.docs.map(d => {
      const m = { id: d.id, ...d.data() };
      const badge = m.status==='live'?`<span class="match-badge badge-live">LIVE</span>`:m.status==='upcoming'?`<span class="match-badge badge-upcoming">UPCOMING</span>`:`<span class="match-badge badge-completed">COMPLETED</span>`;
      const inn1=(m.innings||[])[0], inn2=(m.innings||[])[1];
      return `<a href="#/match/${m.id}" class="card card-clickable match-card" style="margin-bottom:8px">
        <div class="match-card-teams">
          <div class="match-team-row"><span class="match-team-name">${Utils.escapeHtml(m.team1Name)}</span><span class="match-team-score">${inn1 ? inn1.runs+'/'+( inn1.wickets ?? 0) : '—'}</span></div>
          <div class="match-team-row"><span class="match-team-name">${Utils.escapeHtml(m.team2Name)}</span><span class="match-team-score">${inn2 ? inn2.runs+'/'+( inn2.wickets ?? 0) : '—'}</span></div>
        </div>
        <div class="match-meta">${badge}<span class="text-xs text-muted">${m.format||''} · ${Utils.fmtDate(m.scheduledAt)}</span></div>
        ${m.resultText?`<div class="text-sm text-accent" style="margin-top:6px">${Utils.escapeHtml(m.resultText)}</div>`:''}
      </a>`;
    }).join('');
  }
  return { render, switchTab };
})();

