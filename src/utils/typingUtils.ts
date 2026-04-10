import { RaceResult, TypingStats, CharacterStatus } from '../types/GameTypes';

export const calculateWPM = (correctCharacters: number, timeElapsed: number): number => {
  // Net WPM: only correct characters count. Spamming one key gives ~0 WPM.
  if (timeElapsed <= 0 || correctCharacters <= 0) return 0;
  const words = correctCharacters / 5;
  const minutes = timeElapsed / 60;
  return Math.round((words / minutes) * 100) / 100;
};

export const calculateAccuracy = (charactersTyped: number, errors: number): number => {
  if (charactersTyped === 0) return 100;
  const correctCharacters = charactersTyped - errors;
  return Math.round((correctCharacters / charactersTyped) * 100 * 100) / 100;
};

export const calculateRaceResult = (stats: TypingStats, textLength: number): RaceResult => {
  const timeElapsed = (stats.endTime! - stats.startTime) / 1000; // Convert to seconds
  const correctCharacters = Math.max(stats.charactersTyped - stats.errors, 0);
  const wpm = calculateWPM(correctCharacters, timeElapsed);
  const accuracy = calculateAccuracy(stats.charactersTyped, stats.errors);
  const completionPercentage = Math.round((stats.charactersTyped / textLength) * 100 * 100) / 100;

  return {
    wpm,
    accuracy,
    timeElapsed,
    charactersTyped: stats.charactersTyped,
    errors: stats.errors,
    textLength,
    completionPercentage
  };
};

export const parseTextToCharacters = (text: string): CharacterStatus[] => {
  return text.split('').map(char => ({
    char,
    status: 'pending' as const
  }));
};

export const getPerformanceMessage = (wpm: number, accuracy: number): string => {
  if (wpm >= 80 && accuracy >= 95) {
    return "Flawless execution. You're in the zone.";
  } else if (wpm >= 60 && accuracy >= 90) {
    return "Impressive velocity. Your fingers are flying.";
  } else if (wpm >= 40 && accuracy >= 85) {
    return "Solid run. Push harder next time.";
  } else if (wpm >= 30 && accuracy >= 80) {
    return "Warming up. The speed will come with practice.";
  } else {
    return "Every race builds muscle memory. Go again.";
  }
};

export const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
};

export const getWPMColor = (wpm: number): string => {
  if (wpm >= 80) return '#4ade80'; // Green
  if (wpm >= 60) return '#22d3ee'; // Cyan
  if (wpm >= 40) return '#fbbf24'; // Yellow
  if (wpm >= 30) return '#fb923c'; // Orange
  return '#f87171'; // Red
};

export const getAccuracyColor = (accuracy: number): string => {
  if (accuracy >= 95) return '#4ade80'; // Green
  if (accuracy >= 90) return '#22d3ee'; // Cyan
  if (accuracy >= 85) return '#fbbf24'; // Yellow
  if (accuracy >= 80) return '#fb923c'; // Orange
  return '#f87171'; // Red
};
