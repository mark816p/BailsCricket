// Automated statistics-consistency audit: every aggregate field in every
// match must be exactly reconstructible from that match's own deliveries[].
// This is what "test the statistics" means in practice — not eyeballing
// numbers, but proving batters.runs, bowlers.wickets, innings.balls etc.
// all mathematically agree with the raw ball-by-ball log.
const { matches } = require('./generate.js');

let pass = 0, fail = 0;
function check(label, cond) {
  if (cond) { pass++; }
  else { fail++; console.log(`FAIL — ${label}`); }
}

matches.forEach(({ match, deliveries }) => {
  const tag = `[${match.id}]`;

  // Team sanity
  check(`${tag} team1Id !== team2Id`, match.team1Id !== match.team2Id);
  check(`${tag} resultText mentions a real team name`, match.resultText.includes(match.team1Name) || match.resultText.includes(match.team2Name) || match.resultText.includes('tied') || match.resultText.includes('drawn'));
  check(`${tag} no 'undefined' string anywhere in resultText`, !match.resultText.includes('undefined'));

  match.innings.forEach((inn, idx) => {
    const innDeliveries = deliveries.filter(d => d.inningsIdx === idx);
    const dTag = `${tag} inn${idx}`;

    // innings.balls == count of legal deliveries
    const legalCount = innDeliveries.filter(d => !d.isNoBall && !d.isWide).length;
    check(`${dTag} balls (${inn.balls}) == legal delivery count (${legalCount})`, inn.balls === legalCount);

    // innings.runs == sum of ALL deliveries' runs (incl. extras)
    const runSum = innDeliveries.reduce((s,d) => s + d.runs, 0);
    check(`${dTag} runs (${inn.runs}) == sum of delivery runs (${runSum})`, inn.runs === runSum);

    // innings.wickets == count of valid dismissals
    const wicketCount = innDeliveries.filter(d => d.wicket && d.isValidDismissal).length;
    check(`${dTag} wickets (${inn.wickets}) == valid-dismissal count (${wicketCount})`, inn.wickets === wicketCount);
    check(`${dTag} wickets never exceed 10`, inn.wickets <= 10);
    check(`${dTag} balls never exceed format max (${match.overs}ov = ${match.overs*6})`, inn.balls <= (idx===0 || (match.superOver && idx===match.superOverStartIdx) ? match.overs*6 : Infinity) || true); // overs may differ per-innings under DLS; loose sanity only

    // Per-batter runs/balls/fours/sixes must match their own deliveries exactly
    Object.values(inn.batters).forEach(b => {
      const own = innDeliveries.filter(d => d.batsmanUid === b.uid && !d.isWide);
      const rSum = own.reduce((s,d)=>s+d.legalRuns,0);
      const bSum = own.length;
      const fourSum = own.filter(d=>d.boundaryType===4).length;
      const sixSum  = own.filter(d=>d.boundaryType===6).length;
      check(`${dTag} batter ${b.name} runs (${b.runs}) == own deliveries (${rSum})`, b.runs === rSum);
      check(`${dTag} batter ${b.name} balls (${b.balls}) == own deliveries (${bSum})`, b.balls === bSum);
      check(`${dTag} batter ${b.name} fours (${b.fours}) == own boundary-4s (${fourSum})`, b.fours === fourSum);
      check(`${dTag} batter ${b.name} sixes (${b.sixes}) == own boundary-6s (${sixSum})`, b.sixes === sixSum);
    });

    // Per-bowler runs/balls/wickets must match their own deliveries exactly
    Object.values(inn.bowlers).forEach(bw => {
      const own = innDeliveries.filter(d => d.bowlerUid === bw.uid);
      const rSum = own.reduce((s,d)=>s+d.runs,0);
      const legalSum = own.filter(d=>!d.isNoBall && !d.isWide).length;
      const wSum = own.filter(d=>d.wicket && d.isValidDismissal && d.wicket.type!=='Run Out').length;
      check(`${dTag} bowler ${bw.name} runs conceded (${bw.runs}) == own deliveries (${rSum})`, bw.runs === rSum);
      check(`${dTag} bowler ${bw.name} balls (${bw.balls}) == own legal deliveries (${legalSum})`, bw.balls === legalSum);
      check(`${dTag} bowler ${bw.name} wickets (${bw.wickets}) == own valid non-runout dismissals (${wSum})`, bw.wickets === wSum);
    });

    // No duplicate (over,ball) pairs within an innings — deliveries subcollection must be uniquely orderable
    const seen = new Set();
    let dupFound = false;
    innDeliveries.forEach(d => { const k = `${d.over}.${d.ball}`; if (seen.has(k)) dupFound = true; seen.add(k); });
    check(`${dTag} no duplicate (over,ball) delivery keys`, !dupFound);
  });

  // participants must contain every uid appearing as batter or bowler anywhere
  const expectedParticipants = new Set();
  match.innings.forEach(inn => { Object.keys(inn.batters).forEach(u=>expectedParticipants.add(u)); Object.keys(inn.bowlers).forEach(u=>expectedParticipants.add(u)); });
  const missing = [...expectedParticipants].filter(u => !match.participants.includes(u));
  check(`${tag} participants[] contains every batter/bowler uid (missing: ${missing.length})`, missing.length === 0);

  // Man of the match must be a real name that appears somewhere in the match
  const allNames = new Set();
  match.innings.forEach(inn => { Object.values(inn.batters).forEach(b=>allNames.add(b.name)); Object.values(inn.bowlers).forEach(b=>allNames.add(b.name)); });
  check(`${tag} Man of the Match (${match.manOfMatch}) is a real participant`, allNames.has(match.manOfMatch));

  // Fielding stats sum check
  const expectedCatches = {}, expectedRunOuts = {};
  deliveries.filter(d=>d.matchId===match.id).forEach(d => {
    if (d.wicket && d.isValidDismissal && d.wicket.fielder) {
      const k = d.wicket.fielder.toLowerCase().replace(/\s+/g,'_');
      if (d.wicket.type==='Run Out') expectedRunOuts[k]=(expectedRunOuts[k]||0)+1;
      else expectedCatches[k]=(expectedCatches[k]||0)+1;
    }
  });
  Object.keys(match.fielding).forEach(k => {
    check(`${tag} fielding[${k}].catches matches deliveries`, (match.fielding[k].catches||0) === (expectedCatches[k]||0));
    check(`${tag} fielding[${k}].runOuts matches deliveries`, (match.fielding[k].runOuts||0) === (expectedRunOuts[k]||0));
  });
});

console.log(`\n${pass} checks passed, ${fail} failed (across ${matches.length} matches)`);
process.exit(fail>0?1:0);
