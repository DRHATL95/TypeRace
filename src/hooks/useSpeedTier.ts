import { useMemo } from 'react';

export type SpeedTier = 'normal' | 'warm' | 'hot' | 'overdrive';

export function useSpeedTier(wpm: number): SpeedTier {
  return useMemo(() => {
    if (wpm >= 80) return 'overdrive';
    if (wpm >= 60) return 'hot';
    if (wpm >= 30) return 'warm';
    return 'normal';
  }, [wpm]);
}
