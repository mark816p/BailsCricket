// BAILS — TEAM DETAIL
const TeamDetailPage = (() => {
  let teamId, team, tournament, isAdmin;

  async function render(path, parts, params) {
    teamId = params.id;
    Utils.setActivePage('tournaments');
    Utils.render(`<div class="text-muted text-sm" style="padding:40px;text-align:center">Loading team…</div>`);

    try {
      await Auth.whenReady();

      const snap = await db.collection('teams').doc(teamId).get();
      if (!snap.exists) { Utils.render('<p class="text-muted" style="padding:40px">Team not found.</p>'); return; }
      team = { id: snap.id, ...snap.data() };

      tournament = null;
      if (team.tournamentId) {
        const tSnap = await db.collection('tournaments').doc(team.tournamentId).get();
        if (tSnap.exists) tournament = { id: tSnap.id, ...tSnap.data() };
      }

      const user = Auth.getUser();
      isAdmin = user && tournament && Auth.isHost(tournament);

      // ── Bug #8 fix: resolve real displayNames for non-guest players whose
      // stored name is missing or looks like a raw Firebase UID (old data).
      const players = Object.entries(team.players || {}).map(([uid, p]) => ({ uid, ...p }));
      const needsName = players.filter(p => !p.isGuest && (!p.name || p.name === p.uid));
      if (needsName.length) {
        await Promise.all(needsName.map(async p => {
          try {
            const s = await db.collection('users').doc(p.uid).get();
            if (s.exists && s.data().displayName) {
              // Update in-memory only — avoids unwanted Firestore writes on every page load
              p.name = s.data().displayName;
              if (team.players[p.uid]) team.players[p.uid].name = p.name;
            }
          } catch(_) {}
        }));
      }

      renderLayout();
    } catch (e) {
      Utils.render('<p class="text-muted" style="padding:40px;text-align:center">Error loading team details.</p>');
    }
  }

  function renderLayout() {
    const players = Object.entries(team.players || {}).map(([uid, p]) => ({ uid, ...p }));
    const backHref  = tournament ? `#/tournament/${tournament.id}` : '#/tournaments';
    const backLabel = tournament ? tournament.name : 'Tournaments';

    Utils.render(`
      <a href="${backHref}" class="back-btn">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="15 18 9 12 15 6"/></svg>
        ${Utils.escapeHtml(backLabel)}
      </a>

      <div class="team-detail-header">
        <div class="team-logo-lg">
          ${team.picture ? `<img src="${team.picture}" alt="${Utils.escapeHtml(team.name)}"/>` : '👕'}
        </div>
        <div style="flex:1;min-width:0">
          <div style="font-size:22px;font-weight:900;letter-spacing:-.4px">${Utils.escapeHtml(team.name)}</div>
          ${tournament ? `<div class="text-sm text-muted" style="margin-top:3px">${Utils.escapeHtml(tournament.name)}</div>` : ''}
          <div class="text-sm text-muted" style="margin-top:2px">${players.length} player${players.length!==1?'s':''}</div>
        </div>
        ${isAdmin ? `<button class="btn btn-outline btn-sm" onclick="TeamDetailPage.editTeam()">⚙ Edit</button>` : ''}
      </div>

      <div class="section-header">
        <span class="section-title">👥 Squad</span>
        ${isAdmin ? `<button class="btn btn-accent btn-sm" onclick="TeamDetailPage.addPlayer()">+ Add Player</button>` : ''}
      </div>

      <div id="players-list">
        ${players.length === 0
          ? `<div class="empty-state">
               <div class="empty-icon">👕</div>
               <div class="empty-title">No players yet</div>
               <div class="empty-desc">${isAdmin ? 'Use the button above to add players.' : 'No players added yet.'}</div>
             </div>`
          : players.map(p => playerRow(p)).join('')}
      </div>
    `);
  }

  function playerRow(p) {
    const pic       = p.profilePic || Utils.initialsAvatar(p.name || p.uid || '?');
    const role      = p.role || 'Batsman';
    const roleClass = role==='Captain'?'role-captain':role==='Wicketkeeper'||role==='Wicket-keeper'?'role-wk':role==='All-Rounder'||role==='All-rounder'?'role-ar':role==='Bowler'?'role-bowl':'role-bat';
    const currentUser = Auth.getUser();
    const canClaim    = p.isGuest && currentUser && !team.players?.[currentUser.uid];
    const eName = (p.name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

    return `
      <div class="player-row card" style="margin-bottom:8px;cursor:default">
        <img src="${pic}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;flex-shrink:0"/>
        <div style="flex:1;min-width:0">
          <div style="font-weight:700;font-size:15px">
            ${Utils.escapeHtml(p.name || p.uid)}
            ${p.isGuest ? ' <span class="badge" style="font-size:10px;background:var(--surface2);color:var(--subtext);padding:2px 6px;border-radius:4px">Guest</span>' : ''}
          </div>
          ${p.username ? `<div class="text-xs text-muted">@${Utils.escapeHtml(p.username)}</div>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-end">
          <span class="player-role-badge ${roleClass}">${role}</span>
          ${canClaim ? `<button class="btn btn-sm" style="font-size:11px;padding:4px 8px;background:transparent;border:1px solid var(--accent);color:var(--accent)"
              onclick="TeamDetailPage.claimGuest('${p.uid}','${eName}')">🔗 This is me!</button>` : ''}
          ${isAdmin && p.isGuest ? `<button class="btn btn-sm" style="font-size:11px;padding:4px 8px;background:transparent;border:1px solid var(--blue);color:var(--blue)"
              title="Link this guest to a Bails account"
              onclick="TeamDetailPage.linkGuestPlayer('${p.uid}','${eName}')">👤 Link</button>` : ''}
          ${isAdmin ? `
            <button class="btn-icon" title="Change role" onclick="TeamDetailPage.changeRole('${p.uid}','${eName}','${role}')" style="width:30px;height:30px;font-size:14px">✏️</button>
            <button class="btn-icon" title="Remove player" onclick="TeamDetailPage.removePlayer('${p.uid}','${eName}')" style="width:30px;height:30px;font-size:14px;color:var(--red)">✕</button>
          ` : ''}
        </div>
      </div>`;
  }

  // ── ADD PLAYER ────────────────────────────────────────────────────
  async function addPlayer() {
    Utils.modal(`
      <div class="modal-header">
        <h2 class="modal-title">Add Player</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <div class="tabs" style="margin-bottom:16px">
        <div class="tab active" id="tab-invite" onclick="TeamDetailPage.switchAddTab('invite')">Invite User</div>
        <div class="tab" id="tab-guest" onclick="TeamDetailPage.switchAddTab('guest')">Add Guest</div>
      </div>
      <div id="add-tab-invite">
        <div class="form-group">
          <label class="form-label">Search by username</label>
          <input type="text" id="player-search-input" placeholder="e.g. virat18"
                 oninput="TeamDetailPage.searchPlayer(event)"/>
        </div>
        <div id="player-search-results"></div>
      </div>
      <div id="add-tab-guest" class="hidden">
        <p class="text-sm text-muted" style="margin-bottom:12px">Add a player without a Bails account. Use the 👤 Link button later to connect them to a real account.</p>
        <div class="form-group">
          <label class="form-label">Player Name</label>
          <input type="text" id="guest-name" placeholder="e.g. Rohit Sharma"/>
        </div>
        <div class="form-group">
          <label class="form-label">Role</label>
          <select id="guest-role">
            <option value="Batsman">Batsman</option>
            <option value="Bowler">Bowler</option>
            <option value="All-Rounder">All-Rounder</option>
            <option value="Wicketkeeper">Wicketkeeper</option>
            <option value="Captain">Captain</option>
          </select>
        </div>
        <button class="btn btn-accent btn-full" id="save-guest-btn"
                onclick="TeamDetailPage.saveGuestPlayer()">Add Guest Player</button>
      </div>
    `);
  }

  function switchAddTab(tab) {
    document.getElementById('tab-invite').classList.toggle('active', tab==='invite');
    document.getElementById('tab-guest').classList.toggle('active', tab==='guest');
    document.getElementById('add-tab-invite').classList.toggle('hidden', tab!=='invite');
    document.getElementById('add-tab-guest').classList.toggle('hidden', tab!=='guest');
  }

  async function searchPlayer(e) {
    const q = e.target.value.toLowerCase().trim();
    const res = document.getElementById('player-search-results');
    if (!res) return;
    if (!q) { res.innerHTML = ''; return; }
    const snap = await db.collection('users').where('username','>=',q).where('username','<=',q+'\uf8ff').limit(8).get();
    if (snap.empty) { res.innerHTML = '<div class="text-muted text-sm" style="padding:8px 0">No user found.</div>'; return; }
    const existingUids = Object.keys(team.players || {});
    res.innerHTML = snap.docs.map(d => {
      const u = d.data();
      const alreadyIn = existingUids.includes(u.uid);
      const sDN = (u.displayName||'').replace(/"/g,'&quot;');
      const sPic = (u.profilePic||Utils.initialsAvatar(u.displayName||'?')).replace(/"/g,'&quot;');
      return `<div class="player-row" style="padding:10px;background:var(--surface2);border-radius:var(--r-sm);margin-bottom:6px">
        <img src="${sPic}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0"/>
        <div style="flex:1;min-width:0"><div style="font-weight:700">${u.displayName||''}</div><div class="text-xs text-muted">@${u.username}</div></div>
        ${alreadyIn ? '<span class="text-xs text-muted">Already in team</span>'
          : `<button class="btn btn-sm btn-accent" data-uid="${u.uid}" data-name="${sDN}" onclick="TeamDetailPage.invitePlayer(this)">Invite</button>`}
      </div>`;
    }).join('');
  }

  async function invitePlayer(btn) {
    if (btn.disabled) return;
    btn.disabled = true; btn.textContent = 'Inviting…';
    const uid = btn.dataset.uid, name = btn.dataset.name;
    const user = Auth.getUser();
    try {
      await db.collection('invitations').add({
        toUid: uid, teamId, teamName: team.name,
        tournamentId: team.tournamentId || null, tournamentName: tournament?.name || '',
        fromUid: user.uid, fromName: Auth.getProfile()?.displayName || 'Admin',
        type: 'player', status: 'pending',
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      btn.textContent = 'Sent ✓';
      Utils.toast(`Invitation sent to ${name}!`, 'success');
    } catch(e) { btn.disabled = false; btn.textContent = 'Invite'; Utils.toast('Failed to send.','error'); }
  }

  async function saveGuestPlayer() {
    const btn  = document.getElementById('save-guest-btn');
    const name = document.getElementById('guest-name')?.value.trim();
    const role = document.getElementById('guest-role')?.value || 'Batsman';
    if (!name) { Utils.toast('Enter a player name.','error'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Adding…'; }
    try {
      const guestUid = 'guest_' + Utils.uid();
      const upd = {};
      upd[`players.${guestUid}`] = { uid: guestUid, name, role, isGuest: true };
      await db.collection('teams').doc(teamId).update(upd);
      team.players = team.players || {};
      team.players[guestUid] = { uid: guestUid, name, role, isGuest: true };
      Utils.closeModal();
      Utils.toast(`${name} added as guest!`, 'success');
      renderLayout();
    } catch(e) { Utils.toast('Failed to add player.','error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = 'Add Guest Player'; } }
  }

  // ── CHANGE ROLE ───────────────────────────────────────────────────
  async function changeRole(uid, name, currentRole) {
    const roles = ['Batsman','Bowler','All-Rounder','Wicketkeeper','Captain'];
    Utils.modal(`
      <div class="modal-header">
        <h2 class="modal-title">Change Role</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <p class="text-sm text-muted" style="margin-bottom:14px">Role for <strong>${name}</strong>:</p>
      <div style="display:flex;flex-direction:column;gap:8px">
        ${roles.map(r=>`<button class="btn ${r===currentRole?'btn-accent':'btn-outline'} btn-full"
            onclick="TeamDetailPage.confirmRoleChange('${uid}','${r}')">${r}${r===currentRole?' ✓':''}</button>`).join('')}
      </div>
    `);
  }

  async function confirmRoleChange(uid, role) {
    try {
      await db.collection('teams').doc(teamId).update({ [`players.${uid}.role`]: role });
      if (team.players?.[uid]) team.players[uid].role = role;
      Utils.closeModal(); Utils.toast('Role updated!','success'); renderLayout();
    } catch(e) { Utils.toast('Failed to update role.','error'); }
  }

  // ── REMOVE PLAYER (Bug #10 — replaced confirm() with Utils.confirmModal) ──
  async function removePlayer(uid, name) {
    const ok = await Utils.confirmModal(
      `Remove <strong>${name || 'this player'}</strong> from the team?`,
      'Remove', true
    );
    if (!ok) return;
    try {
      const upd = {};
      upd[`players.${uid}`] = firebase.firestore.FieldValue.delete();
      await db.collection('teams').doc(teamId).update(upd);
      delete team.players[uid];
      Utils.toast(`${name || 'Player'} removed.`, 'info');
      renderLayout();
    } catch(e) { Utils.toast('Failed to remove player.','error'); }
  }

  // ── EDIT / DELETE TEAM ────────────────────────────────────────────
  async function editTeam() {
    const safeName = team.name.replace(/"/g,'&quot;');
    Utils.modal(`
      <div class="modal-header">
        <h2 class="modal-title">Edit Team</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <div class="form-group">
        <label class="form-label">Team Name</label>
        <input type="text" id="edit-team-name" value="${safeName}"/>
      </div>
      <div class="form-group">
        <label class="form-label">Team Logo <span style="color:var(--muted)">(≤100 KB)</span></label>
        <div class="img-upload-wrap" onclick="document.getElementById('edit-logo-input').click()">
          ${team.picture
            ? `<img id="edit-logo-preview" src="${team.picture}" style="width:60px;height:60px;border-radius:10px;object-fit:cover;margin:0 auto 8px"/>`
            : `<div id="edit-logo-preview" style="font-size:32px;margin-bottom:8px">👕</div>`}
          <div class="text-sm text-muted">Tap to change</div>
          <input type="file" id="edit-logo-input" accept="image/*" style="display:none"
                 onchange="TeamDetailPage.handleEditLogoSelect(event)"/>
        </div>
      </div>
      <button class="btn btn-accent btn-full" id="save-edit-team-btn" onclick="TeamDetailPage.saveTeamEdit()">Save Changes</button>
      <button class="btn btn-danger btn-full" style="margin-top:8px" onclick="TeamDetailPage.deleteTeam()">Delete Team</button>
    `);
  }

  let pendingEditLogoBase64 = null;
  async function handleEditLogoSelect(e) {
    const file = e.target.files[0]; if (!file) return;
    Utils.toast('Compressing…','info');
    pendingEditLogoBase64 = await Utils.compressToBase64(file, 100);
    if (pendingEditLogoBase64) {
      const prev = document.getElementById('edit-logo-preview');
      if (prev) prev.outerHTML = `<img id="edit-logo-preview" src="${pendingEditLogoBase64}" style="width:60px;height:60px;border-radius:10px;object-fit:cover;margin:0 auto 8px"/>`;
    }
  }

  async function saveTeamEdit() {
    const btn  = document.getElementById('save-edit-team-btn');
    const name = document.getElementById('edit-team-name')?.value.trim();
    if (!name) { Utils.toast('Enter a team name.','error'); return; }
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      const upd = { name, nameLower: name.toLowerCase() };
      if (pendingEditLogoBase64) { upd.picture = pendingEditLogoBase64; pendingEditLogoBase64 = null; }
      await db.collection('teams').doc(teamId).update(upd);
      team = { ...team, ...upd };
      Utils.closeModal(); Utils.toast('Team updated!','success'); renderLayout();
    } finally { if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; } }
  }

  // Bug #10 — deleteTeam now uses Utils.confirmModal instead of window.confirm
  async function deleteTeam() {
    const ok = await Utils.confirmModal(
      `Delete <strong>${team.name}</strong>? This cannot be undone.`,
      'Delete', true
    );
    if (!ok) return;
    await db.collection('teams').doc(teamId).delete();
    Utils.closeModal();
    Router.navigate(tournament ? `/tournament/${tournament.id}` : '/tournaments');
    Utils.toast('Team deleted.', 'info');
  }

  // ── GUEST CLAIMING — user-initiated ("This is me!") ──────────────
  function claimGuest(guestUid, guestName) {
    const user = Auth.getUser();
    if (!user) { Utils.toast('Sign in to claim this player slot.', 'error'); return; }
    const profile  = Auth.getProfile();
    const userName = profile?.displayName || user.displayName || 'You';
    Utils.modal(`
      <div class="modal-header">
        <h2 class="modal-title">Link Your Account</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <p class="text-sm" style="margin-bottom:8px">Are you <strong>${guestName}</strong> on this team?</p>
      <p class="text-sm text-muted" style="margin-bottom:20px">
        This replaces the guest entry with your account (<strong>${userName}</strong>).
        Match stats will be transferred where possible.
      </p>
      <button class="btn btn-accent btn-full" id="confirm-claim-btn"
              onclick="TeamDetailPage.confirmClaimGuest('${guestUid}','${guestName.replace(/'/g,"\\'")}')">
        Yes, this is me
      </button>
      <button class="btn btn-outline btn-full" style="margin-top:8px" onclick="Utils.closeModal()">Cancel</button>
    `);
  }

  // Shared stat-migration helper used by both claimGuest (user) and linkGuestPlayer (admin)
  async function _migrateGuestStats(guestUid, newUid, newName) {
    if (!team.tournamentId) return;
    const matchSnap = await db.collection('matches')
      .where('tournamentId', '==', team.tournamentId).limit(50).get();
    if (matchSnap.empty) return;

    const batch = db.batch();
    let opCount = 0;
    matchSnap.docs.forEach(doc => {
      const md = doc.data();
      const innings = Array.isArray(md.innings) ? md.innings
        : Object.keys(md.innings||{}).sort().map(k => (md.innings||{})[k]);
      const upd = {}; let changed = false;
      innings.forEach((inn, idx) => {
        if (inn.batters?.[guestUid]) {
          upd[`innings.${idx}.batters.${newUid}`] = { ...inn.batters[guestUid], uid: newUid, name: newName };
          upd[`innings.${idx}.batters.${guestUid}`] = firebase.firestore.FieldValue.delete();
          changed = true;
        }
        if (inn.bowlers?.[guestUid]) {
          upd[`innings.${idx}.bowlers.${newUid}`] = { ...inn.bowlers[guestUid], uid: newUid, name: newName };
          upd[`innings.${idx}.bowlers.${guestUid}`] = firebase.firestore.FieldValue.delete();
          changed = true;
        }
        if (inn.striker === guestUid)      { upd[`innings.${idx}.striker`]       = newUid; changed = true; }
        if (inn.nonStriker === guestUid)   { upd[`innings.${idx}.nonStriker`]    = newUid; changed = true; }
        if (inn.currentBowler === guestUid){ upd[`innings.${idx}.currentBowler`] = newUid; changed = true; }
      });
      if ((md.participants||[]).includes(guestUid)) {
        upd.participants = firebase.firestore.FieldValue.arrayUnion(newUid); changed = true;
      }
      if (changed && opCount < 490) { batch.update(doc.ref, upd); opCount++; }
    });

    if (opCount > 0) {
      await batch.commit();
      const cleanBatch = db.batch();
      matchSnap.docs.forEach(doc => {
        if ((doc.data().participants||[]).includes(guestUid))
          cleanBatch.update(doc.ref, { participants: firebase.firestore.FieldValue.arrayRemove(guestUid) });
      });
      await cleanBatch.commit();
    }
  }

  async function confirmClaimGuest(guestUid, guestName) {
    const btn = document.getElementById('confirm-claim-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Linking…'; }
    const user = Auth.getUser(); const profile = Auth.getProfile();
    if (!user) { Utils.toast('Not signed in.','error'); return; }
    try {
      const guestData    = team.players?.[guestUid] || {};
      const newPlayerData = { uid: user.uid, name: profile?.displayName||user.displayName||guestName, role: guestData.role||'Batsman', isGuest: false };
      const teamUpd = {};
      teamUpd[`players.${user.uid}`]  = newPlayerData;
      teamUpd[`players.${guestUid}`]  = firebase.firestore.FieldValue.delete();
      await db.collection('teams').doc(teamId).update(teamUpd);
      await _migrateGuestStats(guestUid, user.uid, newPlayerData.name);
      if (!team.players) team.players = {};
      team.players[user.uid] = newPlayerData; delete team.players[guestUid];
      Utils.closeModal();
      Utils.toast(`Linked! You are now "${newPlayerData.name}" on this team.`,'success');
      renderLayout();
    } catch(e) {
      console.error('claimGuest error:', e);
      Utils.toast('Failed to link account. Try again.','error');
      if (btn) { btn.disabled = false; btn.textContent = 'Yes, this is me'; }
    }
  }

  // ── ADMIN-INITIATED GUEST LINKING (Bug #9) ────────────────────────
  // Lets an admin search for a Bails user and immediately replace a guest
  // entry with that user's account, migrating all stats. The player does
  // NOT need to accept anything — the admin is trusted to do this.
  function linkGuestPlayer(guestUid, guestName) {
    if (!isAdmin) { Utils.toast('Admin only.','error'); return; }
    const safeGuid = guestUid.replace(/'/g,"\\'");
    const safeGName = guestName.replace(/'/g,"\\'").replace(/"/g,'&quot;');
    Utils.modal(`
      <div class="modal-header">
        <h2 class="modal-title">👤 Link Guest: ${guestName}</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <p class="text-sm text-muted" style="margin-bottom:14px">
        Search for a Bails user to replace this guest entry.
        Stats will be transferred immediately to their account.
      </p>
      <div class="form-group">
        <label class="form-label">Search by username</label>
        <input type="text" id="link-search-input" placeholder="e.g. virat18"
               oninput="TeamDetailPage.searchForLink(event,'${safeGuid}','${safeGName}')"/>
      </div>
      <div id="link-search-results"></div>
    `);
  }

  async function searchForLink(e, guestUid, guestName) {
    const q   = e.target.value.toLowerCase().trim();
    const res = document.getElementById('link-search-results');
    if (!res) return;
    if (!q) { res.innerHTML = ''; return; }
    const snap = await db.collection('users').where('username','>=',q).where('username','<=',q+'\uf8ff').limit(8).get();
    if (snap.empty) { res.innerHTML = '<div class="text-muted text-sm">No user found.</div>'; return; }
    res.innerHTML = snap.docs.map(d => {
      const u  = d.data();
      const sN = (u.displayName||'').replace(/"/g,'&quot;');
      const sP = (u.profilePic||Utils.initialsAvatar(u.displayName||'?')).replace(/"/g,'&quot;');
      const sGN = guestName.replace(/"/g,'&quot;');
      return `<div class="player-row" style="padding:10px;background:var(--surface2);border-radius:var(--r-sm);margin-bottom:6px">
        <img src="${sP}" style="width:38px;height:38px;border-radius:50%;object-fit:cover;flex-shrink:0"/>
        <div style="flex:1;min-width:0"><div style="font-weight:700">${u.displayName||''}</div><div class="text-xs text-muted">@${u.username}</div></div>
        <button class="btn btn-sm btn-accent"
                data-uid="${u.uid}" data-name="${sN}"
                data-guest-uid="${guestUid}" data-guest-name="${sGN}"
                onclick="TeamDetailPage.confirmLinkGuest(this)">Link</button>
      </div>`;
    }).join('');
  }

  async function confirmLinkGuest(btn) {
    if (btn.disabled) return;
    const targetUid   = btn.dataset.uid;
    const targetName  = btn.dataset.name;
    const guestUid    = btn.dataset.guestUid;
    const guestName   = btn.dataset.guestName;
    const sGN = guestName.replace(/'/g,"\\'");
    const sTN = targetName.replace(/'/g,"\\'");
    // Replace modal content with a confirmation step
    Utils.modal(`
      <div class="modal-header">
        <h2 class="modal-title">Confirm Link</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <p class="text-sm" style="margin-bottom:8px">
        Replace guest <strong>${guestName}</strong> with <strong>${targetName}</strong>?
      </p>
      <p class="text-sm text-muted" style="margin-bottom:20px">
        All match stats recorded for this guest will be transferred to ${targetName}'s account immediately.
      </p>
      <button class="btn btn-accent btn-full" id="exec-link-btn"
              onclick="TeamDetailPage.executeLinkGuest('${guestUid}','${sGN}','${targetUid}','${sTN}')">
        Yes, link accounts
      </button>
      <button class="btn btn-outline btn-full" style="margin-top:8px" onclick="Utils.closeModal()">Cancel</button>
    `);
  }

  async function executeLinkGuest(guestUid, guestName, targetUid, targetName) {
    const btn = document.getElementById('exec-link-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Linking…'; }
    try {
      const guestData    = team.players?.[guestUid] || {};
      const newPlayerData = { uid: targetUid, name: targetName, role: guestData.role||'Batsman', isGuest: false };
      const teamUpd = {};
      teamUpd[`players.${targetUid}`] = newPlayerData;
      teamUpd[`players.${guestUid}`]  = firebase.firestore.FieldValue.delete();
      await db.collection('teams').doc(teamId).update(teamUpd);
      await _migrateGuestStats(guestUid, targetUid, targetName);
      if (!team.players) team.players = {};
      team.players[targetUid] = newPlayerData; delete team.players[guestUid];
      Utils.closeModal();
      Utils.toast(`${guestName} linked to ${targetName}!`, 'success');
      renderLayout();
    } catch(e) {
      console.error('executeLinkGuest error:', e);
      Utils.toast('Failed to link. Check connection.','error');
      if (btn) { btn.disabled = false; btn.textContent = 'Yes, link accounts'; }
    }
  }

  return {
    render, addPlayer, switchAddTab, searchPlayer,
    invitePlayer, saveGuestPlayer, changeRole, confirmRoleChange,
    removePlayer, editTeam, handleEditLogoSelect, saveTeamEdit, deleteTeam,
    claimGuest, confirmClaimGuest,
    linkGuestPlayer, searchForLink, confirmLinkGuest, executeLinkGuest
  };
})();
