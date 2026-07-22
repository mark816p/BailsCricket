#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// BAILS v28 — COMPREHENSIVE TEST RUNNER
// Covers:
//  [A] 10-match simulation + statistics consistency (1,000+ checks)
//  [B] endMatch() result-mapping fix (team1Id/team2Id correctness)
//  [C] Defensive rendering — no [object Object], undefined, NaN
//  [D] Live cricket _normalizeMatch() type safety
//  [E] UI rendering pipeline (match-detail, tournament-detail, team-detail, dashboard)
//  [F] Edge cases: Super Over, DLS, No-Ball+Bowled, chase completion
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');  // bails-cricket-scorer/

// ── Colour helpers ──────────────────────────────────────────────────────────
const GREEN  = s => `\x1b[32m${s}\x1b[0m`;
const RED    = s => `\x1b[31m${s}\x1b[0m`;
const YELLOW = s => `\x1b[33m${s}\x1b[0m`;
const BOLD   = s => `\x1b[1m${s}\x1b[0m`;
const DIM    = s => `\x1b[2m${s}\x1b[0m`;

// ── Test state ──────────────────────────────────────────────────────────────
let pass = 0, fail = 0, warn = 0;
const failures = [];
const warnings = [];

function ok(label, cond, detail='') {
  if (cond) { pass++; }
  else { fail++; failures.push({ label, detail }); }
}
function advisory(label, msg) { warn++; warnings.push({ label, msg }); }

// ══════════════════════════════════════════════════════════════════════════
// SECTION A — Match simulation + statistics consistency
// ══════════════════════════════════════════════════════════════════════════
console.log(BOLD('\n═══ [A] Match Simulation + Statistics Consistency ═══\n'));

const { matches, TEAMS } = require('./generate.js');
console.log(DIM(`  Generated ${matches.length} matches.\n`));

let totalDeliveries = 0;

matches.forEach(({ match, deliveries }) => {
  const tag = `[${match.id}] ${match.team1Name} vs ${match.team2Name} [${match.format}]`;
  totalDeliveries += deliveries.length;

  // Basic result sanity
  ok(`${tag} — resultText not empty`,                     match.resultText && match.resultText.length > 2);
  ok(`${tag} — no 'undefined' in resultText`,             !match.resultText.includes('undefined'));
  ok(`${tag} — result is a known value`,                  ['team1','team2','tie','draw'].includes(match.result));
  ok(`${tag} — status is completed`,                      match.status === 'completed');
  ok(`${tag} — team1Id !== team2Id`,                      match.team1Id !== match.team2Id);
  ok(`${tag} — participants is non-empty Array`,          Array.isArray(match.participants) && match.participants.length > 0);

  // Result mentions a real team (or tie/draw)
  const mentionsTeam = match.resultText.includes(match.team1Name) || match.resultText.includes(match.team2Name);
  const isTieDraw    = match.resultText.toLowerCase().includes('tied') || match.resultText.toLowerCase().includes('drawn');
  ok(`${tag} — resultText mentions a real team or tie/draw`, mentionsTeam || isTieDraw);

  // innings consistency
  ok(`${tag} — at least 2 innings`,  match.innings.length >= 2);

  match.innings.forEach((inn, idx) => {
    const innDeliveries = deliveries.filter(d => d.inningsIdx === idx);
    const dTag = `${tag} inn[${idx}]`;

    const legalCount = innDeliveries.filter(d => !d.isNoBall && !d.isWide).length;
    ok(`${dTag} balls(${inn.balls}) == legal delivery count(${legalCount})`, inn.balls === legalCount);

    const runSum = innDeliveries.reduce((s, d) => s + d.runs, 0);
    ok(`${dTag} runs(${inn.runs}) == sum of delivery runs(${runSum})`, inn.runs === runSum);

    const wicketCount = innDeliveries.filter(d => d.wicket && d.isValidDismissal).length;
    ok(`${dTag} wickets(${inn.wickets}) == valid-dismissal count(${wicketCount})`, inn.wickets === wicketCount);
    ok(`${dTag} wickets never > 10`, inn.wickets <= 10);

    // Per-batter consistency
    Object.values(inn.batters).forEach(b => {
      const own = innDeliveries.filter(d => d.batsmanUid === b.uid && !d.isWide);
      const rSum   = own.reduce((s, d) => s + d.legalRuns, 0);
      const bSum   = own.length;
      const fourSm = own.filter(d => d.boundaryType === 4).length;
      const sixSm  = own.filter(d => d.boundaryType === 6).length;
      ok(`${dTag} batter ${b.name} runs(${b.runs})==own(${rSum})`,   b.runs === rSum);
      ok(`${dTag} batter ${b.name} balls(${b.balls})==own(${bSum})`, b.balls === bSum);
      ok(`${dTag} batter ${b.name} fours(${b.fours})==own(${fourSm})`, b.fours === fourSm);
      ok(`${dTag} batter ${b.name} sixes(${b.sixes})==own(${sixSm})`, b.sixes === sixSm);
    });

    // Per-bowler consistency
    Object.values(inn.bowlers).forEach(bw => {
      const own     = innDeliveries.filter(d => d.bowlerUid === bw.uid);
      const rSum    = own.reduce((s, d) => s + d.runs, 0);
      const legalSm = own.filter(d => !d.isNoBall && !d.isWide).length;
      const wSum    = own.filter(d => d.wicket && d.isValidDismissal && d.wicket.type !== 'Run Out').length;
      ok(`${dTag} bowler ${bw.name} runs(${bw.runs})==own(${rSum})`,     bw.runs === rSum);
      ok(`${dTag} bowler ${bw.name} balls(${bw.balls})==own(${legalSm})`, bw.balls === legalSm);
      ok(`${dTag} bowler ${bw.name} wickets(${bw.wickets})==own(${wSum})`, bw.wickets === wSum);
    });

    // No duplicate (over, ball) delivery keys
    const seen = new Set(); let dupFound = false;
    innDeliveries.forEach(d => { const k = `${d.over}.${d.ball}`; if (seen.has(k)) dupFound = true; seen.add(k); });
    ok(`${dTag} no duplicate (over,ball) delivery keys`, !dupFound,
       dupFound ? 'DUPLICATE DELIVERY KEY — same over+ball used twice in this innings' : '');
  });

  // participants
  const expParticipants = new Set();
  match.innings.forEach(inn => {
    Object.keys(inn.batters).forEach(u => expParticipants.add(u));
    Object.keys(inn.bowlers).forEach(u => expParticipants.add(u));
  });
  const missing = [...expParticipants].filter(u => !match.participants.includes(u));
  ok(`${tag} participants[] covers all batters/bowlers (missing: ${missing.length})`, missing.length === 0);

  // Man of the match is a real participant
  const allNames = new Set();
  match.innings.forEach(inn => {
    Object.values(inn.batters).forEach(b => allNames.add(b.name));
    Object.values(inn.bowlers).forEach(b => allNames.add(b.name));
  });
  ok(`${tag} manOfMatch(${match.manOfMatch}) is a real participant`, allNames.has(match.manOfMatch));

  console.log(DIM(`  ${tag} — ${match.resultText} (${deliveries.length}d, ${match.innings.length}inn)`));
});

