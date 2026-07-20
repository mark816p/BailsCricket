// BAILS — APP ENTRY POINT
// Handles: route registration, auth redirect on load, nav update, loader hide

function hideLoader() {
  const loader = document.getElementById('app-loader');
  if (loader) loader.classList.add('hidden');
}

// ── ROUTE REGISTRATION ────────────────────────────────────────────
Router.register('/',                  () => {});   // handled by whenReady below
Router.register('/login',             () => ProfilePage.render());
Router.register('/dashboard',         () => DashboardPage.render());
Router.register('/search',            () => SearchPage.render());
Router.register('/my-matches',        () => MyMatchesPage.render());
Router.register('/tournaments',       () => TournamentsPage.render());
Router.register('/profile',           () => ProfilePage.render());
Router.register('/privacy',           () => LegalPage.renderPrivacy());
Router.register('/terms',             () => LegalPage.renderTerms());
Router.register('/tournament/:id',    TournamentDetailPage.render.bind(TournamentDetailPage));
Router.register('/match/:id',         MatchDetailPage.render.bind(MatchDetailPage));
Router.register('/match/:id/score',   MatchScoringPage.render.bind(MatchScoringPage));
Router.register('/player/:uid',       PlayerProfilePage.render.bind(PlayerProfilePage));
Router.register('/team/:id',          TeamDetailPage.render.bind(TeamDetailPage));
Router.register('/live-cricket',      LiveCricketPage.render.bind(LiveCricketPage));
Router.register('/live-cricket/:id',  LiveCricketPage.render.bind(LiveCricketPage));

// ── AUTH STATE → NAV UPDATE ───────────────────────────────────────
Auth.onAuthChange((user, profile) => {
  const label = document.getElementById('nav-profile-label');
  const wrap  = document.getElementById('nav-avatar-wrap');
  if (!label || !wrap) return;
  if (user && profile) {
    label.textContent = profile.displayName || user.displayName || 'Profile';
    const pic = profile.profilePic || Utils.initialsAvatar(profile.displayName || '?');
    wrap.innerHTML = `<img src="${pic}" style="width:22px;height:22px;border-radius:50%;object-fit:cover"/>`;
  } else {
    label.textContent = 'Sign In';
    wrap.innerHTML = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  }
});

// ── SMART REDIRECT ON FIRST LOAD ──────────────────────────────────
// If user lands on '/' (root), redirect based on auth state:
//   - Logged in  → dashboard
//   - Guest      → landing page
function whenReady(user) {
  const path = Router.getCurrentPath();
  if (path === '/' || path === '') {
    if (user) {
      Router.navigate('/dashboard');
    } else {
      LandingPage.render();
    }
  }
}

// ── BOOT ──────────────────────────────────────────────────────────
Auth.init();
Auth.startGuestPrompt();

// Wait for Firebase auth to resolve before routing
// This prevents the flash of landing page for logged-in users
let booted = false;
auth.onAuthStateChanged(user => {
  if (!booted) {
    booted = true;
    hideLoader();
    const path = Router.getCurrentPath();
    if (path === '/' || path === '') {
      // For root path: handle the auth-based redirect first, then let
      // the router listen for subsequent hash changes normally.
      whenReady(user);
      Router.init();  // registers hashchange listener for all future navigations
    } else {
      Router.init();  // registers listener + immediately dispatches current path
    }
  }
});

// If auth takes too long (offline), fall through after 3s
setTimeout(() => {
  if (!booted) {
    booted = true;
    hideLoader();
    Router.init();
  }
}, 3000);

// After boot, hash changes are handled by Router.init()'s own listener.
// Do NOT add another hashchange listener here — Router.init() already calls
// window.addEventListener('hashchange', dispatch) internally, so a second
// listener here would cause every navigation to call dispatch() twice.

