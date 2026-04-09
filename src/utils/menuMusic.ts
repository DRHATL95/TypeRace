import { isMuted, getVolume } from './storage';
import { getCtx } from './audioEngine';

let sourceNode: AudioBufferSourceNode | null = null;
let gainNode: GainNode | null = null;
let audioBuffer: AudioBuffer | null = null;
let fadeInterval: ReturnType<typeof setInterval> | null = null;
let loading = false;

const BASE_VOLUME = 0.3;
let volumeScale = getVolume() / 100; // 0–1

function targetVolume(): number {
  return BASE_VOLUME * volumeScale;
}
const FADE_STEP = 0.02;
const FADE_INTERVAL_MS = 30;

function clearFade(): void {
  if (fadeInterval) {
    clearInterval(fadeInterval);
    fadeInterval = null;
  }
}

async function loadBuffer(): Promise<AudioBuffer | null> {
  if (audioBuffer) return audioBuffer;
  if (loading) return null;
  loading = true;
  try {
    const url = `${process.env.PUBLIC_URL}/audio/menu-theme.mp3`;
    const response = await fetch(url);
    const arrayBuffer = await response.arrayBuffer();
    const ctx = getCtx();
    audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    return audioBuffer;
  } catch {
    return null;
  } finally {
    loading = false;
  }
}

function fadeIn(): void {
  if (!gainNode) return;
  clearFade();
  const gn = gainNode;
  fadeInterval = setInterval(() => {
    const current = gn.gain.value;
    if (current < targetVolume() - FADE_STEP) {
      gn.gain.value = Math.min(current + FADE_STEP, targetVolume());
    } else {
      gn.gain.value = targetVolume();
      clearFade();
    }
  }, FADE_INTERVAL_MS);
}

function fadeOut(onDone: () => void): void {
  if (!gainNode) { onDone(); return; }
  clearFade();
  const gn = gainNode;
  fadeInterval = setInterval(() => {
    const current = gn.gain.value;
    if (current > FADE_STEP) {
      gn.gain.value = Math.max(current - FADE_STEP, 0);
    } else {
      gn.gain.value = 0;
      clearFade();
      onDone();
    }
  }, FADE_INTERVAL_MS);
}

let pendingStart = false;

function removeGestureListeners(): void {
  document.removeEventListener('pointerdown', handleUserGesture);
  document.removeEventListener('click', handleUserGesture);
  document.removeEventListener('keydown', handleUserGesture);
}

function addGestureListeners(): void {
  document.addEventListener('pointerdown', handleUserGesture);
  document.addEventListener('click', handleUserGesture);
  document.addEventListener('keydown', handleUserGesture);
}

async function playMusic(): Promise<boolean> {
  const buf = await loadBuffer();
  if (!buf) return false;

  const ctx = getCtx();

  // Resume suspended AudioContext (autoplay policy)
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { return false; }
  }

  // Stop any existing source
  if (sourceNode) {
    try { sourceNode.stop(); } catch {}
    sourceNode = null;
  }

  gainNode = ctx.createGain();
  gainNode.gain.value = 0;
  gainNode.connect(ctx.destination);

  sourceNode = ctx.createBufferSource();
  sourceNode.buffer = buf;
  sourceNode.loop = true;
  sourceNode.connect(gainNode);
  sourceNode.start();

  fadeIn();
  return true;
}

async function handleUserGesture(): Promise<void> {
  if (!pendingStart) return;
  pendingStart = false;
  removeGestureListeners();
  await playMusic();
}

export async function startMenuMusic(): Promise<void> {
  if (isMuted()) return;
  if (sourceNode) return; // already playing

  // Start loading buffer immediately (non-blocking)
  loadBuffer();

  // Register gesture listeners before attempting play —
  // AudioContext.resume() may silently fail without user activation
  pendingStart = true;
  addGestureListeners();

  const played = await playMusic();
  if (played) {
    // Autoplay succeeded — cancel gesture fallback
    pendingStart = false;
    removeGestureListeners();
  }
  // If not played, gesture listeners remain active as fallback
}

export function stopMenuMusic(): void {
  pendingStart = false;
  removeGestureListeners();

  if (!sourceNode) return;

  const node = sourceNode;
  fadeOut(() => {
    try { node.stop(); } catch {}
    if (sourceNode === node) {
      sourceNode = null;
      gainNode = null;
    }
  });
}

/** Live-update menu music volume (0–1 scale) */
export function setMenuMusicVolume(v: number): void {
  volumeScale = v;
  if (gainNode && sourceNode) {
    gainNode.gain.value = targetVolume();
  }
}

export function setMenuMusicMuted(muted: boolean): void {
  if (muted) {
    clearFade();
    if (gainNode) gainNode.gain.value = 0;
    if (sourceNode) {
      try { sourceNode.stop(); } catch {}
      sourceNode = null;
      gainNode = null;
    }
  } else {
    startMenuMusic();
  }
}
