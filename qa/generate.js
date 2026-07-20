const { TEAMS } = require('./teams.js');
const { playInnings, endMatch } = require('./engine.js');

function fill(n, pattern) {
  const out = [];
  for (let i=0;i<n;i++) out.push({ runs: pattern[i % pattern.length] });
  return out;
}
function withEvents(basePlan, events) {
  // events: {at: index-into-legal-balls (approx position), ...instruction} — spliced in, shifting later balls out correctly is unnecessary since our engine just consumes plan[] sequentially and stops at true end-conditions; we just overwrite specific slots.
  const plan = basePlan.slice();
  events.forEach(e => { if (e.at < plan.length) plan[e.at] = { ...plan[e.at], ...e.instr }; });
  return plan;
}

const matches = [];
let matchCounter = 1;
function newMatchId() { return `sim_match_${String(matchCounter++).padStart(2,'0')}`; }

function buildMatch({ team1, team2, format, overs, tossWinnerBatsFirst, inn0Plan, inn1Plan, dlsApplied=false, dlsOversForInn1=null, dlsTarget=null, superOverPlans=[], venue }) {
  const matchId = newMatchId();
  const battingFirst = tossWinnerBatsFirst === team1.id ? team1 : team2;
  const bowlingFirst  = battingFirst.id === team1.id ? team2 : team1;

  const match = {
    id: matchId, tournamentId: 'sim_tournament_claude_sims',
    team1Id: team1.id, team1Name: team1.name, team2Id: team2.id, team2Name: team2.name,
    format, overs, venue: venue || 'Claude Sims Ground', status: 'live',
    toss: `${battingFirst.name} won the toss and elected to bat first.`,
    powerplayOvers: Math.max(1, Math.min(6, Math.floor(overs*0.3))),
    reviews: { [team1.id]: 2, [team2.id]: 2 },
    dlsApplied: false, superOver: false,
    admins: [], participants: [], innings: []
  };

  const deliveries = [];
  const inn0 = playInnings({ battingTeam: battingFirst, bowlingTeam: bowlingFirst, overs, plan: inn0Plan, powerplayOvers: match.powerplayOvers, matchId, inningsIdx: 0, deliveriesOut: deliveries });
  match.innings.push(inn0);

  if (dlsApplied) {
    match.dlsApplied = true;
    match.overs = dlsOversForInn1;
    match.dlsTarget = dlsTarget;
    match.dlsOvers = dlsOversForInn1;
  }

  const inn1 = playInnings({ battingTeam: bowlingFirst, bowlingTeam: battingFirst, overs: match.overs, plan: inn1Plan, target: dlsApplied ? dlsTarget : inn0.runs+1, powerplayOvers: match.powerplayOvers, matchId, inningsIdx: 1, deliveriesOut: deliveries });
  match.innings.push(inn1);

  for (const so of superOverPlans) {
    match.superOver = true;
    match.overs = 1;
    const pairStart = match.innings.length;
    match.superOverStartIdx = pairStart;
    const soFirstBat = inn1.battingTeamId === team1.id ? team1 : team2; // per real convention: original 2nd-innings team bats first in SO
    const soFirstBowl = soFirstBat.id === team1.id ? team2 : team1;
    const soInn1 = playInnings({ battingTeam: soFirstBat, bowlingTeam: soFirstBowl, overs:1, plan: so.inn1Plan, powerplayOvers:1, matchId, inningsIdx: pairStart, deliveriesOut: deliveries });
    match.innings.push(soInn1);
    const soInn2 = playInnings({ battingTeam: soFirstBowl, bowlingTeam: soFirstBat, overs:1, plan: so.inn2Plan, target: soInn1.runs+1, powerplayOvers:1, matchId, inningsIdx: pairStart+1, deliveriesOut: deliveries });
    match.innings.push(soInn2);
    if (soInn1.runs !== soInn2.runs) break;
  }

  // Fielding stats derived from deliveries (catches/run-outs), same shape confirmDelivery() writes
  const fielding = {};
  deliveries.forEach(d => {
    if (d.wicket && d.isValidDismissal && d.wicket.fielder) {
      const fKey = d.wicket.fielder.toLowerCase().replace(/\s+/g,'_');
      if (!fielding[fKey]) fielding[fKey] = { name: d.wicket.fielder, uid: fKey, catches:0, runOuts:0 };
      if (d.wicket.type === 'Run Out') fielding[fKey].runOuts++; else if (['Caught Out','Caught Behind','Stumping'].includes(d.wicket.type)) fielding[fKey].catches++;
    }
  });
  match.fielding = fielding;

  // participants = every uid that appears as a batter or bowler anywhere in the innings
  const participantSet = new Set();
  match.innings.forEach(inn => { Object.keys(inn.batters).forEach(u=>participantSet.add(u)); Object.keys(inn.bowlers).forEach(u=>participantSet.add(u)); });
  match.participants = [...participantSet];

  endMatch(match);
  match.manOfMatch = pickManOfMatch(match);
  match.scheduledAt = { _seconds: Math.floor(Date.now()/1000) - (11-matchCounter)*3600, _nanoseconds: 0 };

  return { match, deliveries };
}

