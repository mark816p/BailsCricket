// BAILS — PROFILE & SETTINGS (Spark Edition)
// Changes: images stored as base64 in Firestore; push notifications removed.
const ProfilePage = (() => {
  async function render() {
    Utils.setActivePage('profile');
    const user = Auth.getUser();
    if (!user) {
      Utils.render(`
        <div class="auth-page">
          <div style="font-size:48px;margin-bottom:16px">🏏</div>
          <h1 class="auth-title">Sign in to Bails</h1>
          <p class="auth-sub">Track your stats, join tournaments and score matches.</p>
          <div class="auth-providers">
            <button class="auth-provider-btn" onclick="Auth.signIn('google')">
              <svg class="auth-provider-icon" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
              Continue with Google
            </button>
            <button class="auth-provider-btn" onclick="Auth.signIn('twitter')">
              <svg class="auth-provider-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
              Continue with X (Twitter)
            </button>
          </div>
          <p class="terms-notice">By signing in you agree to our <a href="#/terms">Terms of Service</a> and <a href="#/privacy">Privacy Policy</a>.</p>
          <div style="text-align:center;font-size:11px;color:var(--muted);margin-top:16px;opacity:.6">Bails ${Utils.APP_VERSION}</div>
        </div>
      `);
      return;
    }
    const profile = Auth.getProfile();
    const pic = profile?.profilePic || Utils.initialsAvatar(profile?.displayName||'?');
    Utils.render(`
      <div class="profile-hero">
        <div class="avatar xl" style="cursor:pointer" title="Tap to change photo" onclick="document.getElementById('profile-pic-input').click()">
          <img src="${pic}" alt="Profile" id="profile-pic-img"/>
        </div>
        <div class="profile-info">
          <div class="profile-name">${Utils.escapeHtml(profile?.displayName||'User')}</div>
          <div class="profile-username">@${Utils.escapeHtml(profile?.username||'')}</div>
          <div class="text-xs text-muted" style="margin-top:4px">Tap photo to change</div>
        </div>
        <button class="btn btn-sm btn-outline" onclick="ProfilePage.editDisplayName()">Edit Name</button>
      </div>
      <!-- Profile pic file input — triggers compressToBase64 then saves to Firestore -->
      <input type="file" id="profile-pic-input" accept="image/*" style="display:none" onchange="ProfilePage.handlePicChange(event)"/>

      <div class="settings-section">
        <div class="settings-section-title">Playing Style</div>
        <div class="toggle-row">
          <span class="toggle-label">Batting Hand</span>
          <div class="toggle-btn">
            <button class="toggle-opt ${profile?.battingStyle==='LHB'?'active':''}" onclick="ProfilePage.setStat('battingStyle','LHB')">LHB</button>
            <button class="toggle-opt ${profile?.battingStyle==='RHB'?'active':''}" onclick="ProfilePage.setStat('battingStyle','RHB')">RHB</button>
          </div>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Bowling Hand</span>
          <div class="toggle-btn">
            <button class="toggle-opt ${profile?.bowlingHand==='Left'?'active':''}" onclick="ProfilePage.setStat('bowlingHand','Left')">Left</button>
            <button class="toggle-opt ${profile?.bowlingHand==='Right'?'active':''}" onclick="ProfilePage.setStat('bowlingHand','Right')">Right</button>
          </div>
        </div>
        <div class="toggle-row">
          <span class="toggle-label">Bowling Style</span>
          <div class="toggle-btn">
            <button class="toggle-opt ${profile?.bowlingStyle==='Pace'?'active':''}" onclick="ProfilePage.setStat('bowlingStyle','Pace')">Pace</button>
            <button class="toggle-opt ${profile?.bowlingStyle==='Spin'?'active':''}" onclick="ProfilePage.setStat('bowlingStyle','Spin')">Spin</button>
            <button class="toggle-opt ${profile?.bowlingStyle==='Throw'?'active':''}" onclick="ProfilePage.setStat('bowlingStyle','Throw')">Throw</button>
          </div>
        </div>
        <div class="checkbox-row" onclick="ProfilePage.toggleWK()">
          <div class="checkbox-custom ${profile?.isWicketkeeper?'checked':''}" id="wk-check">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <span class="checkbox-label">I'm a Wicket-keeper</span>
        </div>
      </div>

      <div class="settings-section" id="career-stats-section">
        <div class="settings-section-title">My Career Stats</div>
        <div class="text-muted text-sm">Loading…</div>
      </div>

      <hr class="divider"/>
      <button class="btn btn-danger btn-full" onclick="Auth.signOut()">Sign Out</button>
      <div style="height:20px"></div>
      <div style="text-align:center;font-size:12px;color:var(--muted)">
        <a href="#/privacy" style="color:var(--accent)">Privacy Policy</a> ·
        <a href="#/terms" style="color:var(--accent)">Terms of Service</a>
      </div>
      <div style="text-align:center;font-size:11px;color:var(--muted);margin-top:8px;opacity:.6">Bails ${Utils.APP_VERSION}</div>
    `);
    loadCareerStats(user.uid);
  }

  async function loadCareerStats(uid) {
    const section = document.getElementById('career-stats-section');
    if (!section) return;
    try {
      const snap = await db.collection('matches')
        .where('participants','array-contains',uid)
        .where('status','==','completed').limit(50).get();
      const matchList = snap.docs.map(d => d.data());
      let totalRuns=0,totalBalls=0,totalWickets=0,totalBowlBalls=0,totalBowlRuns=0;
      let innings=0,fifties=0,hundreds=0,fours=0,sixes=0,highScore=0;

      matchList.forEach(m => {
        (m.innings||[]).forEach(inn => {
          const bat = (inn.batters||{})[uid];
          if (bat && bat.balls>0) {
            innings++; totalRuns+=bat.runs||0; totalBalls+=bat.balls||0;
            fours+=bat.fours||0; sixes+=bat.sixes||0;
            if((bat.runs||0)>highScore) highScore=bat.runs;
            if((bat.runs||0)>=100) hundreds++; else if((bat.runs||0)>=50) fifties++;
          }
          const bowl = (inn.bowlers||{})[uid];
          if (bowl && bowl.balls>0) { totalWickets+=bowl.wickets||0; totalBowlBalls+=bowl.balls||0; totalBowlRuns+=bowl.runs||0; }
        });
      });

      const avg  = innings ? (totalRuns/innings).toFixed(1) : '—';
      const sr   = totalBalls ? ((totalRuns/totalBalls)*100).toFixed(1) : '—';
      const econ = totalBowlBalls ? ((totalBowlRuns/(totalBowlBalls/6))).toFixed(2) : '—';

      section.innerHTML = `
        <div class="settings-section-title">My Career Stats</div>
        <div class="text-xs text-muted" style="margin-bottom:10px">Based on ${matchList.length} completed matches</div>
        <div class="stat-grid">
          <div class="stat-tile"><div class="stat-tile-val">${totalRuns}</div><div class="stat-tile-label">Runs</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${avg}</div><div class="stat-tile-label">Avg</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${sr}</div><div class="stat-tile-label">Strike Rate</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${highScore}</div><div class="stat-tile-label">High Score</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${hundreds}</div><div class="stat-tile-label">100s</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${fifties}</div><div class="stat-tile-label">50s</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${fours}</div><div class="stat-tile-label">4s</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${sixes}</div><div class="stat-tile-label">6s</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${totalWickets}</div><div class="stat-tile-label">Wickets</div></div>
          <div class="stat-tile"><div class="stat-tile-val">${econ}</div><div class="stat-tile-label">Economy</div></div>
        </div>`;
    } catch (e) {
      section.innerHTML = `<div class="settings-section-title">My Career Stats</div><div class="text-xs text-muted">Unable to load career statistics right now.</div>`;
    }
  }

  async function setStat(field, value) {
    const user = Auth.getUser();
    await db.collection('users').doc(user.uid).update({ [field]: value });
    Utils.toast('Saved!','success');
    setTimeout(render, 200);
  }

  async function toggleWK() {
    const profile = Auth.getProfile();
    const newVal = !profile?.isWicketkeeper;
    const user = Auth.getUser();
    await db.collection('users').doc(user.uid).update({ isWicketkeeper: newVal });
    document.getElementById('wk-check')?.classList.toggle('checked', newVal);
  }

  function editDisplayName() {
    const profile = Auth.getProfile();
    Utils.modal(`
      <div class="modal-header"><h2 class="modal-title">Edit Display Name</h2><button class="modal-close" onclick="Utils.closeModal()">✕</button></div>
      <div class="form-group"><label class="form-label">Display Name</label><input type="text" id="edit-dn" value="${profile?.displayName||''}"/></div>
      <button class="btn btn-accent btn-full" onclick="ProfilePage.saveDisplayName()">Save</button>
    `);
  }

  async function saveDisplayName() {
    const val = document.getElementById('edit-dn')?.value.trim();
    if (!val) { Utils.toast('Enter a name.','error'); return; }
    await db.collection('users').doc(Auth.getUser().uid).update({ displayName: val });
    Utils.closeModal(); Utils.toast('Display name updated!','success');
    render();
  }

  // Compress image client-side → save base64 string to Firestore user document
  // No Firebase Storage involved — fully Spark-compatible
  async function handlePicChange(e) {
    const file = e.target.files[0]; if (!file) return;
    Utils.toast('Compressing image…','info');
    const base64 = await Utils.compressToBase64(file, 100); // ≤100 KB → base64 ≈ 136 KB
    if (!base64) { Utils.toast('Compression failed.','error'); return; }
    const user = Auth.getUser();
    // Store base64 string in Firestore user document (well within 1 MB doc limit)
    await db.collection('users').doc(user.uid).update({ profilePic: base64 });
    const img = document.getElementById('profile-pic-img');
    if (img) img.src = base64;
    Utils.toast('Profile picture updated!','success');
  }

  return { render, setStat, toggleWK, editDisplayName, saveDisplayName, handlePicChange };
})();
