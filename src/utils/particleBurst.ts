interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
}

const COLORS = ['#00f0ff', '#ff0080', '#00ff88', '#ffaa00'];
const PARTICLE_COUNT = 35;
const DURATION = 800;

export function createBurstOverlay(): { start: () => void; cleanup: () => void } {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:9998;pointer-events:none;';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const ctx = canvas.getContext('2d')!;
  let animId: number;
  let startTime: number;

  const particles: Particle[] = [];
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 6;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 4,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      alpha: 1,
    });
  }

  function frame(now: number) {
    const elapsed = now - startTime;
    const progress = elapsed / DURATION;

    if (progress >= 1) {
      cleanup();
      return;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.1;
      p.alpha = 1 - progress;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = p.alpha;
      ctx.fill();
    });

    ctx.globalAlpha = 1;
    animId = requestAnimationFrame(frame);
  }

  function start() {
    document.body.appendChild(canvas);
    startTime = performance.now();
    animId = requestAnimationFrame(frame);
  }

  function cleanup() {
    cancelAnimationFrame(animId);
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
  }

  return { start, cleanup };
}
