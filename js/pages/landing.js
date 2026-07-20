// BAILS — LANDING PAGE
const LandingPage = (() => {
  function render() {
    Utils.setActivePage('');
    Utils.render(`
      <div class="landing-hero">
        <div class="landing-emoji">🏏</div>
        <h1 class="landing-title">
          Score cricket<br>like a <span>pro.</span>
        </h1>
        <p class="landing-sub">
          Ball-by-ball scoring, live tournaments, career stats and more — all free, forever.
        </p>
        <div style="display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
          <a href="#/login" class="btn btn-accent"
             style="font-size:16px;padding:14px 36px;border-radius:99px;font-weight:800">
            Get Started — Free →
          </a>
          <a href="#/dashboard" class="btn btn-outline"
             style="font-size:16px;padding:14px 28px;border-radius:99px">
            Browse Live Matches
          </a>
        </div>
      </div>

      <div style="padding:0 4px">
        <div class="landing-features">
          <div class="feature-card">
            <div class="feature-icon">📡</div>
            <div class="feature-title">Live Ball-by-Ball</div>
            <div class="feature-desc">Score every delivery with partnerships, powerplays and DLS support built in.</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🏆</div>
            <div class="feature-title">Tournaments</div>
            <div class="feature-desc">Full points tables, knockout brackets and real-time fixtures.</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📊</div>
            <div class="feature-title">Career Stats</div>
            <div class="feature-desc">Track batting averages, bowling economy and fielding across every match.</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">👥</div>
            <div class="feature-title">Team Management</div>
            <div class="feature-desc">Build squads, assign roles and send invitations with one tap.</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">🌧️</div>
            <div class="feature-title">DLS &amp; Super Over</div>
            <div class="feature-desc">Rain-revised targets and tied-match super overs handled automatically.</div>
          </div>
          <div class="feature-card">
            <div class="feature-icon">📲</div>
            <div class="feature-title">Share &amp; Export</div>
            <div class="feature-desc">QR code sharing, PNG scorecard export and live match chat.</div>
          </div>
        </div>
      </div>

      <div style="padding:48px 24px;text-align:center">
        <div style="font-size:13px;color:var(--muted);margin-bottom:24px">Trusted by cricketers · Free forever · Works offline</div>
        <a href="#/login" class="btn btn-accent btn-full"
           style="font-size:17px;padding:16px;border-radius:99px;max-width:340px;margin:0 auto;font-weight:800;display:flex;justify-content:center">
          Start Scoring Today →
        </a>
        <p style="margin-top:16px;font-size:12px;color:var(--muted)">
          By continuing you agree to our
          <a href="#/terms" style="color:var(--accent)">Terms</a> and
          <a href="#/privacy" style="color:var(--accent)">Privacy Policy</a>.
        </p>
      </div>
    `);
  }
  return { render };
})();