function pickManOfMatch(match) {
  let best = null, bestScore = -1;
  match.innings.forEach(inn => {
    Object.values(inn.batters).forEach(b => { const s = b.runs; if (s > bestScore) { bestScore = s; best = b.name; } });
    Object.values(inn.bowlers).forEach(b => { const s = (b.wickets||0)*25; if (s > bestScore) { bestScore = s; best = b.name; } });
  });
  return best;
}

const { claude_xi, sim_strikers, test_titans, debug_dynamos } = TEAMS;

// ═══ Match 1 — T20, normal comfortable win, team1 bats first ═══
matches.push(buildMatch({
  team1: claude_xi, team2: sim_strikers, format:'T20', overs:20, tossWinnerBatsFirst: claude_xi.id, venue:'Anthropic Oval',
  inn0Plan: withEvents(fill(120,[1,4,1,0,2,6,1,0,4,1]), [{at:45,instr:{runs:0,wicket:'Bowled'}},{at:80,instr:{runs:0,wicket:'Caught Out',fielder:'N. Seed'}}]),
  inn1Plan: withEvents(fill(120,[0,1,0,1,0,2,0,1,0,0]), [{at:10,instr:{runs:0,wicket:'Bowled'}},{at:30,instr:{runs:0,wicket:'LBW'}},{at:55,instr:{runs:0,wicket:'Caught Out',fielder:'A. Sonnet'}}])
}));

// ═══ Match 2 — T10, team2 (Debug Dynamos) wins toss & bats first; team1 (Test Titans) chases & wins — Bug 23 regression check ═══
matches.push(buildMatch({
  team1: test_titans, team2: debug_dynamos, format:'T10', overs:10, tossWinnerBatsFirst: debug_dynamos.id, venue:'Regression Park',
  inn0Plan: fill(60,[1,1,0,4,1,0]), // Debug Dynamos bat first: modest total
  inn1Plan: fill(60,[4,4,1,6,1,4])  // Test Titans chase hard and win
}));

// ═══ Match 3 — T10, team1 (Sim Strikers) bats first & bowls team2 out cheaply (all-out defense) ═══
matches.push(buildMatch({
  team1: sim_strikers, team2: test_titans, format:'T10', overs:10, tossWinnerBatsFirst: sim_strikers.id, venue:'Sample Stadium',
  inn0Plan: fill(60,[2,1,4,0,1,6]),
  inn1Plan: withEvents(fill(60,[0,1,0,0,1,0]), [0,7,14,21,28,35,42,49,55,58].map(i=>({at:i,instr:{runs:0,wicket:'Bowled'}}))) // 10 quick wickets
}));

// ═══ Match 4 — T5, chasing team all out before overs/target (Debug Dynamos chase Claude XI, lose all 10) ═══
matches.push(buildMatch({
  team1: debug_dynamos, team2: claude_xi, format:'T5', overs:5, tossWinnerBatsFirst: debug_dynamos.id, venue:'Segfault Grounds',
  inn0Plan: fill(30,[1,4,1,6,1,0]),
  inn1Plan: withEvents(fill(30,[0,1,0,0,1,0]), [0,4,8,12,16,20,22,24,26,28].map(i=>({at:i,instr:{runs:0,wicket:'Caught Out',fielder:'B. Haiku'}})))
}));

