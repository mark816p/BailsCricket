// Full ball-by-ball match engine for generating internally-consistent
// Firestore-shaped match documents. Mirrors the FIXED logic verified in
// full_match_sim.js (target-reached-ends-chase, Super Over pairing via
// superOverStartIdx, team1Id/team2Id-correct result), but tracks full
// per-player aggregate stats and produces a real deliveries[] array —
// every aggregate number is DERIVED from deliveries, never hand-typed.

let _epoch = 1751500000000; // fake but monotonically increasing timestamp seed
function nextTs() { _epoch += 45000; return _epoch; } // ~45s between balls

function playersInOrder(squad) { return Object.values(squad); }

function newInningsShell(battingTeam, bowlingTeam) {
  return {
    battingTeamId: battingTeam.id, battingTeamName: battingTeam.name,
    bowlingTeamId: bowlingTeam.id, bowlingTeamName: bowlingTeam.name,
    runs: 0, wickets: 0, balls: 0,
    batters: {}, bowlers: {}, partnerships: [],
    powerplayRuns: 0, powerplayWickets: 0,
    striker: null, nonStriker: null, currentBowler: null,
    currentPartnership: null
  };
}

// plan: array of delivery instructions, e.g. {runs:1}, {runs:4}, {runs:0,wicket:'Bowled'},
//       {runs:0,isW:true}, {runs:1,isNB:true}, {runs:0,wicket:'Run Out',fielder:'...'}
// Stops automatically at 10 wickets, overs complete, or (if target given) target reached.
function playInnings({ battingTeam, bowlingTeam, overs, plan, target=null, powerplayOvers=6, matchId, inningsIdx, deliveriesOut }) {
  const battingOrder = playersInOrder(battingTeam.players);
  const bowlingOrder = playersInOrder(bowlingTeam.players);
  const inn = newInningsShell(battingTeam, bowlingTeam);

  let nextBatterPtr = 2; // 0,1 already in as openers
  let bowlerPtr = 0;
  const maxBalls = overs * 6;

  const striker = battingOrder[0], nonStriker = battingOrder[1];
  inn.striker = striker.uid; inn.nonStriker = nonStriker.uid;
  inn.batters[striker.uid]    = { uid:striker.uid, name:striker.name, runs:0,balls:0,fours:0,sixes:0,out:false };
  inn.batters[nonStriker.uid] = { uid:nonStriker.uid, name:nonStriker.name, runs:0,balls:0,fours:0,sixes:0,out:false };
  inn.currentPartnership = { batter1: striker.name, batter2: nonStriker.name, runs:0, balls:0 };

  let bowler = bowlingOrder[bowlerPtr % bowlingOrder.length]; bowlerPtr++;
  inn.currentBowler = bowler.uid;
  inn.bowlers[bowler.uid] = { uid:bowler.uid, name:bowler.name, runs:0, balls:0, wickets:0 };

  let curStriker = striker.uid, curNonStriker = nonStriker.uid;
  let planIdx = 0;
  let ballsInCurrentOver = 0; // per-over delivery counter — mirrors confirmDelivery()'s
                              // real ballCountSnap.size approach: EVERY delivery counts
                              // (legal or not), so this can never collide the way
                              // deriving it from the legal-ball count would.

  while (planIdx < plan.length) {
    if (inn.wickets >= 10 || inn.balls >= maxBalls) break;
    if (target != null && inn.runs >= target) break;

    const d = plan[planIdx++];
    const runs = d.runs ?? 0;
    const isNB = !!d.isNB, isW = !!d.isW;
    const wicket = d.wicket || null;
    const isRetired = wicket && wicket.startsWith('Retired');
    const boundary = (runs===4||runs===6) ? runs : null;
    const legalBall = !isNB && !isW;
    const totalRuns = runs + (isNB||isW ? 1 : 0);
    const isValidWicket = wicket && !isRetired && (!isNB || wicket === 'Run Out');
    const currentOver = Math.floor(inn.balls / 6);
    const inPP = currentOver < powerplayOvers;

    const batterEntry = inn.batters[curStriker];
    const bowlerEntry  = inn.bowlers[inn.currentBowler];

    inn.runs += totalRuns;
    if (legalBall) inn.balls += 1;
    if (isValidWicket) inn.wickets += 1;
    if (!isW) {
      batterEntry.runs += runs; batterEntry.balls += 1;
      if (boundary===4) batterEntry.fours++;
      if (boundary===6) batterEntry.sixes++;
    }
    if (legalBall) bowlerEntry.balls += 1;
    bowlerEntry.runs += totalRuns;
    if (isValidWicket && wicket !== 'Run Out') bowlerEntry.wickets++;
    if (!wicket && !isW) { inn.currentPartnership.runs += runs; inn.currentPartnership.balls += 1; }
    if (inPP) { inn.powerplayRuns += totalRuns; if (isValidWicket) inn.powerplayWickets++; }

    deliveriesOut.push({
      matchId, inningsIdx,
      over: currentOver, ball: ballsInCurrentOver,
      batsmanUid: curStriker, batsmanName: batterEntry.name,
      bowlerUid: inn.currentBowler, bowlerName: bowlerEntry.name,
      runs: totalRuns, legalRuns: runs,
      isNoBall: isNB, isWide: isW,
      isBoundary: boundary != null, boundaryType: boundary,
      wicket: wicket ? { type: wicket, fielder: d.fielder || '' } : null,
      isValidDismissal: !!isValidWicket,
      powerplay: !!inPP, note: d.note || null,
      timestamp: nextTs()
    });
    ballsInCurrentOver++;

    if (isValidWicket) {
      batterEntry.out = true;
      batterEntry.outDesc = wicket + (d.fielder ? ` (${d.fielder})` : '');
      inn.partnerships.push({ ...inn.currentPartnership });
      if (inn.wickets < 10 && nextBatterPtr < battingOrder.length) {
        const newBatter = battingOrder[nextBatterPtr++];
        inn.batters[newBatter.uid] = { uid:newBatter.uid, name:newBatter.name, runs:0,balls:0,fours:0,sixes:0,out:false };
        const nsName = inn.batters[curNonStriker].name;
        inn.currentPartnership = { batter1: newBatter.name, batter2: nsName, runs:0, balls:0 };
        curStriker = newBatter.uid;
        inn.striker = curStriker;
      }
    }

    const overComplete = legalBall && inn.balls > 0 && inn.balls % 6 === 0;
    if (!isValidWicket && legalBall && runs % 2 !== 0) {
      [curStriker, curNonStriker] = [curNonStriker, curStriker];
    }
    if (overComplete && inn.wickets < 10 && inn.balls < maxBalls) {
      ballsInCurrentOver = 0;
      [curStriker, curNonStriker] = [curNonStriker, curStriker];
      bowler = bowlingOrder[bowlerPtr % bowlingOrder.length]; bowlerPtr++;
      inn.currentBowler = bowler.uid;
      if (!inn.bowlers[bowler.uid]) inn.bowlers[bowler.uid] = { uid:bowler.uid, name:bowler.name, runs:0, balls:0, wickets:0 };
    }
    inn.striker = curStriker; inn.nonStriker = curNonStriker;
  }

  return inn;
}

