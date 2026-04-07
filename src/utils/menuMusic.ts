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

function handleUserGesture(): void {
  if (!pendingStart) return;
  pendingStart = false;
  document.removeEventListener('click', handleUserGesture);
  document.removeEventListener('keydown', handleUserGesture);
  startMenuMusic();
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
    pendingStart = true;
    document.addEventListener('click', handleUserGesture, { once: true });
    document.addEventListener('keydown', handleUserGesture, { once: true });
  });
}

export function stopMenuMusic(): void {
  pendingStart = false;
  document.removeEventListener('click', handleUserGesture);
  document.removeEventListener('keydown', handleUserGesture);
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
