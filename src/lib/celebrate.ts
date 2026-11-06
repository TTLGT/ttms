/**
 * A short burst of confetti, for the two moments a load is worth celebrating:
 * Delivered and Completed, when the person looking at the load is the one who
 * moved it there.
 *
 * Plain canvas, no library: forty lines is cheaper than a dependency, and it
 * cleans up after itself (the canvas is removed when the burst ends). Skipped
 * entirely for anyone whose system asks for reduced motion.
 */
const COLORS = ['#1d4ed8', '#7c3aed', '#059669', '#d97706', '#0e7490', '#c8102e'];

export function celebrate(count = 120): void {
  if (typeof window === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  const ratio = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * ratio;
  canvas.height = h * ratio;
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100%', height: '100%', pointerEvents: 'none', zIndex: '60',
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  if (!ctx) { canvas.remove(); return; }
  ctx.scale(ratio, ratio);

  const bits = Array.from({ length: count }, () => ({
    x: w * (0.3 + Math.random() * 0.4),
    y: h * 0.3,
    vx: (Math.random() - 0.5) * 14,
    vy: -Math.random() * 12 - 4,
    r: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    bw: 6 + Math.random() * 6,
    bh: 4 + Math.random() * 4,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
  }));

  const FRAMES = 140;
  let frame = 0;
  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.35; b.vx *= 0.99; b.x += b.vx; b.y += b.vy; b.r += b.vr;
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(b.r);
      ctx.globalAlpha = Math.max(0, 1 - frame / FRAMES);
      ctx.fillStyle = b.color;
      ctx.fillRect(-b.bw / 2, -b.bh / 2, b.bw, b.bh);
      ctx.restore();
    }
    if (++frame < FRAMES) requestAnimationFrame(tick);
    else canvas.remove();
  };
  requestAnimationFrame(tick);
}