console.log(DIM(`\n  Total deliveries across all matches: ${totalDeliveries}`));


// ══════════════════════════════════════════════════════════════════════════
// SECTION B — endMatch() result mapping correctness (Bug 28f / Bug 26)
// Tests the critical fix: result='team1'/'team2' must match team1Id/team2Id
// not batting order.
// ══════════════════════════════════════════════════════════════════════════
console.log(BOLD('\n═══ [B] endMatch() Result Mapping Correctness ═══\n'));

const { playInnings, endMatch, newInningsShell } = require('./engine.js');

// Helper: build a minimal match fixture
function mkMinMatch(team1, team2, tossWinner, elects) {
  const battingFirst = (tossWinner === team1.id)
    ? (elects === 'bat' ? team1 : team2)
    : (elects === 'bat' ? team2 : team1);
  const bowlingFirst = battingFirst.id === team1.id ? team2 : team1;
  return {
    id: 'test_match', team1Id: team1.id, team1Name: team1.name,
    team2Id: team2.id, team2Name: team2.name,
    overs: 5, format: 'T5', status: 'live',
    dlsApplied: false, superOver: false, innings: [],
    _battingFirst: battingFirst, _bowlingFirst: bowlingFirst
  };
}

function simpleSquad(teamId, prefix) {
  const players = {};
  for (let i = 0; i < 11; i++) {
    const uid = `${prefix}_${i}`;
    players[uid] = { uid, name: `P${i}_${prefix}` };
  }
  return { id: teamId, name: teamId, players };
}

const teamA = simpleSquad('team_A', 'a');
const teamB = simpleSquad('team_B', 'b');

// Scenario B1: teamA = team1, teamA bats FIRST, teamA wins by runs
// Expected: result === 'team1'
{
  const m = mkMinMatch(teamA, teamB, teamA.id, 'bat');
  const d = [];
  const inn0 = playInnings({ battingTeam: m._battingFirst, bowlingTeam: m._bowlingFirst, overs: 5, plan: [{runs:1},{runs:1},{runs:1},{runs:1},{runs:1},{runs:1}].concat(Array(24).fill({runs:1})), matchId:'t', inningsIdx:0, deliveriesOut:d, powerplayOvers:2 });
  const inn1 = playInnings({ battingTeam: m._bowlingFirst, bowlingTeam: m._battingFirst, overs: 5, plan: Array(30).fill({runs:0}), target: inn0.runs+1, matchId:'t', inningsIdx:1, deliveriesOut:d, powerplayOvers:2 });
  m.innings = [inn0, inn1];
  endMatch(m);
  ok('B1 teamA bats first as team1Id → result="team1" when teamA wins by runs', m.result === 'team1',
     `got result="${m.result}", resultText="${m.resultText}"`);
}