function getCurrentTarget(match, idx) {
  if (match.superOver) {
    const pairStart = match.superOverStartIdx;
    if (idx !== pairStart + 1) return null;
    const firstSO = match.innings[pairStart];
    return firstSO ? firstSO.runs + 1 : null;
  }
  if (idx !== 1) return null;
  const inn0 = match.innings[0];
  if (!inn0) return null;
  return match.dlsApplied ? match.dlsTarget : (inn0.runs + 1);
}

function endMatch(match) {
  let inn1, inn2;
  const isSuperOverResult = !!match.superOver;
  if (isSuperOverResult) {
    const pairStart = match.superOverStartIdx;
    inn1 = match.innings[pairStart]; inn2 = match.innings[pairStart + 1];
  } else {
    inn1 = match.innings[0]; inn2 = match.innings[1];
  }
  let result = 'draw', resultText = 'Match drawn.';
  if (inn1 && inn2) {
    const target = (!isSuperOverResult && match.dlsApplied) ? match.dlsTarget : inn1.runs + 1;
    let winningTeamId = null, margin = '';
    if (inn2.runs >= target) { winningTeamId = inn2.battingTeamId; margin = `won by ${10-(inn2.wickets??0)} wicket${(inn2.wickets??0)<9?'s':''}`; }
    else if (inn1.runs > inn2.runs) { winningTeamId = inn1.battingTeamId; margin = `won by ${inn1.runs-inn2.runs} run${inn1.runs-inn2.runs!==1?'s':''}`; }
    if (winningTeamId) {
      result = (winningTeamId === match.team1Id) ? 'team1' : 'team2';
      const winName = (winningTeamId === match.team1Id) ? match.team1Name : match.team2Name;
      resultText = `${winName} ${margin}.`;
    } else if (inn1.runs === inn2.runs) { result = 'tie'; resultText = 'Match tied!'; }
  }
  if (isSuperOverResult) resultText += ' (Super Over)';
  match.status = 'completed'; match.result = result; match.resultText = resultText;
  return match;
}

module.exports = { playInnings, getCurrentTarget, endMatch, newInningsShell, nextTs };
