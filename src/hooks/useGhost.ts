import { useCallback, useRef, useEffect, useState } from 'react';
import { getGhostData, saveGhostData } from '../utils/storage';
import { ghostIndexAt, shouldReplaceGhost } from '../utils/ghost';

interface UseGhostOptions {
  passageId: string;
  passageLength: number;
  enabled: boolean;
  isStarted: boolean;
  startTime: number;
}

export function useGhost({ passageId, passageLength, enabled, isStarted, startTime }: UseGhostOptions) {
  const [ghostIndex, setGhostIndex] = useState(-1);
  const ghostData = useRef<number[] | null>(null);
  const recordedTimestamps = useRef<number[]>([]);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (enabled) {
      ghostData.current = getGhostData(passageId);
    } else {
      ghostData.current = null;
    }
    setGhostIndex(-1);
    recordedTimestamps.current = [];
  }, [passageId, enabled]);

  // Clear recorded timestamps whenever the race resets, even if passageId
  // hasn't changed (e.g. "New Text" returns the same passage).
  useEffect(() => {
    if (!isStarted) {
      recordedTimestamps.current = [];
    }
  }, [isStarted]);

  useEffect(() => {
    if (!isStarted || !ghostData.current || !enabled || startTime === 0) {
      return;
    }

    const data = ghostData.current;

    intervalRef.current = window.setInterval(() => {
      setGhostIndex(ghostIndexAt(data, Date.now() - startTime));
    }, 50);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isStarted, enabled, startTime]);

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

  return { ghostIndex, recordTimestamp, saveGhost };
}