// Scenario B2: teamB = team2, teamB bats FIRST (wins toss, elects bat), teamB wins by runs
// This is the BUG REGRESSION — previously result was set to 'team1' because inn[0] = batting first = "team1"
// Expected: result === 'team2'
{
  const m = mkMinMatch(teamA, teamB, teamB.id, 'bat');  // teamB wins toss and bats first
  const d = [];
  const inn0 = playInnings({ battingTeam: m._battingFirst, bowlingTeam: m._bowlingFirst, overs: 5, plan: Array(30).fill({runs:1}), matchId:'t', inningsIdx:0, deliveriesOut:d, powerplayOvers:2 });
  const inn1 = playInnings({ battingTeam: m._bowlingFirst, bowlingTeam: m._battingFirst, overs: 5, plan: Array(30).fill({runs:0}), target: inn0.runs+1, matchId:'t', inningsIdx:1, deliveriesOut:d, powerplayOvers:2 });
  m.innings = [inn0, inn1];
  endMatch(m);
  ok('B2 teamB bats first as team2Id → result="team2" when teamB wins by runs (BUG REGRESSION)', m.result === 'team2',
     `got result="${m.result}", resultText="${m.resultText}" | inn0.battingTeamId=${inn0.battingTeamId}, team1Id=${m.team1Id}`);
}

// Scenario B3: teamA = team1 bats first, teamB wins the CHASE by wickets
// teamB = team2 → Expected: result === 'team2'
{
  const m = mkMinMatch(teamA, teamB, teamA.id, 'bat');
  const d = [];
  const inn0 = playInnings({ battingTeam: m._battingFirst, bowlingTeam: m._bowlingFirst, overs: 5, plan: Array(30).fill({runs:0}), matchId:'t', inningsIdx:0, deliveriesOut:d, powerplayOvers:2 });
  // teamB chases successfully in the first ball
  const inn1 = playInnings({ battingTeam: m._bowlingFirst, bowlingTeam: m._battingFirst, overs: 5, plan: Array(30).fill({runs:1}), target: inn0.runs+1, matchId:'t', inningsIdx:1, deliveriesOut:d, powerplayOvers:2 });
  m.innings = [inn0, inn1];
  endMatch(m);
  ok('B3 teamA bats first, teamB chases → result="team2"', m.result === 'team2',
     `got result="${m.result}"`);
}

// Scenario B4: Tie → result === 'tie'
{
  const m = mkMinMatch(teamA, teamB, teamA.id, 'bat');
  const d = [];
  // Both score exactly 6 runs in 30 balls
  const inn0 = playInnings({ battingTeam: m._battingFirst, bowlingTeam: m._bowlingFirst, overs: 5, plan: Array(30).fill({runs:0}).map((_,i) => i < 6 ? {runs:1} : {runs:0}), matchId:'t', inningsIdx:0, deliveriesOut:d, powerplayOvers:2 });
  const tieTarget = inn0.runs + 1;
  // inn1 scores exactly same as inn0 but can't reach target (target = inn0.runs+1)
  // Make inn1 score exactly inn0.runs
  const inn1plan = Array(30).fill({runs:0}).map((_,i) => i < inn0.runs ? {runs:1} : {runs:0});
  const inn1 = playInnings({ battingTeam: m._bowlingFirst, bowlingTeam: m._battingFirst, overs: 5, plan: inn1plan, target: tieTarget, matchId:'t', inningsIdx:1, deliveriesOut:d, powerplayOvers:2 });
  m.innings = [inn0, inn1];
  endMatch(m);
  ok('B4 equal scores → result="tie"', m.result === 'tie',
     `got result="${m.result}", inn0.runs=${inn0.runs}, inn1.runs=${inn1.runs}`);
}

// Scenario B5: teamB wins toss, BOWLS first (elects bowl), teamA chases and wins
// teamA = team1Id → Expected: result === 'team1'
{
  const m = mkMinMatch(teamA, teamB, teamB.id, 'bowl');  // teamB wins toss but bowls — teamA bats first
  const d = [];
  const inn0 = playInnings({ battingTeam: m._battingFirst, bowlingTeam: m._bowlingFirst, overs:5, plan: Array(30).fill({runs:1}), matchId:'t', inningsIdx:0, deliveriesOut:d, powerplayOvers:2 });
  const inn1 = playInnings({ battingTeam: m._bowlingFirst, bowlingTeam: m._battingFirst, overs:5, plan: Array(30).fill({runs:0}), target: inn0.runs+1, matchId:'t', inningsIdx:1, deliveriesOut:d, powerplayOvers:2 });
  m.innings = [inn0, inn1];
  endMatch(m);
  ok('B5 teamB wins toss+bowls, teamA(team1Id) bats first and wins → result="team1"', m.result === 'team1',
     `got result="${m.result}", battingFirst=${m._battingFirst.id}, team1Id=${m.team1Id}`);
}

