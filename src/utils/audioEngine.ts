import { isMuted, setMuted as persistMute } from './storage';

let audioCtx: AudioContext | null = null;

function getCtx(): AudioContext {
  if (!audioCtx) {
    audioCtx = new AudioContext();
  }
  return audioCtx;
}

let muted = isMuted();

export function getMuted(): boolean {
  return muted;
}

export function toggleMute(): boolean {
  muted = !muted;
  persistMute(muted);
  return muted;
}

export function playKeystroke(): void {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const freqs = [800, 900, 1000];
  osc.frequency.value = freqs[Math.floor(Math.random() * freqs.length)];
  osc.type = 'square';

  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}

export function playError(): void {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.frequency.value = 200;
  osc.type = 'sawtooth';

  gain.gain.setValueAtTime(0.06, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.12);
}

export function playFanfare(): void {
  if (muted) return;
  const ctx = getCtx();
  const notes = [523.25, 659.25, 783.99];

  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.frequency.value = freq;
    osc.type = 'sine';

    const startTime = ctx.currentTime + i * 0.08;
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(0.08, startTime + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.8);

    osc.start(startTime);
    osc.stop(startTime + 0.8);
  });
}

export function playKeystrokeAtPitch(pitchMultiplier: number): void {
  if (muted) return;
  const ctx = getCtx();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);

  const freqs = [800, 900, 1000];
  osc.frequency.value = freqs[Math.floor(Math.random() * freqs.length)] * pitchMultiplier;
  osc.type = 'square';

  gain.gain.setValueAtTime(0.03, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);

  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + 0.05);
}
