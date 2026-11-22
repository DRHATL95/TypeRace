// Post-race analysis built from the keystroke log TypeRacer records.
// Kept import-free so scripts/check-insights.mjs can run it under plain Node.

export interface Keystroke {
  /** ms since race start */
  t: number;
  correct: boolean;
  /** the character the passage expected at this position */
  expected: string;
}

export interface TimelinePoint {
  /** seconds since race start */
  t: number;
  /** cumulative net WPM at time t */
  wpm: number;
}

export interface RaceInsights {
  timeline: TimelinePoint[];
  /** seconds since race start, one entry per mistyped keystroke */
  errorTimes: number[];
  /** lowercased expected char -> times it was missed */
  missedKeys: Record<string, number>;
}

/** One timeline point per whole second plus a final point at the finish,
 *  each the net WPM (correct chars only) accumulated up to that moment. */
export function buildRaceInsights(log: Keystroke[], durationSec: number): RaceInsights {
  const timeline: TimelinePoint[] = [];
  const errorTimes: number[] = [];
  const missedKeys: Record<string, number> = {};

  for (const k of log) {
    if (k.correct) continue;
    errorTimes.push(k.t / 1000);
    const key = k.expected.toLowerCase();
    missedKeys[key] = (missedKeys[key] ?? 0) + 1;
  }

  if (durationSec <= 0) return { timeline, errorTimes, missedKeys };

  let i = 0;
  let correct = 0;
  const stops: number[] = [];
  for (let s = 1; s < durationSec; s++) stops.push(s);
  stops.push(durationSec);

  for (const s of stops) {
    while (i < log.length && log[i].t <= s * 1000) {
      if (log[i].correct) correct++;
      i++;
    }
    timeline.push({ t: s, wpm: Math.round((correct / 5) / (s / 60)) });
  }

  return { timeline, errorTimes, missedKeys };
}