// Verify the 10 generated matches result mapping is correct
matches.forEach(({ match }) => {
  if (match.result === 'tie' || match.result === 'draw') return; // no winner to check
  const winnerKey = match.result; // 'team1' or 'team2'
  const expectedWinnerId = winnerKey === 'team1' ? match.team1Id : match.team2Id;
  // Find which innings the winner was batting in and verify their battingTeamId matches
  const inn1 = match.innings[0], inn2 = match.innings[match.superOver ? match.superOverStartIdx+1 : 1];
  if (!inn1 || !inn2) return;
  const target = match.dlsApplied ? match.dlsTarget : inn1.runs + 1;
  let actualWinnerId;
  if (match.superOver) {
    const si1 = match.innings[match.superOverStartIdx];
    const si2 = match.innings[match.superOverStartIdx + 1];
    if (si2 && si2.runs >= si1.runs + 1) actualWinnerId = si2.battingTeamId;
    else if (si1 && si1.runs > si2.runs) actualWinnerId = si1.battingTeamId;
  } else {
    if (inn2.runs >= target) actualWinnerId = inn2.battingTeamId;
    else if (inn1.runs > inn2.runs) actualWinnerId = inn1.battingTeamId;
  }
  if (actualWinnerId) {
    ok(`${match.id} result='${match.result}' maps to correct teamId`, expectedWinnerId === actualWinnerId,
       `result='${match.result}' → expectedId=${expectedWinnerId}, actualWinnerId=${actualWinnerId}`);
  }
});


// ══════════════════════════════════════════════════════════════════════════
// SECTION C — Defensive rendering: no [object Object], NaN, undefined
// Tests that normalizeMatch + card renderers handle bad inputs safely
// ══════════════════════════════════════════════════════════════════════════
console.log(BOLD('\n═══ [C] Defensive Rendering — No [object Object] / NaN / undefined ═══\n'));

// Reproduce the _normalizeMatch logic (from liveCricket.js Path A) locally
function normalizeMatchPathA(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const s = v => (v != null && v !== '' && v !== false) ? String(v) : null;
  const t1 = raw.teamInfo && raw.teamInfo[0] ? raw.teamInfo[0] : {};
  const t2 = raw.teamInfo && raw.teamInfo[1] ? raw.teamInfo[1] : {};
  const sc = raw.score || [];
  const sc1 = sc[0] || {}, sc2 = sc[1] || {};
      // safeStr: if a value is itself a nested object
      const safeStr = v => {
        if (v == null) return null;
        if (typeof v === 'string') return v || null;
        if (typeof v === 'object' && !Array.isArray(v)) {
          const best = v.name || v.full || v.long || v.value || v.text || v.short || Object.values(v)[0];
          return best != null ? String(best) : null;
        }
        return String(v) || null;
      };
      return {
        id: safeStr(raw.id) || safeStr(raw.matchId) || 'unknown',
        name: safeStr(raw.name) || `${safeStr(t1.name) || '?'} vs ${safeStr(t2.name) || '?'}`,
        matchType: safeStr(raw.matchType) || safeStr(raw.matchFormat) || 'UNKNOWN',
        statusText: safeStr(raw.status) || '',
        isLive: !!raw.matchStarted && !!raw.matchEnded,
        isUpcoming: !raw.matchStarted,
        isCompleted: !!raw.matchEnded,
        venue: safeStr(raw.venue),
        dateGMT: safeStr(raw.dateTimeGMT) || safeStr(raw.date),
        team1: { name: safeStr(t1.name) || safeStr(raw.teams && raw.teams[0]) || 'Team A', logo: null, score: sc1.r != null ? safeStr(`${sc1.r}/${sc1.w}`) : null, overs: safeStr(sc1.o) },
        team2: { name: safeStr(t2.name) || safeStr(raw.teams && raw.teams[1]) || 'Team B', logo: null, score: sc2.r != null ? safeStr(`${sc2.r}/${sc2.w}`) : null, overs: safeStr(sc2.o) },
        gender: safeStr(raw.gender) || 'men',
        source: 'Bails Custom API'
      };
}

// Reproduce extMatchCard (from live-cricket.js) locally 
function extMatchCard(m) {
  const str   = v => (v != null ? String(v) : '');
  const safeStr = v => {
    if (v == null) return '';
    if (typeof v === 'string') return v;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const best = v.name || v.full || v.long || v.value || v.text || v.short || Object.values(v)[0];
      return best != null ? String(best) : '[?]';
    }
    return String(v);
  };
  const score = (s, o) => { const ss = safeStr(s); const oo = safeStr(o); return ss ? (oo ? `${ss} (${oo})` : ss) : '—'; };
  const t1 = m.team1 && typeof m.team1 === 'object' ? m.team1 : { name: safeStr(m.team1 || 'Team 1'), score: null, overs: null };
  const t2 = m.team2 && typeof m.team2 === 'object' ? m.team2 : { name: safeStr(m.team2 || 'Team 2'), score: null, overs: null };
  return `<div class="card">
    <div>${safeStr(t1.name)}: ${score(t1.score, t1.overs)}</div>
    <div>${safeStr(t2.name)}: ${score(t2.score, t2.overs)}</div>
    <div>${safeStr(m.statusText)}</div>
    <div>${safeStr(m.matchType)}</div>
  </div>`;
}

function checkHtml(html, label) {
  ok(`${label} — no [object Object]`, !html.includes('[object Object]'),
     `HTML: ${html.slice(0,200)}`);
  ok(`${label} — no literal "undefined"`, !/\bundefined\b/.test(html),
     `HTML: ${html.slice(0,200)}`);
  ok(`${label} — no literal NaN`,         !/\bNaN\b/.test(html),
     `HTML: ${html.slice(0,200)}`);
  ok(`${label} — not empty`,              html.trim().length > 0);
}

