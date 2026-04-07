import { isMuted } from './storage';

let audio: HTMLAudioElement | null = null;
let fadeInterval: ReturnType<typeof setInterval> | null = null;

const TARGET_VOLUME = 0.3;
const FADE_STEP = 0.02;
const FADE_INTERVAL_MS = 30;

function ensureAudio(): HTMLAudioElement {
  if (!audio) {
    audio = new Audio(`${process.env.PUBLIC_URL}/audio/menu-theme.mp3`);
    audio.loop = true;
    audio.volume = 0;
  }
  return audio;
}

function clearFade(): void {
  if (fadeInterval) {
    clearInterval(fadeInterval);
    fadeInterval = null;
  }
}

let pendingStart = false;

function fadeIn(): void {
  const el = ensureAudio();
  clearFade();
  fadeInterval = setInterval(() => {
    if (el.volume < TARGET_VOLUME - FADE_STEP) {
      el.volume = Math.min(el.volume + FADE_STEP, TARGET_VOLUME);
    } else {
      el.volume = TARGET_VOLUME;
      clearFade();
    }
  }, FADE_INTERVAL_MS);
}

function removeGestureListeners(): void {
  document.removeEventListener('pointerdown', handleUserGesture);
  document.removeEventListener('click', handleUserGesture);
  document.removeEventListener('keydown', handleUserGesture);
}

function handleUserGesture(): void {
  if (!pendingStart) return;
  pendingStart = false;
  removeGestureListeners();

  const el = ensureAudio();
  el.volume = 0;
  el.play().then(() => {
    // Only fade in if we haven't been stopped in the meantime
    if (!audio?.paused) fadeIn();
  }).catch(() => {});
}

export function startMenuMusic(): void {
  if (isMuted()) return;
  const el = ensureAudio();
  if (!el.paused) return;

  el.volume = 0;
  el.play().then(() => {
    fadeIn();
  }).catch(() => {
    // Browser blocked autoplay — retry on first user interaction
    // Use both pointerdown (Chrome) and click (Firefox) for broad compatibility
    pendingStart = true;
    document.addEventListener('pointerdown', handleUserGesture);
    document.addEventListener('click', handleUserGesture);
    document.addEventListener('keydown', handleUserGesture);
  });
}

export function stopMenuMusic(): void {
  pendingStart = false;
  removeGestureListeners();
  if (!audio || audio.paused) return;

  clearFade();
  const el = audio;
  fadeInterval = setInterval(() => {
    if (el.volume > FADE_STEP) {
      el.volume = Math.max(el.volume - FADE_STEP, 0);
    } else {
      el.volume = 0;
      el.pause();
      clearFade();
    }
  }, FADE_INTERVAL_MS);
}

export function setMenuMusicMuted(muted: boolean): void {
  if (!audio) return;
  if (muted) {
    audio.volume = 0;
    audio.pause();
    clearFade();
  } else {
    startMenuMusic();
  }
}
