import { useCallback, useRef } from 'react';
import { FireStreakTier } from '../types/GameTypes';

interface FireStreakState {
  consecutiveCorrect: number;
  longestStreak: number;
  tier: FireStreakTier;
  active: boolean;
}

function getTier(count: number): FireStreakTier {
  if (count >= 50) return 'unstoppable';
  if (count >= 25) return 'blazing';
  if (count >= 10) return 'fire';
  return 'none';
}

export function useFireStreak() {
  const stateRef = useRef<FireStreakState>({
    consecutiveCorrect: 0,
    longestStreak: 0,
    tier: 'none',
    active: false,
  });

  const recentTimestamps = useRef<number[]>([]);

  const recordKeystroke = useCallback((correct: boolean): FireStreakState => {
    const state = stateRef.current;
    const now = Date.now();

    if (!correct) {
      state.consecutiveCorrect = 0;
      state.tier = 'none';
      state.active = false;
      recentTimestamps.current = [];
      return { ...state };
    }

    state.consecutiveCorrect++;
    recentTimestamps.current.push(now);

    if (recentTimestamps.current.length > 20) {
      recentTimestamps.current.shift();
    }

    const stamps = recentTimestamps.current;
    if (stamps.length >= 5) {
      const recentInterval = (stamps[stamps.length - 1] - stamps[stamps.length - 5]) / 4;
      const avgInterval = (stamps[stamps.length - 1] - stamps[0]) / (stamps.length - 1);
      if (recentInterval > avgInterval * 1.43) {
        state.consecutiveCorrect = 0;
        state.tier = 'none';
        state.active = false;
        return { ...state };
      }
    }

    state.tier = getTier(state.consecutiveCorrect);
    state.active = state.tier !== 'none';

    if (state.consecutiveCorrect > state.longestStreak) {
      state.longestStreak = state.consecutiveCorrect;
    }

    return { ...state };
  }, []);

  const reset = useCallback(() => {
    stateRef.current = {
      consecutiveCorrect: 0,
      longestStreak: 0,
      tier: 'none',
      active: false,
    };
    recentTimestamps.current = [];
  }, []);

  const getLongestStreak = useCallback(() => stateRef.current.longestStreak, []);

  return { recordKeystroke, reset, getLongestStreak };
}