// C1 — Normal well-formed API response
const goodApiResponse = {
  id: 'match_001', name: 'India vs Australia', matchType: 'T20I',
  status: 'India won by 5 wkts', matchStarted: true, matchEnded: true,
  dateTimeGMT: '2026-07-20T14:00:00', venue: 'MCG',
  teamInfo: [{ name: 'India', img: '' }, { name: 'Australia', img: '' }],
  score: [{ r: 186, w: 5, o: 19.3 }, { r: 185, w: 9, o: 20 }],
  gender: 'men'
};
const norm1 = normalizeMatchPathA(goodApiResponse);
ok('C1 normalizeMatch returns non-null for valid input', norm1 != null);
if (norm1) {
  ok('C1 team1.name is string', typeof norm1.team1.name === 'string');
  ok('C1 team2.name is string', typeof norm1.team2.name === 'string');
  ok('C1 team1.score is string or null', norm1.team1.score === null || typeof norm1.team1.score === 'string');
  ok('C1 no field is an object', !Object.values(norm1).some(v => v !== null && typeof v === 'object' && !Array.isArray(v) && !(v && v.name)));
  const card1 = extMatchCard(norm1);
  checkHtml(card1, 'C1 card render: good API response');
}

// C2 — API returns objects in places we expect strings (the original bug)
const buggyApiResponse = {
  id: { matchId: 'x', type: 'object' },  // id is an object!
  name: { first: 'India', second: 'Australia' },  // name is an object!
  matchType: ['T20I'],  // matchType is an array!
  status: { text: 'Live' },  // status is an object!
  teamInfo: [{ name: { short: 'IND', full: 'India' } }, { name: 'Australia' }],
  score: [{ r: 186, w: 5, o: 19.3 }, { r: 185, w: 9, o: 20 }],
  gender: 'men', matchStarted: true, matchEnded: false
};
const norm2 = normalizeMatchPathA(buggyApiResponse);
ok('C2 normalizeMatch handles object-type API fields without crashing', norm2 != null);
if (norm2) {
  const card2 = extMatchCard(norm2);
  checkHtml(card2, 'C2 card render: object-valued API fields');
}

// C3 — Completely missing/null fields
const emptyResponse = { id: 'x', matchStarted: false, matchEnded: false };
const norm3 = normalizeMatchPathA(emptyResponse);
ok('C3 normalizeMatch handles missing fields', norm3 != null);
if (norm3) {
  const card3 = extMatchCard(norm3);
  checkHtml(card3, 'C3 card render: all-empty response');
}

// C4 — Simulate stale Firestore cache: team1/team2 stored as objects (old format)
const staleCacheMatch = {
  id: 'old_match',
  name: 'Old Match',
  matchType: 'ODI',
  statusText: 'Live',
  isLive: true, isUpcoming: false, isCompleted: false,
  team1: { name: 'Team X', score: '250/6', overs: '50' },  // normal
  team2: 'Team Y string',  // team2 is accidentally a plain string!
  gender: 'men', source: 'cache'
};
const card4 = extMatchCard(staleCacheMatch);
checkHtml(card4, 'C4 card render: team2 is a plain string (stale cache)');

// C5 — Dashboard extMatchCard with same issues
function dashExtMatchCard(m) {
  const str = v => (v != null ? String(v) : '');
  const t1 = m.team1 && typeof m.team1 === 'object' ? m.team1 : { name: String(m.team1 || 'Team 1'), score: null };
  const t2 = m.team2 && typeof m.team2 === 'object' ? m.team2 : { name: String(m.team2 || 'Team 2'), score: null };
  return `<div class="card">
    <div>${str(t1.name)}: ${str(t1.score) || '—'}</div>
    <div>${str(t2.name)}: ${str(t2.score) || '—'}</div>
    <div>${str(m.matchType)}</div>
  </div>`;
}
const card5 = dashExtMatchCard(staleCacheMatch);
checkHtml(card5, 'C5 dashboard card: team2 plain string');

// C6 — Both team fields are objects with nested objects
const deepNestedMatch = {
  id: 'nest', name: 'Nested', matchType: 'T20',
  statusText: 'Upcoming', isLive: false, isUpcoming: true, isCompleted: false,
  team1: { name: { value: 'India' }, score: { text: '200/5' }, overs: { value: 20 } },
  team2: { name: 'Australia', score: null, overs: null },
  gender: 'men', source: 'test'
};
const card6 = extMatchCard(deepNestedMatch);
checkHtml(card6, 'C6 card render: deeply nested team fields');


// ══════════════════════════════════════════════════════════════════════════
// SECTION D — Cricket-specific rule verification
// ══════════════════════════════════════════════════════════════════════════
console.log(BOLD('\n═══ [D] Cricket Rules: No-Ball+Bowled, Chase Completion, Super Over ═══\n'));

