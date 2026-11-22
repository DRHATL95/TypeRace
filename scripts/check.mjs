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
