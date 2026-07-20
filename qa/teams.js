// Team pool for "The Claude Sims" tournament — 4 teams, 11 players each.
// All guest players (isGuest:true, guest_ prefixed uids) since these are
// synthetic test fixtures, not real Bails accounts.
function mkSquad(prefix, names) {
  const players = {};
  const roles = ['Captain','Wicketkeeper','Batsman','Batsman','All-Rounder','Bowler','Bowler','Bowler','Batsman','All-Rounder','Batsman'];
  names.forEach((name, i) => {
    const uid = `guest_${prefix}_${i}`;
    players[uid] = { uid, name, role: roles[i] || 'Batsman', isGuest: true };
  });
  return players;
}

const TEAMS = {
  claude_xi: {
    id: 'sim_team_claude_xi', name: 'Claude XI', nameLower: 'claude xi',
    players: mkSquad('cxi', ['A. Sonnet','B. Haiku','C. Opus','D. Vector','E. Token','F. Weights','G. Gradient','H. Epoch','I. Tensor','J. Softmax','K. Embedding'])
  },
  sim_strikers: {
    id: 'sim_team_sim_strikers', name: 'Sim Strikers', nameLower: 'sim strikers',
    players: mkSquad('sst', ['L. Monte','M. Carlo','N. Seed','O. Random','P. Variance','Q. Sample','R. Bootstrap','S. Sigma','T. Mean','U. Median','V. Outlier'])
  },
  test_titans: {
    id: 'sim_team_test_titans', name: 'Test Titans', nameLower: 'test titans',
    players: mkSquad('ttn', ['W. Assert','X. Fixture','Y. Mock','Z. Stub','AA. Harness','BB. Coverage','CC. Regression','DD. Sanity','EE. Smoke','FF. Unit','GG. Suite'])
  },
  debug_dynamos: {
    id: 'sim_team_debug_dynamos', name: 'Debug Dynamos', nameLower: 'debug dynamos',
    players: mkSquad('ddy', ['HH. Trace','II. Watchpoint','JJ. Console','KK. Stackframe','LL. Breakpoint','MM. Callstack','NN. Heapdump','OO. Segfault','PP. Nullcheck','QQ. Backtrace','RR. Corebump'])
  }
};

module.exports = { TEAMS };
