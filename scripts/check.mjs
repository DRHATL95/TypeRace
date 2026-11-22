// Self-checks for the pure helpers (no test runner in this repo). Run: npm run check
// (Node 24 strips the TypeScript types itself.)
import assert from 'node:assert/strict';
import { buildRaceInsights } from '../src/utils/raceInsights.ts';

// 10 correct chars in the first second, then a miss on "T" at 1.5s, finish at 2s.
const log = [
  ...Array.from({ length: 10 }, (_, n) => ({ t: n * 100, correct: true, expected: 'a' })),
  { t: 1500, correct: false, expected: 'T' },
  { t: 1600, correct: true, expected: 't' },
];
const r = buildRaceInsights(log, 2);
assert.deepEqual(r.timeline, [{ t: 1, wpm: 120 }, { t: 2, wpm: 66 }]); // 10/5*60, 11/5*30
assert.deepEqual(r.errorTimes, [1.5]);
assert.deepEqual(r.missedKeys, { t: 1 });

// Fractional finish gets its own final point; empty race is safe.
assert.equal(buildRaceInsights(log, 2.5).timeline.at(-1).t, 2.5);
assert.deepEqual(buildRaceInsights([], 0), { timeline: [], errorTimes: [], missedKeys: {} });

console.log('raceInsights OK');

// ── progression ──
const { xpForRace, levelFromXp } = await import('../src/utils/progression.ts');
assert.equal(xpForRace(160, 100, 'easy'), 160);
assert.equal(xpForRace(160, 90, 'hard'), 216);            // 160 * 0.9 * 1.5
assert.equal(xpForRace(0, 100, 'medium'), 0);
assert.deepEqual(levelFromXp(0),   { level: 1, into: 0,  needed: 100 });
assert.deepEqual(levelFromXp(99),  { level: 1, into: 99, needed: 100 });
assert.deepEqual(levelFromXp(100), { level: 2, into: 0,  needed: 150 }); // exact boundary levels up
assert.deepEqual(levelFromXp(260), { level: 3, into: 10, needed: 200 }); // 100 + 150 + 10
assert.deepEqual(levelFromXp(-5),  { level: 1, into: 0,  needed: 100 });

console.log('progression OK');

// ── ghost ──
const { ghostIndexAt, shouldReplaceGhost } = await import('../src/utils/ghost.ts');
const fast = [100, 200, 300];   // finished at 300ms
const slow = [400, 800, 1200];  // same passage, finished at 1200ms
assert.equal(shouldReplaceGhost(slow, fast), false);  // a slower clean run must not replace the best
assert.equal(shouldReplaceGhost(fast, slow), true);   // a faster run does
assert.equal(shouldReplaceGhost(fast, null), true);   // first run on a passage
assert.equal(shouldReplaceGhost([], null), false);    // nothing recorded
assert.equal(ghostIndexAt(fast, 0), -1);              // ghost hasn't typed yet
assert.equal(ghostIndexAt(fast, 250), 1);
assert.equal(ghostIndexAt(fast, 9999), 2);            // finished ghost stays on its last char

console.log('ghost OK');