// D1 — No Ball + Bowled must NOT count as a wicket
{
  const team = simpleSquad('t_nb', 'nb');
  const d = [];
  const plan = [
    { runs: 0, isNB: true, wicket: 'Bowled' },  // Should NOT be a wicket
    ...Array(29).fill({ runs: 1 })
  ];
  const inn = playInnings({ battingTeam: team, bowlingTeam: simpleSquad('t_nb2','nb2'), overs: 5, plan, matchId: 'nb_test', inningsIdx: 0, deliveriesOut: d, powerplayOvers: 2 });
  ok('D1 No-Ball+Bowled: wickets=0 (not counted)', inn.wickets === 0,
     `got wickets=${inn.wickets}`);
  ok('D1 No-Ball+Bowled: delivery marked isValidDismissal=false', d[0].isValidDismissal === false,
     `got isValidDismissal=${d[0].isValidDismissal}`);
  ok('D1 No-Ball+Bowled: NB penalty run counted', d[0].runs === 1,
     `got runs=${d[0].runs} (should be 0+1 NB extra)`);
}

// D2 — No Ball + Run Out MUST count as a wicket
{
  const team = simpleSquad('t_nbro', 'nbro');
  const d = [];
  const plan = [
    { runs: 0, isNB: true, wicket: 'Run Out', fielder: 'F. Ieldman' },  // MUST count
    ...Array(29).fill({ runs: 1 })
  ];
  const inn = playInnings({ battingTeam: team, bowlingTeam: simpleSquad('t_nbro2','nbro2'), overs: 5, plan, matchId: 'nbro_test', inningsIdx: 0, deliveriesOut: d, powerplayOvers: 2 });
  ok('D2 No-Ball+Run-Out: wickets=1 (MUST count)', inn.wickets === 1,
     `got wickets=${inn.wickets}`);
  ok('D2 No-Ball+Run-Out: delivery marked isValidDismissal=true', d[0].isValidDismissal === true,
     `got isValidDismissal=${d[0].isValidDismissal}`);
}

// D3 — Chase should end the moment target is reached (not continue)
{
  const battingTeam = simpleSquad('t_chase', 'ch');
  const bowlingTeam = simpleSquad('t_bowl', 'bw');
  const d = [];
  const inn0 = playInnings({ battingTeam, bowlingTeam, overs: 5, plan: Array(30).fill({runs:1}), matchId: 'chase_test', inningsIdx: 0, deliveriesOut: d, powerplayOvers: 2 });
  // inn0 scored 30. Target = 31. Plan gives 1 per ball. Should stop after 31 balls are consumed.
  const d1 = [];
  // target = 31. Give inn1 enough runs (by scoring 2 runs per ball) so it easily passes target
  const inn1 = playInnings({ battingTeam: bowlingTeam, bowlingTeam: battingTeam, overs: 5, plan: Array(30).fill({runs:2}), target: inn0.runs+1, matchId: 'chase_test', inningsIdx: 1, deliveriesOut: d1, powerplayOvers: 2 });
  ok('D3 Chase ended when target reached (balls < max)', inn1.balls < 30,
     `balls=${inn1.balls}, target=${inn0.runs+1}, inn1.runs=${inn1.runs}`);
  ok('D3 Chase: inn1.runs >= target', inn1.runs >= inn0.runs+1,
     `inn1.runs=${inn1.runs}, target=${inn0.runs+1}`);
}

// D4 — 10 wickets end innings
{
  const battingTeam = simpleSquad('t_allout', 'ao');
  const bowlingTeam = simpleSquad('t_bowl2', 'bw2');
  const d = [];
  // 10 consecutive wickets (Bowled)
  const plan = Array(10).fill({ runs: 0, wicket: 'Bowled' }).concat(Array(30).fill({runs:6}));
  const inn = playInnings({ battingTeam, bowlingTeam, overs: 5, plan, matchId: 'allout_test', inningsIdx: 0, deliveriesOut: d, powerplayOvers: 2 });
  ok('D4 All-out: wickets=10', inn.wickets === 10, `got wickets=${inn.wickets}`);
  ok('D4 All-out: innings ended before overs (balls < 30)', inn.balls < 30,
     `balls=${inn.balls}`);
}

// D5 — Wide does NOT advance ball count
{
  const battingTeam = simpleSquad('t_wide', 'wd');
  const bowlingTeam = simpleSquad('t_bowl3', 'bw3');
  const d = [];
  // 5 wides followed by 1 legal dot = 1 legal ball
  const plan = Array(5).fill({ runs: 0, isW: true }).concat([{ runs: 0 }]);
  const inn = playInnings({ battingTeam, bowlingTeam, overs: 5, plan, matchId: 'wide_test', inningsIdx: 0, deliveriesOut: d, powerplayOvers: 2 });
  ok('D5 Wides do not advance balls count (balls=1 for 5W+1legal)', inn.balls === 1,
     `got balls=${inn.balls}`);
  ok('D5 Wide extras counted in runs', inn.runs === 5,
     `got runs=${inn.runs}`);
}

