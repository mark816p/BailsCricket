// BAILS — PUBLIC PLAYER PROFILE (career stats view)
const PlayerProfilePage = (() => {
  async function render(path, parts, params) {
    const uid = params.uid;
    if (uid.startsWith('ext_')) {
      return renderExternalPlayer(decodeURIComponent(uid.slice(4)));
    }
    
    Utils.render(`<div class="text-muted text-sm" style="padding:40px;text-align:center">Loading player…</div>`);
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (!snap.exists) { Utils.render('<p class="text-muted" style="padding:40px;text-align:center">Player not found.</p>'); return; }
      const profile = snap.data();
      const pic = profile.profilePic || Utils.initialsAvatar(profile.displayName||'?');

      const matchSnap = await db.collection('matches')
        .where('participants','array-contains',uid)
        .where('status','==','completed').limit(50).get();
      const matches = matchSnap.docs.map(d => d.data());

      let totalRuns=0, totalBalls=0, totalWickets=0, totalBowlBalls=0, totalBowlRuns=0;
      let innings=0, fifties=0, hundreds=0, fours=0, sixes=0, highScore=0;
      let catches=0, runOuts=0;
      const recentMatches = [];

      matches.forEach(m => {
        (m.innings||[]).forEach(inn => {
          const bat = (inn.batters||{})[uid];
          if (bat && bat.balls > 0) {
            innings++; totalRuns+=bat.runs||0; totalBalls+=bat.balls||0;
            fours+=bat.fours||0; sixes+=bat.sixes||0;
            if ((bat.runs||0) > highScore) highScore = bat.runs;
            if ((bat.runs||0)>=100) hundreds++; else if ((bat.runs||0)>=50) fifties++;
          }
          const bowl = (inn.bowlers||{})[uid];
          if (bowl && bowl.balls>0) { totalWickets+=bowl.wickets||0; totalBowlBalls+=bowl.balls||0; totalBowlRuns+=bowl.runs||0; }
        });
        const field = (m.fielding||{})[uid];
        if (field) { catches+=field.catches||0; runOuts+=field.runOuts||0; }
        recentMatches.push(m);
      });

      const avg  = innings ? (totalRuns/innings).toFixed(1) : '—';
      const sr   = totalBalls ? ((totalRuns/totalBalls)*100).toFixed(1) : '—';
      const bowlAvg  = totalWickets ? (totalBowlRuns/totalWickets).toFixed(1) : '—';
      const econ = totalBowlBalls ? ((totalBowlRuns/(totalBowlBalls/6))).toFixed(2) : '—';
      const styleStr = [profile.battingStyle, profile.bowlingHand&&profile.bowlingStyle?profile.bowlingHand+' '+profile.bowlingStyle:'', profile.isWicketkeeper?'WK':''].filter(Boolean).join(' · ');

      Utils.render(`
        <a href="#/search" onclick="Router.back(); return false;" class="btn btn-ghost btn-sm" style="margin-bottom:12px;padding-left:0">← Back</a>
        <div class="profile-hero">
          <div class="avatar xl"><img src="${pic}" alt="${Utils.escapeHtml(profile.displayName)}"/></div>
          <div class="profile-info">
            <div class="profile-name">${Utils.escapeHtml(profile.displayName)}</div>
            <div class="profile-username">@${Utils.escapeHtml(profile.username)}</div>
            ${styleStr?`<div class="text-xs text-muted" style="margin-top:4px">${Utils.escapeHtml(styleStr)}</div>`:''}
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Batting</div>
          <div class="stat-grid">
            <div class="stat-tile"><div class="stat-tile-val">${totalRuns}</div><div class="stat-tile-label">Runs</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${avg}</div><div class="stat-tile-label">Average</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${sr}</div><div class="stat-tile-label">Strike Rate</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${highScore}</div><div class="stat-tile-label">High Score</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${hundreds}</div><div class="stat-tile-label">100s</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${fifties}</div><div class="stat-tile-label">50s</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${fours}</div><div class="stat-tile-label">4s</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${sixes}</div><div class="stat-tile-label">6s</div></div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Bowling</div>
          <div class="stat-grid">
            <div class="stat-tile"><div class="stat-tile-val">${totalWickets}</div><div class="stat-tile-label">Wickets</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${bowlAvg}</div><div class="stat-tile-label">Average</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${econ}</div><div class="stat-tile-label">Economy</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${Utils.formatOvers(totalBowlBalls)}</div><div class="stat-tile-label">Overs</div></div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Fielding</div>
          <div class="stat-grid">
            <div class="stat-tile"><div class="stat-tile-val">${catches}</div><div class="stat-tile-label">Catches</div></div>
            <div class="stat-tile"><div class="stat-tile-val">${runOuts}</div><div class="stat-tile-label">Run Outs</div></div>
          </div>
        </div>

        <div class="settings-section">
          <div class="settings-section-title">Recent Matches (${recentMatches.length})</div>
          ${!recentMatches.length?'<div class="text-muted text-sm">No completed matches yet.</div>':
            recentMatches.slice(0,5).map(m=>`
              <a href="#/match/${m.id}" class="card card-clickable card-body" style="display:flex;justify-space-between;align-items:center;margin-bottom:8px">
                <div><div style="font-weight:600;font-size:13px">${Utils.escapeHtml(m.team1Name)} vs ${Utils.escapeHtml(m.team2Name)}</div>
                <div class="text-xs text-muted">${m.format||''} · ${Utils.fmtDate(m.scheduledAt)}</div></div>
                <span class="match-badge badge-completed">DONE</span>
              </a>`).join('')}
        </div>
      `);
    } catch (e) {
      Utils.render('<p class="text-muted" style="padding:40px;text-align:center">Error loading player profile.</p>');
    }
  }

  async function renderExternalPlayer(extName) {
    Utils.render(`<div class="text-muted text-sm" style="padding:40px;text-align:center">Loading ${Utils.escapeHtml(extName)}…</div>`);
    try {
      const url = \`https://bails-cricket-api.vercel.app/api/searchPlayers?q=\${encodeURIComponent(extName)}\`;
      const res = await fetch(url);
      const data = await res.json();
      let p = data.data && data.data.length > 0 ? data.data[0] : null;
      if (p && p.name.toLowerCase() !== extName.toLowerCase()) {
         p = data.data.find(x => x.name.toLowerCase() === extName.toLowerCase()) || p;
      }
      if (!p) {
         p = { name: extName, role: 'Player', country: '', image: '', batStyle: '', bowlStyle: '' };
      }
      
      const pic = p.image || Utils.initialsAvatar(p.name||'?');
      const roleBadge = p.role ? \`<span class="badge" style="background:var(--surface2);color:var(--text)">\${p.role}</span>\` : '';
      const ctryBadge = p.country ? \`<span class="badge" style="background:var(--surface2);color:var(--text)">\${p.country}</span>\` : '';
      
      const html = \`
      <div class="dash-layout">
        <div class="dash-main">
          <!-- Profile Header -->
          <div class="card card-body" style="display:flex;align-items:center;gap:16px;margin-bottom:24px">
            <div style="width:80px;height:80px;border-radius:50%;background:var(--surface2);background-image:url('\${pic}');background-size:cover;background-position:center;border:2px solid var(--border)"></div>
            <div style="flex:1">
              <div style="font-size:24px;font-weight:800">\${Utils.escapeHtml(p.name)}</div>
              <div style="display:flex;gap:8px;margin-top:6px;flex-wrap:wrap">\${roleBadge}\${ctryBadge}</div>
              <div style="margin-top:8px;font-size:13px;color:var(--muted)">
                \${p.batStyle ? \`<div>🏏 \${p.batStyle}</div>\` : ''}
                \${p.bowlStyle ? \`<div>🥎 \${p.bowlStyle}</div>\` : ''}
              </div>
            </div>
            <button class="btn btn-primary" onclick="Utils.toast('Added to favorites!', 'success')">⭐ Follow</button>
          </div>
          
          <div class="empty-state" style="padding:40px 20px">
            <div class="empty-icon">📊</div>
            <div class="empty-title">Official Stats</div>
            <div class="empty-desc">This is an external player. Detailed match-by-match stats from international/domestic leagues are coming soon.</div>
          </div>
        </div>
      </div>
      \`;
      Utils.render(html);
    } catch (e) {
      Utils.render('<p class="text-muted" style="padding:40px;text-align:center">Error loading player.</p>');
    }
  }

  return { render };
})();

