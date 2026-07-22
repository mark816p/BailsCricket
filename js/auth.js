// BAILS — AUTHENTICATION (Spark Edition)
const Auth = (() => {
  let currentUser = null, userProfile = null, listeners = [];
  let _readyFired = false;
  let _readyResolve;
  const _readyPromise = new Promise(r => { _readyResolve = r; });

  const providers = {
    google:    new firebase.auth.GoogleAuthProvider(),
    microsoft: new firebase.auth.OAuthProvider('microsoft.com'),
    apple:     new firebase.auth.OAuthProvider('apple.com'),
    twitter:   new firebase.auth.TwitterAuthProvider()
  };

  function onAuthChange(fn) { listeners.push(fn); }
  function whenReady() { return _readyPromise; }

  function init() {
    auth.onAuthStateChanged(async user => {
      currentUser = user;
      if (user) { await loadProfile(user.uid); updateNav(user); }
      else { userProfile = null; updateNav(null); }
      if (!_readyFired) { _readyFired = true; _readyResolve(); }
      listeners.forEach(fn => fn(user, userProfile));
    });
  }

  async function loadProfile(uid) {
    try {
      const snap = await db.collection('users').doc(uid).get();
      if (snap.exists) { userProfile = snap.data(); return true; }
      return false;
    } catch (e) {
      console.warn('loadProfile error:', e);
      return false;
    }
  }

  async function signIn(provider) {
    try {
      const result = await auth.signInWithPopup(providers[provider]);
      const user   = result.user;
      const exists = await loadProfile(user.uid);
      if (!exists) {
        const agreed = await showTermsModal();
        if (!agreed) { await auth.signOut(); Utils.toast('You must accept Terms & Privacy Policy to use Bails.', 'error'); return null; }
        await showProfileSetupModal(user);
      } else if (!userProfile.agreedToTerms) {
        const agreed = await showTermsModal();
        if (!agreed) { await auth.signOut(); return null; }
        await db.collection('users').doc(user.uid).update({ agreedToTerms: true });
      }
      Utils.toast('Signed in!', 'success');
      Router.navigate('/dashboard');
      return user;
    } catch (err) { Utils.toast(err.message || 'Sign in failed.', 'error'); return null; }
  }

  async function signOut() {
    await auth.signOut();
    currentUser = null; userProfile = null;
    updateNav(null);
    Router.navigate('/');
    Utils.toast('Signed out.', 'info');
  }

  function updateNav(user) {
    const label = document.getElementById('nav-profile-label');
    const wrap  = document.getElementById('nav-avatar-wrap');
    if (!label || !wrap) return;
    if (user && userProfile) {
      label.textContent = userProfile.displayName || user.displayName || 'Profile';
      const pic = userProfile.profilePic || Utils.initialsAvatar(userProfile.displayName || '?');
      wrap.innerHTML = `<img src="${pic}" style="width:22px;height:22px;border-radius:50%;object-fit:cover"/>`;
    } else {
      label.textContent = 'Sign In';
      wrap.innerHTML = `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
    }
  }

  function showTermsModal() {
    return new Promise(resolve => {
      Utils.modal(`
        <div class="modal-header"><h2 class="modal-title">Terms & Privacy</h2></div>
        <p style="font-size:14px;color:var(--subtext);margin-bottom:16px">
          To use Bails, you must agree to our
          <a href="#/terms" style="color:var(--accent)">Terms of Service</a> and
          <a href="#/privacy" style="color:var(--accent)">Privacy Policy</a>.
        </p>
        <div class="checkbox-row" id="terms-row">
          <div class="checkbox-custom" id="terms-box">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><polyline points="2,6 5,9 10,3" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
          </div>
          <label class="checkbox-label">I agree to the Terms of Service and Privacy Policy</label>
        </div>
        <div style="display:flex;gap:10px;margin-top:20px">
          <button class="btn btn-outline btn-full" id="terms-decline">Decline</button>
          <button class="btn btn-accent btn-full" id="terms-accept" disabled>Accept & Continue</button>
        </div>
      `);
      let agreed = false;
      document.getElementById('terms-row').onclick = () => {
        agreed = !agreed;
        document.getElementById('terms-box').classList.toggle('checked', agreed);
        document.getElementById('terms-accept').disabled = !agreed;
      };
      document.getElementById('terms-accept').onclick = () => { Utils.closeModal(); resolve(true); };
      document.getElementById('terms-decline').onclick = () => { Utils.closeModal(); resolve(false); };
    });
  }

  function showProfileSetupModal(user) {
    return new Promise(resolve => {
      Utils.modal(`
        <div class="modal-header"><h2 class="modal-title">Set Up Your Profile</h2></div>
        <div class="form-group">
          <label class="form-label">Display Name</label>
          <input type="text" id="setup-display" value="${(user.displayName||'').replace(/"/g,'&quot;')}"/>
        </div>
        <div class="form-group">
          <label class="form-label">Username <span style="color:var(--muted)">(unique · cannot be changed later)</span></label>
          <input type="text" id="setup-username" placeholder="e.g. virat18" maxlength="24"/>
          <span class="form-hint">Lowercase letters, numbers, underscores only.</span>
          <span class="form-error hidden" id="username-err">Username already taken.</span>
        </div>
        <button class="btn btn-accent btn-full" id="setup-save">Create Profile</button>
      `);
      let saving = false;
      document.getElementById('setup-save').onclick = async () => {
        if (saving) return;
        const display  = document.getElementById('setup-display').value.trim();
        const username = document.getElementById('setup-username').value.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
        if (!display || !username) { Utils.toast('Fill all fields.', 'error'); return; }
        saving = true;
        document.getElementById('setup-save').disabled = true;
        document.getElementById('setup-save').textContent = 'Saving…';
        const snap = await db.collection('users').where('username', '==', username).get();
        if (!snap.empty) {
          document.getElementById('username-err').classList.remove('hidden');
          saving = false;
          document.getElementById('setup-save').disabled = false;
          document.getElementById('setup-save').textContent = 'Create Profile';
          return;
        }
        await db.collection('users').doc(user.uid).set({
          uid: user.uid, email: user.email || '',
          displayName: display, username,
          profilePic: user.photoURL || null,
          battingStyle: null, bowlingHand: null, bowlingStyle: null,
          isWicketkeeper: false, agreedToTerms: true,
          followingTournaments: [],
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        await loadProfile(user.uid);
        Utils.closeModal(); resolve();
      };
    });
  }

  function startGuestPrompt() {
    let dismissed = false;
    const prompt = document.getElementById('login-prompt');
    const dismissBtn = document.getElementById('dismiss-login-prompt');
    if (!prompt || !dismissBtn) return;
    dismissBtn.onclick = () => {
      dismissed = true; prompt.classList.add('hidden');
      setTimeout(() => { dismissed = false; }, 5 * 60 * 1000);
    };
    setInterval(() => {
      if (!currentUser && !dismissed) {
        prompt.classList.remove('hidden');
        setTimeout(() => prompt.classList.add('hidden'), 8000);
      }
    }, 5 * 60 * 1000);
  }

  function requireAuth(cb) {
    if (currentUser) { cb(currentUser, userProfile); return; }
    Utils.toast('Please sign in to continue.', 'info');
    Router.navigate('/login');
  }

  function getUser()    { return currentUser; }
  function getProfile() { return userProfile; }
  function isAdmin(data) {
    if (!currentUser) return false;
    const uid = currentUser.uid;
    return uid === data.ownerId || (data.coHosts||[]).includes(uid) ||
           (data.umpires||[]).includes(uid) || (data.admins||[]).includes(uid);
  }
  function isHost(data) {
    if (!currentUser) return false;
    return currentUser.uid === data.ownerId || (data.coHosts||[]).includes(currentUser.uid);
  }

  return { init, signIn, signOut, onAuthChange, whenReady, requireAuth,
           getUser, getProfile, isAdmin, isHost, startGuestPrompt };
})();