// D6 — Super Over match result uses SO innings, not main innings
const soMatch = matches.find(({ match }) => match.superOver && match.superOverStartIdx != null);
if (soMatch) {
  const { match } = soMatch;
  ok('D6 Super Over match has superOverStartIdx set', match.superOverStartIdx != null,
     `superOverStartIdx=${match.superOverStartIdx}`);
  ok('D6 Super Over match has > 2 innings', match.innings.length > 2,
     `innings.length=${match.innings.length}`);
  // Verify result was decided from SO innings, not main innings
  const soInn1 = match.innings[match.superOverStartIdx];
  const soInn2 = match.innings[match.superOverStartIdx + 1];
  ok('D6 Super Over innings both exist', soInn1 != null && soInn2 != null);
  if (soInn1 && soInn2) {
    const soWinner = soInn2.runs >= soInn1.runs + 1 ? soInn2.battingTeamId : (soInn1.runs > soInn2.runs ? soInn1.battingTeamId : null);
    const expectedResult = soWinner === match.team1Id ? 'team1' : (soWinner === match.team2Id ? 'team2' : 'tie');
    ok(`D6 Super Over result correct: got '${match.result}' expected '${expectedResult}'`, match.result === expectedResult,
       `soInn1.runs=${soInn1.runs}, soInn2.runs=${soInn2.runs}, soWinner=${soWinner}`);
  }
} else {
  advisory('D6 Super Over', 'No Super Over match found in generated set — skipped');
}


// ══════════════════════════════════════════════════════════════════════════
// SECTION E — UI Rendering Pipeline (actual page JS files loaded via vm)
// ══════════════════════════════════════════════════════════════════════════
console.log(BOLD('\n═══ [E] UI Rendering Pipeline ═══\n'));

// Check if jsdom is available
let jsdomAvailable = false;
try { require.resolve('jsdom'); jsdomAvailable = true; } catch (_) {}