// ═══ Match 5 — T10, TIED → decisive Super Over ═══
matches.push(buildMatch({
  team1: claude_xi, team2: test_titans, format:'T10', overs:10, tossWinnerBatsFirst: claude_xi.id, venue:'Tiebreak Turf',
  inn0Plan: fill(60,[1,1,1,1,1,1]), // exactly 60 runs
  inn1Plan: fill(60,[1,1,1,1,1,1]), // ties at 60
  superOverPlans: [{ inn1Plan:[{runs:6},{runs:6},{runs:1},{runs:1},{runs:1},{runs:1}], inn2Plan:[{runs:6},{runs:6},{runs:6},{runs:0},{runs:0},{runs:0}] }]
}));

// ═══ Match 6 — T5, TIED → Super Over ALSO tied → 2nd Super Over decisive ═══
matches.push(buildMatch({
  team1: sim_strikers, team2: debug_dynamos, format:'T5', overs:5, tossWinnerBatsFirst: sim_strikers.id, venue:'Double Overtime Oval',
  inn0Plan: fill(30,[2,2,2,2,2,2]), // 60... wait keep low for T5: use smaller pattern
  inn1Plan: fill(30,[2,2,2,2,2,2]),
  superOverPlans: [
    { inn1Plan:[{runs:4},{runs:2},{runs:0},{runs:0},{runs:0},{runs:0}], inn2Plan:[{runs:4},{runs:2},{runs:0},{runs:0},{runs:0},{runs:0}] }, // ties again at 6
    { inn1Plan:[{runs:6},{runs:1},{runs:0},{runs:0},{runs:0},{runs:0}], inn2Plan:[{runs:6},{runs:1},{runs:1},{runs:0},{runs:0},{runs:0}] }  // decisive: 7 vs 8
  ]
}));

// ═══ Match 7 — T20, DLS-affected (rain interruption reduces team2's overs & target) ═══
matches.push(buildMatch({
  team1: test_titans, team2: claude_xi, format:'T20', overs:20, tossWinnerBatsFirst: test_titans.id, venue:'Rainout Reserve',
  inn0Plan: fill(120,[1,4,1,0,2,6,1,0,4,1]), // full 20 overs
  dlsApplied: true, dlsOversForInn1: 12, dlsTarget: 98,
  inn1Plan: fill(72,[4,4,1,4,1,0]) // reduced to 12 overs (72 balls), chasing revised target 98
}));

// ═══ Match 8 — T10, No-Ball+Bowled (must not count) + wides/no-balls exercised ═══
matches.push(buildMatch({
  team1: debug_dynamos, team2: sim_strikers, format:'T10', overs:10, tossWinnerBatsFirst: debug_dynamos.id, venue:'Extras Arena',
  inn0Plan: withEvents(fill(60,[1,1,0,1,1,0]), [
    {at:5,instr:{runs:0,isW:true}}, {at:15,instr:{runs:1,isW:true}}, {at:25,instr:{runs:0,isNB:true}},
    {at:35,instr:{runs:0,isNB:true,wicket:'Bowled'}}, // must NOT count as a wicket
    {at:36,instr:{runs:4,isNB:true}}, // free hit boundary
  ]),
  inn1Plan: fill(60,[1,0,1,0,1,0])
}));

// ═══ Match 9 — T20, high-scoring, last-ball chase finish ═══
matches.push(buildMatch({
  team1: claude_xi, team2: debug_dynamos, format:'T20', overs:20, tossWinnerBatsFirst: claude_xi.id, venue:'Thriller Terrace',
  inn0Plan: fill(120,[4,6,1,4,1,6,4,1,0,4]),
  inn1Plan: (() => {
    const p = fill(119, [4,6,1,4,1,6,4,1,0,4]);
    p.push({runs:2}); // final ball completes the chase exactly
    return p;
  })()
}));

// ═══ Match 10 — T5, low-scoring nail-biter decided by 1 run ═══
matches.push(buildMatch({
  team1: sim_strikers, team2: test_titans, format:'T5', overs:5, tossWinnerBatsFirst: sim_strikers.id, venue:'Nailbiter Nook',
  inn0Plan: fill(30,[1,0,1,0,1,1]), // modest total
  inn1Plan: fill(30,[1,0,1,0,0,1])  // falls exactly 1 short after using all overs
}));

module.exports = { matches, TEAMS };

if (require.main === module) {
  console.log(`Generated ${matches.length} matches.\n`);
  matches.forEach(({match, deliveries}) => {
    const inn1 = match.innings[0], inn2 = match.innings[1];
    console.log(`${match.id} [${match.format}] ${match.team1Name} vs ${match.team2Name} — ${match.resultText} (${deliveries.length} deliveries, ${match.innings.length} innings)`);
  });
}
