import { useCallback, useRef, useEffect, useState } from 'react';
import { getGhostData, saveGhostData } from '../utils/storage';
import { ghostIndexAt, paceIndexAt, shouldReplaceGhost } from '../utils/ghost';

interface UseGhostOptions {
  passageId: string;
  passageLength: number;
  enabled: boolean;
  isStarted: boolean;
  startTime: number;
  /** Best WPM for this passage's difficulty: drives a constant-speed pace
   *  ghost when the passage has no saved run. null/0 = no pace ghost. */
  paceWpm?: number | null;
}

/** Which ghost is running: a replay of your fastest saved run of this
 *  passage, a pace ghost at your best WPM, or none. */
export type GhostKind = 'run' | 'pace' | null;

export function useGhost({ passageId, passageLength, enabled, isStarted, startTime, paceWpm }: UseGhostOptions) {
  const [ghostIndex, setGhostIndex] = useState(-1);
  const [ghostKind, setGhostKind] = useState<GhostKind>(null);
  const ghostData = useRef<number[] | null>(null);
  const recordedTimestamps = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    ghostData.current = enabled ? getGhostData(passageId) : null;
    setGhostKind(!enabled ? null : ghostData.current ? 'run' : paceWpm && paceWpm > 0 ? 'pace' : null);
    setGhostIndex(-1);
    recordedTimestamps.current = [];
  }, [passageId, enabled, paceWpm]);

  // Clear recorded timestamps whenever the race resets, even if passageId
  // hasn't changed (e.g. "New Text" returns the same passage).
  useEffect(() => {
    if (!isStarted) {
      recordedTimestamps.current = [];
    }
  }, [isStarted]);

  useEffect(() => {
    if (!isStarted || !ghostKind || startTime === 0) {
      return;
    }

    const data = ghostData.current;
    const indexAt = (elapsed: number) =>
      ghostKind === 'run' && data ? ghostIndexAt(data, elapsed) : paceIndexAt(paceWpm ?? 0, elapsed, passageLength);

    intervalRef.current = window.setInterval(() => {
      setGhostIndex(indexAt(Date.now() - startTime));
    }, 50);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isStarted, ghostKind, startTime, paceWpm, passageLength]);

  const recordTimestamp = useCallback(() => {
    if (startTime > 0) {
      recordedTimestamps.current.push(Date.now() - startTime);
    }
  }, [startTime]);

  const saveGhost = useCallback(() => {
    if (shouldReplaceGhost(recordedTimestamps.current, getGhostData(passageId))) {
      saveGhostData(passageId, recordedTimestamps.current);
    }
  }, [passageId]);

  return { ghostIndex, ghostKind, recordTimestamp, saveGhost };
}
