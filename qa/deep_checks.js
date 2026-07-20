const { JSDOM } = require('jsdom');
const fs = require('fs');
const path = require('path');
const { matches, TEAMS } = require('./generate.js');
const { createMockFirestore } = require('./firestore_mock.js');

const APP_DIR = '/home/claude/bails-v5';
const seed = { matches:{}, teams:{}, tournaments:{}, users:{}, invitations:{} };
seed.tournaments['sim_tournament_claude_sims'] = { id:'sim_tournament_claude_sims', name:'The Claude Sims', ownerId:'admin_uid', coHosts:[], umpires:[], matchCount:10, createdAt:{toMillis:()=>Date.now()} };
Object.values(TEAMS).forEach(t => { seed.teams[t.id] = { ...t, tournamentId:'sim_tournament_claude_sims', ownerId:'admin_uid' }; });
matches.forEach(({match}) => { seed.matches[match.id] = match; });

const { db, firebase } = createMockFirestore(seed);
const dom = new JSDOM(`<!DOCTYPE html><html><body><div id="page-root"></div><div id="modal-overlay" class="hidden"><div id="modal-body"></div></div><div id="toast-container"></div></body></html>`, { url:'https://bails-cricketscorer.web.app/' });
global.window=dom.window; global.document=dom.window.document; global.navigator=dom.window.navigator;
global.location=dom.window.location; global.history=dom.window.history;
global.db=db; global.firebase=firebase;

// Pick a REAL participant who should have a known win/loss record:
// A. Sonnet (Claude XI opener) batted in matches 1,4,5(+SO),7,9 — Claude XI won 1,5,7,9, lost 4 (as Debug Dynamos won that one). Expect 4 wins.
const testUid = 'guest_cxi_0'; // A. Sonnet

global.Auth = {
  getUser: () => ({ uid: testUid, displayName: 'A. Sonnet' }),
  getProfile: () => ({ uid: testUid, displayName: 'A. Sonnet', username:'a_sonnet' }),
  isAdmin: () => true, isHost: () => true, whenReady: async () => true,
};
global.Router = { navigate: ()=>{}, register: ()=>{}, back: ()=>{} };

function loadReal(rel) { require('vm').runInThisContext(fs.readFileSync(path.join(APP_DIR, rel), 'utf8'), { filename: rel }); }
loadReal('js/utils.js'); global.Utils = Utils;
loadReal('js/pages/dashboard.js');
loadReal('js/pages/tournament-detail.js');
loadReal('js/pages/match-detail.js');

async function main() {
  // Manually compute expected win count the same way a human would verify it:
  // count matches where A. Sonnet's team (Claude XI) is the recorded winner AND he batted.
  let expectedWins = 0;
  const expectedDetail = [];
  matches.forEach(({match}) => {
    const played = match.innings.some(inn => inn.batters[testUid] || inn.bowlers[testUid]);
    if (!played) return;
    const winTeamId = match.result === 'team1' ? match.team1Id : match.result === 'team2' ? match.team2Id : null;
    const claudeXiInvolved = match.team1Id === 'sim_team_claude_xi' || match.team2Id === 'sim_team_claude_xi';
    if (claudeXiInvolved && winTeamId === 'sim_team_claude_xi') { expectedWins++; expectedDetail.push(`${match.id}: WIN (${match.resultText})`); }
    else expectedDetail.push(`${match.id}: not a win for Claude XI (${match.resultText})`);
  });

  console.log('Expected win-eligible matches for A. Sonnet (Claude XI):');
  expectedDetail.forEach(l => console.log('  ' + l));
  console.log(`Expected win count: ${expectedWins}\n`);

  await DashboardPage.render();
  await new Promise(r=>setTimeout(r,80));
  const html = document.getElementById('page-root').innerHTML;
  const m = html.match(/dash-stat-val[^>]*>(\d+)<\/div>\s*<div class="dash-stat-lbl">Wins/);
  console.log('Dashboard rendered win count:', m ? m[1] : '(not found in HTML)');
  console.log('MATCH:', m && parseInt(m[1]) === expectedWins ? 'PASS ✓' : 'FAIL ✗');

  // Tournament standings sanity — dump the points table section
  await TournamentDetailPage.render('/tournament/sim_tournament_claude_sims', [], {id:'sim_tournament_claude_sims'});
  await new Promise(r=>setTimeout(r,50));
  const tHtml = document.getElementById('page-root').innerHTML;
  console.log('\nTournamentDetail rendered', tHtml.length, 'chars. Contains "Claude XI":', tHtml.includes('Claude XI'), '| "Debug Dynamos":', tHtml.includes('Debug Dynamos'));

  // Print one full Stats-tab render for visual sanity (match 5 — Super Over match)
  await MatchDetailPage.render('/match/sim_match_05', [], {id:'sim_match_05'});
  await MatchDetailPage.switchTab('stats');
  await new Promise(r=>setTimeout(r,30));
  console.log('\n--- sim_match_05 (Super Over) STATS TAB ---');
  console.log(document.getElementById('md-tab-body').innerHTML.replace(/\s+/g,' ').slice(0, 900));

  process.exit(0);
}
main().catch(e=>{console.error(e); process.exit(1);});
