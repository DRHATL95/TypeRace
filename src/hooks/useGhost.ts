import { useCallback, useRef, useEffect, useState } from 'react';
import { getGhostData, saveGhostData } from '../utils/storage';

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

  useEffect(() => {
    if (!isStarted || !ghostData.current || !enabled || startTime === 0) {
      return;
    }

    const data = ghostData.current;

    intervalRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      let idx = -1;
      for (let i = 0; i < data.length; i++) {
        if (data[i] <= elapsed) {
          idx = i;
        } else {
          break;
        }
      }
      setGhostIndex(idx);
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
    if (recordedTimestamps.current.length > 0) {
      const existing = getGhostData(passageId);
      if (!existing || recordedTimestamps.current.length >= existing.length) {
        saveGhostData(passageId, recordedTimestamps.current);
      }
    }
  }, [passageId]);

  return { ghostIndex, recordTimestamp, saveGhost };
}