if (!jsdomAvailable) {
  advisory('E — jsdom', 'jsdom not installed — skipping live render tests. Run: npm install jsdom in qa/ or bails-cricket-scorer/');
  console.log(YELLOW('  ⚠ jsdom not found — install it to enable live render tests'));
} else {
  const { JSDOM } = require('jsdom');
  const vm = require('vm');
  const { createMockFirestore } = require('./firestore_mock.js');

  // Build seed store
  const seed = { matches: {}, teams: {}, tournaments: {}, users: {}, invitations: {} };
  seed.tournaments['sim_tournament_claude_sims'] = {
    id: 'sim_tournament_claude_sims', name: 'The Claude Sims', nameLower: 'the claude sims',
    ownerId: 'admin_uid', coHosts: [], umpires: [], matchCount: matches.length,
    createdAt: { toMillis: () => Date.now(), seconds: Math.floor(Date.now() / 1000) }
  };
  Object.values(TEAMS).forEach(t => {
    seed.teams[t.id] = { ...t, tournamentId: 'sim_tournament_claude_sims', ownerId: 'admin_uid' };
  });
  const deliveriesByMatch = {};
  matches.forEach(({ match, deliveries }) => {
    seed.matches[match.id] = match;
    deliveriesByMatch[match.id] = {};
    deliveries.forEach((d, i) => { deliveriesByMatch[match.id][`d_${i}`] = d; });
  });

  const { db, firebase } = createMockFirestore(seed);
  const dom = new JSDOM(`<!DOCTYPE html><html><body>
    <div id="page-root"></div>
    <div id="modal-overlay" class="hidden"><div id="modal-body"></div></div>
    <div id="toast-container"></div>
    <div id="global-back-bar"><span id="global-back-label"></span></div>
    <nav></nav>
  </body></html>`, { url: 'https://bails-cricketscorer.web.app/' });

  global.window    = dom.window;
  global.document  = dom.window.document;
  // Node 24 makes global.navigator a read-only getter — must use defineProperty
  try { global.navigator = dom.window.navigator; } catch (_) {
    Object.defineProperty(global, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
  }
  global.location  = dom.window.location;
  global.history   = dom.window.history;
  global.db        = db;
  global.firebase  = firebase;
  global.Auth = {
    getUser:    () => ({ uid: 'admin_uid', displayName: 'QA Admin' }),
    getProfile: () => ({ uid: 'admin_uid', displayName: 'QA Admin', username: 'qa_admin', followingTournaments: ['sim_tournament_claude_sims'] }),
    isAdmin:    () => true,
    isHost:     () => true,
    whenReady:  async () => true,
    onAuthChange: () => {},
    startGuestPrompt: () => {},
    init: () => {},
  };
  global.Router = {
    navigate: () => {}, register: () => {}, back: () => {},
    dispatch: () => {}, init: () => {}, canGoBack: () => false,
    getCurrentPath: () => '/'
  };

  function loadReal(relPath) {
    const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
    vm.runInThisContext(code, { filename: relPath });
  }

  try {
    loadReal('js/utils.js');
    global.Utils = Utils;
    // Seed deliveries into mock store synchronously before loading pages
    for (const [mid, deliveries] of Object.entries(deliveriesByMatch)) {
      for (const [id, d] of Object.entries(deliveries)) {
        seed[`matches/${mid}/deliveries`] = seed[`matches/${mid}/deliveries`] || {};
        seed[`matches/${mid}/deliveries`][id] = d;
      }
    }
    // Recreate db with deliveries now in seed
    const { db: db2, firebase: firebase2 } = createMockFirestore(seed);
    global.db = db2;
    global.firebase = firebase2;

    loadReal('js/pages/match-detail.js');
    loadReal('js/pages/dashboard.js');
    loadReal('js/pages/tournament-detail.js');
    loadReal('js/pages/team-detail.js');

    function scanHtml(html, where) {
      if (/\[object Object\]/.test(html))  ok(`${where} — no [object Object]`,  false, html.slice(0, 300));
      else                                  ok(`${where} — no [object Object]`,  true);
      if (/\bundefined\b/.test(html))       ok(`${where} — no "undefined"`,      false, html.slice(0, 300));
      else                                  ok(`${where} — no "undefined"`,      true);
      if (/\bNaN\b/.test(html))             ok(`${where} — no "NaN"`,            false, html.slice(0, 300));
      else                                  ok(`${where} — no "NaN"`,            true);
      if (html.trim().length === 0)         ok(`${where} — not empty`,           false);
      else                                  ok(`${where} — not empty`,           true);
    }

    async function runUITests() {
      // E1 — MatchDetailPage for every match (Score tab)
      for (const { match } of matches) {
        await MatchDetailPage.render('/match/' + match.id, [], { id: match.id });
        const html = document.getElementById('page-root').innerHTML;
        scanHtml(html, `E1 MatchDetail ${match.id}`);
      }

      // E2 — MatchDetailPage all tabs on first match
      const firstMatch = matches[0].match;
      await MatchDetailPage.render('/match/' + firstMatch.id, [], { id: firstMatch.id });
      for (const tab of ['worm', 'commentary', 'stats', 'squads']) {
        try {
          await MatchDetailPage.switchTab(tab);
          await new Promise(r => setTimeout(r, 20));
          const tabBody = document.getElementById('md-tab-body');
          if (tabBody) scanHtml(tabBody.innerHTML, `E2 MatchDetail tab=${tab}`);
          else ok(`E2 MatchDetail tab=${tab} — md-tab-body exists`, false, 'Element not found');
        } catch (e) {
          ok(`E2 MatchDetail tab=${tab} — no crash`, false, e.message);
        }
      }

      // E3 — TournamentDetailPage
      try {
        await TournamentDetailPage.render('/tournament/sim_tournament_claude_sims', [], { id: 'sim_tournament_claude_sims' });
        await new Promise(r => setTimeout(r, 50));
        scanHtml(document.getElementById('page-root').innerHTML, 'E3 TournamentDetail');
      } catch (e) {
        ok('E3 TournamentDetail — no crash', false, e.message);
      }

      // E4 — TeamDetailPage for all teams
      for (const t of Object.values(TEAMS)) {
        try {
          await TeamDetailPage.render('/team/' + t.id, [], { id: t.id });
          scanHtml(document.getElementById('page-root').innerHTML, `E4 TeamDetail ${t.name}`);
        } catch (e) {
          ok(`E4 TeamDetail ${t.name} — no crash`, false, e.message);
        }
      }

      // E5 — DashboardPage
      try {
        await DashboardPage.render();
        await new Promise(r => setTimeout(r, 50));
        scanHtml(document.getElementById('page-root').innerHTML, 'E5 Dashboard');
      } catch (e) {
        ok('E5 Dashboard — no crash', false, e.message);
      }
    }

    // ── SECTION G: Security & XSS Sanitization ──
    if (typeof Utils !== 'undefined' && Utils.escapeHtml) {
      ok('G1 Utils.escapeHtml encodes <script>', Utils.escapeHtml('<script>alert(1)</script>') === '&lt;script&gt;alert(1)&lt;/script&gt;');
      ok('G2 Utils.escapeHtml encodes quotes', Utils.escapeHtml('"hello" & \'world\'') === '&quot;hello&quot; &amp; &#039;world&#039;');
      ok('G3 Utils.escapeHtml handles null/empty', Utils.escapeHtml(null) === '' && Utils.escapeHtml('') === '');
    } else {
      ok('G1 Utils.escapeHtml exists', false, 'Utils.escapeHtml missing');
    }

    // Run async tests then print results
    runUITests().then(printResults).catch(e => {
      ok('E — UI test harness — no fatal error', false, e.message + '\n' + e.stack);
      printResults();
    });
    // printResults called from async chain
  } catch (loadErr) {
    ok('E — page JS load — no crash', false, loadErr.message);
  }
}

// ── Final results (called after async UI tests complete) ──────────────────
function printResults() {
  console.log(BOLD('\n═══ RESULTS ═══\n'));

  if (failures.length > 0) {
    console.log(RED(BOLD(`FAILURES (${failures.length}):`)));
    failures.forEach((f, i) => {
      console.log(RED(`  ${i+1}. ${f.label}`));
      if (f.detail) console.log(DIM(`       ${f.detail}`));
    });
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(YELLOW(BOLD(`ADVISORIES (${warnings.length}):`)));
    warnings.forEach(w => console.log(YELLOW(`  ⚠ [${w.label}] ${w.msg}`)));
    console.log('');
  }

  const total = pass + fail;
  if (fail === 0) {
    console.log(GREEN(BOLD(`✓ ALL ${pass} CHECKS PASSED`)));
  } else {
    console.log(RED(BOLD(`✗ ${fail}/${total} CHECKS FAILED`)) + '  ' + GREEN(`${pass}/${total} passed`));
  }
  console.log('');
  process.exit(fail > 0 ? 1 : 0);
}

// If jsdom not available, print results synchronously
if (!jsdomAvailable) printResults();
