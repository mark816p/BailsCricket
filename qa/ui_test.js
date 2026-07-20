const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { matches, TEAMS } = require('./generate.js');
const { createMockFirestore } = require('./firestore_mock.js');

const APP_DIR = '/home/claude/bails-v5';

// ── Build the seed store from generated data ───────────────────────────
const seed = { matches:{}, teams:{}, tournaments:{}, users:{}, invitations:{} };
seed.tournaments['sim_tournament_claude_sims'] = {
  id:'sim_tournament_claude_sims', name:'The Claude Sims', nameLower:'the claude sims',
  ownerId:'admin_uid', coHosts:[], umpires:[], matchCount:10,
  createdAt: { toMillis:()=>Date.now(), seconds:Math.floor(Date.now()/1000) }
};
Object.values(TEAMS).forEach(t => { seed.teams[t.id] = { ...t, tournamentId:'sim_tournament_claude_sims', ownerId:'admin_uid' }; });

const deliveriesByMatch = {};
matches.forEach(({match, deliveries}) => {
  seed.matches[match.id] = match;
  deliveriesByMatch[match.id] = {};
  deliveries.forEach((d,i) => { deliveriesByMatch[match.id][`d_${i}`] = d; });
});

const { db, firebase } = createMockFirestore(seed);
matches.forEach(({match}) => {
  Object.entries(deliveriesByMatch[match.id]).forEach(([id, d]) => {
    const key = `matches/${match.id}/deliveries`;
    if (!db.__rawStoreRef) {} // no-op, using collection() path below instead
  });
});
// Seed subcollections directly via the mock's collection() path convention
matches.forEach(({match}) => {
  const subCol = db.collection('matches').doc(match.id).collection('deliveries');
  // populate synchronously by reaching into the mock's internal store via its collectionRef closure isn't exposed,
  // so instead just use .doc(id).set() for each — still async but we can await in sequence below.
});

// ── DOM + globals setup ─────────────────────────────────────────────────
const dom = new JSDOM(`<!DOCTYPE html><html><body>
  <div id="page-root"></div>
  <div id="modal-overlay" class="hidden"><div id="modal-body"></div></div>
  <div id="toast-container"></div>
  <nav></nav>
</body></html>`, { url: 'https://bails-cricketscorer.web.app/' });

global.window = dom.window;
global.document = dom.window.document;
global.navigator = dom.window.navigator;
global.location = dom.window.location;
global.history = dom.window.history;
global.db = db;
global.firebase = firebase;

const Auth = {
  getUser: () => ({ uid: 'admin_uid', displayName: 'QA Admin' }),
  getProfile: () => ({ uid:'admin_uid', displayName:'QA Admin', username:'qa_admin' }),
  isAdmin: () => true,
  isHost: () => true,
  whenReady: async () => true,
};
const Router = { navigate: (p) => { /* no-op for test harness */ }, register: ()=>{}, back: ()=>{} };
global.Auth = Auth;
global.Router = Router;

function loadReal(relPath) {
  const code = fs.readFileSync(path.join(APP_DIR, relPath), 'utf8');
  // Execute in global context so `const X = (()=>{...})()` module-pattern
  // assigns become real globals, exactly like <script> tags in index.html.
  require('vm').runInThisContext(code, { filename: relPath });
}

loadReal('js/utils.js');           // real Utils — no Firebase dependency
global.Utils = Utils;
loadReal('js/pages/match-detail.js');
loadReal('js/pages/dashboard.js');
loadReal('js/pages/tournament-detail.js');
loadReal('js/pages/team-detail.js');

let issues = [];
function report(where, msg) { issues.push(`[${where}] ${msg}`); }

function scanHtmlForProblems(html, where) {
  if (/\bundefined\b/.test(html)) report(where, `contains literal "undefined" text`);
  if (/\bNaN\b/.test(html)) report(where, `contains literal "NaN" text`);
  if (/\[object Object\]/.test(html)) report(where, `contains "[object Object]" — a template literal stringified an object instead of a field`);
  if (html.trim().length === 0) report(where, `rendered EMPTY page-root`);
}

async function seedDeliveries() {
  for (const {match} of matches) {
    for (const [id, d] of Object.entries(deliveriesByMatch[match.id])) {
      await db.collection('matches').doc(match.id).collection('deliveries').doc(id).set(d);
    }
  }
}

async function main() {
  await seedDeliveries();

  // ── Test 1: MatchDetailPage.render() for every match, every tab ──
  for (const { match } of matches) {
    await MatchDetailPage.render('/match/'+match.id, [], { id: match.id });
    let html = document.getElementById('page-root').innerHTML;
    scanHtmlForProblems(html, `MatchDetail ${match.id} (score tab)`);

    for (const tab of ['worm','commentary','stats','squads']) {
      await MatchDetailPage.switchTab(tab);
      await new Promise(r=>setTimeout(r, 20)); // let async tab loaders settle
      html = document.getElementById('md-tab-body') ? document.getElementById('md-tab-body').innerHTML : '';
      scanHtmlForProblems(html, `MatchDetail ${match.id} (${tab} tab)`);
    }
  }

  // ── Test 2: TournamentDetailPage.render() ──
  await TournamentDetailPage.render('/tournament/sim_tournament_claude_sims', [], { id:'sim_tournament_claude_sims' });
  await new Promise(r=>setTimeout(r, 50));
  scanHtmlForProblems(document.getElementById('page-root').innerHTML, 'TournamentDetail (main)');

  // ── Test 3: TeamDetailPage.render() for all 4 teams ──
  for (const t of Object.values(TEAMS)) {
    await TeamDetailPage.render('/team/'+t.id, [], { id: t.id });
    scanHtmlForProblems(document.getElementById('page-root').innerHTML, `TeamDetail ${t.name}`);
  }

  // ── Test 4: DashboardPage.render() (uses live global matches by status, not tournament-scoped, but exercises the stat strip / win-count logic against our seeded matches since Auth.getUser()='admin_uid' isn't a real participant — still exercises the code path without crashing) ──
  await DashboardPage.render();
  await new Promise(r=>setTimeout(r, 50));
  scanHtmlForProblems(document.getElementById('page-root').innerHTML, 'Dashboard (main)');

  console.log(issues.length ? issues.join('\n') : 'No rendering issues found.');
  console.log(`\n${issues.length} issue(s) found across ${matches.length} matches × 5 tabs + tournament + 4 teams + dashboard.`);
}

main()
  .then(() => { process.exit(issues.length > 0 ? 1 : 0); })
  .catch(e => { console.error('HARNESS ERROR:', e); process.exit(1); });
