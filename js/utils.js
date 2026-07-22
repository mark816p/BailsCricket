// BAILS — UTILITIES (v20)
const Utils = (() => {

  // ── Toast ──────────────────────────────────────────────────────────────────
  function toast(msg, type = 'info', duration = 3500) {
    const icons = { success: '✓', error: '✕', info: 'ℹ' };
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `<span>${icons[type] || 'ℹ'}</span><span>${msg}</span>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(() => el.remove(), duration);
  }

  // ── Modal ──────────────────────────────────────────────────────────────────
  // blocking=true → tapping the backdrop does NOT close the modal.
  // Use this for any modal that has a promise behind it (new batter, new bowler,
  // innings openers) so the promise never hangs unresolved.
  function modal(html, onClose, blocking = false) {
    const overlay = document.getElementById('modal-overlay');
    document.getElementById('modal-body').innerHTML = html;
    overlay.classList.remove('hidden');
    if (blocking) {
      overlay.onclick = null;
    } else {
      overlay.onclick = e => { if (e.target === overlay) { closeModal(); onClose && onClose(); } };
    }
  }

  function closeModal() {
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('modal-body').innerHTML = '';
  }

  // ── Confirm Modal ──────────────────────────────────────────────────────────
  // Returns Promise<boolean>: true = confirmed, false = cancelled.
  // The backdrop is non-blocking — tapping outside = Cancel (false).
  function confirmModal(msg, confirmLabel = 'Confirm', danger = false) {
    return new Promise(resolve => {
      window.__confirmModalResolve = resolve;
      modal(`
        <div class="modal-header">
          <h2 class="modal-title">Confirm</h2>
          <button class="modal-close" onclick="Utils._resolveConfirmModal(false)">✕</button>
        </div>
        <p class="text-sm" style="margin-bottom:20px;line-height:1.6">${msg}</p>
        <div style="display:flex;gap:8px">
          <button class="btn btn-outline" style="flex:1" onclick="Utils._resolveConfirmModal(false)">Cancel</button>
          <button class="btn ${danger ? 'btn-danger' : 'btn-accent'}" style="flex:1"
                  onclick="Utils._resolveConfirmModal(true)">${confirmLabel}</button>
        </div>
      `, () => _resolveConfirmModal(false));
    });
  }
  function _resolveConfirmModal(val) {
    closeModal();
    if (window.__confirmModalResolve) {
      window.__confirmModalResolve(val);
      window.__confirmModalResolve = null;
    }
  }

  // ── Image compression → base64 ─────────────────────────────────────────────
  async function compressToBase64(file, maxKB = 100) {
    return new Promise(resolve => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let w = img.width, h = img.height;
        const MAX_DIM = 600;
        if (w > MAX_DIM || h > MAX_DIM) {
          if (w > h) { h = Math.round(h * MAX_DIM / w); w = MAX_DIM; }
          else       { w = Math.round(w * MAX_DIM / h); h = MAX_DIM; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        let quality = 0.88;
        const tryCompress = () => {
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          const bytes = Math.round((dataUrl.length - 22) * 0.75);
          if (bytes <= maxKB * 1024 || quality < 0.25) { resolve(dataUrl); }
          else { quality -= 0.08; tryCompress(); }
        };
        tryCompress();
      };
      img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
      img.src = url;
    });
  }
  const compressImage = compressToBase64;

  // ── Avatar initials ────────────────────────────────────────────────────────
  function initialsAvatar(name = '?') {
    const initials = name.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase();
    const colors   = ['#22c55e','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];
    const color    = colors[name.charCodeAt(0) % colors.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><circle cx="48" cy="48" r="48" fill="${color}20"/><text x="48" y="56" text-anchor="middle" font-size="32" font-weight="700" font-family="system-ui" fill="${color}">${initials}</text></svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
  }

  // ── Cricket helpers ────────────────────────────────────────────────────────
  function formatOvers(balls) { const o=Math.floor(balls/6),b=balls%6; return b?`${o}.${b}`:`${o}`; }
  function fmtDate(ts) {
    if (!ts) return '';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  }
  function rr(runs, balls) { return balls ? (runs * 6 / balls).toFixed(2) : '0.00'; }

  // ── Render & nav ───────────────────────────────────────────────────────────
  function render(html) { document.getElementById('page-root').innerHTML = html; }
  function setActivePage(page) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.toggle('active', l.dataset.page === page));
  }

  // ── Misc ───────────────────────────────────────────────────────────────────
  function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
  async function getIPLocation() {
    try { const r = await fetch('https://ip-api.com/json/?fields=lat,lon,city,country'); return await r.json(); }
    catch { return null; }
  }

  // ── Scorecard export ───────────────────────────────────────────────────────
  async function exportScorecard(elementId) {
    const el = document.getElementById(elementId);
    if (!el || !window.html2canvas) { toast('Export not available.', 'error'); return; }
    try {
      toast('Generating image…', 'info');
      const canvas = await html2canvas(el, { backgroundColor:'#0f0f11', scale:2, logging:false, useCORS:true });
      const link   = document.createElement('a');
      link.download = 'bails-scorecard.png'; link.href = canvas.toDataURL('image/png'); link.click();
      toast('Scorecard saved!', 'success');
    } catch(e) { toast('Export failed.', 'error'); }
  }

  // ── QR share ───────────────────────────────────────────────────────────────
  function showQR(url) {
    modal(`
      <div class="modal-header">
        <h2 class="modal-title">📲 Share Match</h2>
        <button class="modal-close" onclick="Utils.closeModal()">✕</button>
      </div>
      <div class="qr-wrap">
        <div id="qr-canvas"></div>
        <p class="text-sm text-muted" style="text-align:center;word-break:break-all;margin-top:12px">${url}</p>
        <button class="btn btn-outline btn-sm" style="margin-top:12px" onclick="navigator.clipboard.writeText('${url}').then(()=>Utils.toast('Link copied!','success'))">📋 Copy Link</button>
      </div>
    `);
    setTimeout(() => {
      if (window.QRCode) new QRCode(document.getElementById('qr-canvas'), {
        text:url, width:200, height:200,
        colorDark:'#f4f4f5', colorLight:'#0f0f11',
        correctLevel: QRCode.CorrectLevel.M
      });
    }, 50);
  }

  // ── DLS Calculator ─────────────────────────────────────────────────────────
  const DLS_TABLE = {
    50:{0:100,1:93.4,2:85.1,3:74.9,4:62.7,5:49.0,6:34.9,7:22.0,8:11.9,9:4.7},
    40:{0:89.3,1:84.2,2:77.5,3:68.8,4:58.0,5:45.7,6:32.7,7:20.6,8:11.2,9:4.4},
    30:{0:75.1,1:71.8,2:66.8,3:60.0,4:51.2,5:40.8,6:29.4,7:18.7,8:10.2,9:4.0},
    20:{0:56.6,1:54.8,2:51.7,3:47.1,4:40.7,5:32.9,6:24.1,7:15.5,8:8.6,9:3.4},
    10:{0:32.1,1:31.6,2:30.5,3:28.3,4:25.1,5:20.8,6:15.6,7:10.3,8:5.8,9:2.4},
    5: {0:18.4,1:18.2,2:17.8,3:16.9,4:15.3,5:12.9,6:9.9, 7:6.7, 8:3.8,9:1.6},
    1: {0:4.3, 1:4.3, 2:4.3, 3:4.1, 4:3.8, 5:3.3, 6:2.6, 7:1.8, 8:1.1,9:0.5}
  };
  function getDLSResource(oversRemaining, wicketsLost) {
    const keys = Object.keys(DLS_TABLE).map(Number).sort((a,b)=>b-a);
    let lo = 1;
    for (const k of keys) { if (k <= oversRemaining) { lo = k; break; } }
    const row = DLS_TABLE[lo] || DLS_TABLE[1];
    return row[Math.min(9, wicketsLost)] || 0;
  }
  function calcDLSTarget(team1Runs, team1FullOvers, team2Overs, team2WicketsLost) {
    const R1 = getDLSResource(team1FullOvers, 0);
    const R2 = getDLSResource(team2Overs, team2WicketsLost);
    if (R1 <= 0) return team1Runs + 1;
    return Math.round(team1Runs * (R2 / R1)) + 1;
  }

  // ── Live title ticker ──────────────────────────────────────────────────────
  let _tickerInterval = null;
  function startTicker(getScore) {
    stopTicker();
    _tickerInterval = setInterval(() => { const s=getScore(); if(s) document.title=`${s} — Bails`; }, 5000);
  }
  function stopTicker() {
    if (_tickerInterval) { clearInterval(_tickerInterval); _tickerInterval = null; }
    document.title = 'Bails — Cricket Scorer';
  }

  // ── Constants ──────────────────────────────────────────────────────────────
  const WICKET_TYPES  = ['Bowled','Caught Behind','Stumping','Run Out','LBW','Caught Out','Retired Hurt','Retired Out'];
  const FORMATS       = { 'T5':5,'T10':10,'T20':20,'ODI':50,'2-Day':90,'3-Day':120,'Test':180,'Custom':null };
  const PLAYER_ROLES  = ['Batsman','Bowler','All-rounder','Wicket-keeper','Captain'];
  // Bump APP_VERSION AND service-worker.js CACHE_NAME = 'bails-v28-spark'; on every deploy
  const APP_VERSION   = 'v28';

  return {
    toast, modal, closeModal,
    confirmModal, _resolveConfirmModal,
    compressImage, compressToBase64,
    initialsAvatar, formatOvers, fmtDate, getIPLocation,
    render, setActivePage, uid, rr,
    exportScorecard, showQR,
    calcDLSTarget, getDLSResource,
    startTicker, stopTicker,
    WICKET_TYPES, FORMATS, PLAYER_ROLES, APP_VERSION
  };
})();
