// Ghost racing rules. Import-free so scripts/check.mjs can run it under Node.
// A ghost is the list of ms-since-start timestamps of one finished run.

/** Index of the last char the ghost has typed by `elapsedMs`, or -1. */
export function ghostIndexAt(timestamps: number[], elapsedMs: number): number {
  let idx = -1;
  for (let i = 0; i < timestamps.length; i++) {
    if (timestamps[i] <= elapsedMs) idx = i;
    else break;
  }
  return idx;
}

/** Whether a just-finished run should replace the stored ghost: only when it
 *  finished sooner. (The old rule kept the run with the most recorded
 *  keystrokes, so any clean run — however slow — overwrote a faster best.) */
export function shouldReplaceGhost(candidate: number[], existing: number[] | null): boolean {
  if (candidate.length === 0) return false;
  if (!existing || existing.length === 0) return true;
  return candidate[candidate.length - 1] < existing[existing.length - 1];
}
