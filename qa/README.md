# QA Harness — "The Claude Sims"

Everything here is dev/QA tooling — none of it ships to production (not
referenced by index.html, not deployed as part of the app).

## Files
- `teams.js` — the 4-team synthetic squad pool (Claude XI, Sim Strikers, Test Titans, Debug Dynamos)
- `engine.js` — ball-by-ball match engine mirroring match-scoring.js's fixed logic exactly (target-reached-ends-chase, Super Over pairing, correct team1/team2 result mapping)
- `generate.js` — defines and generates the 10 scripted matches
- `verify_consistency.js` — automated statistics audit: proves every aggregate stat is mathematically derived from the raw deliveries (`node verify_consistency.js`)
- `firestore_mock.js` — in-memory Firestore mock (collection/doc/where/orderBy/limit/batch/transaction/FieldValue)
- `ui_test.js` — loads the REAL, unmodified page files (match-detail.js, dashboard.js, tournament-detail.js, team-detail.js) via Node's `vm` module against the mock, calls their actual render() functions, and scans the resulting HTML for "undefined"/"NaN"/"[object Object]"/empty-render bugs (`node ui_test.js`)
- `deep_checks.js` — targeted end-to-end check of the win-count pipeline with a real participant UID, plus HTML spot-checks
- `seed-claude-sims.js` — **paste this into your browser console while signed into the live app** to actually create "The Claude Sims" tournament in production Firestore (see the file's own header for full instructions)

## Re-running the full test suite
```
cd qa
npm install jsdom
node verify_consistency.js   # statistics consistency (1028 checks)
node ui_test.js              # UI rendering sanity (real page code, all tabs)
node deep_checks.js          # win-count + standings deep-dive
```

## Regenerating with different scenarios
Edit the `matches.push(buildMatch({...}))` calls in `generate.js`, then re-run
`build_seeder_script.js`-equivalent logic (see CLAUDE.md) to produce a fresh
`seed-claude-sims.js`.
