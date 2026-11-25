import type { GameTheme } from '@/types/taskGame';

/**
 * Game mode's animated scenes (step 7 of the Planner redesign, 2026-11-25):
 * one per theme, a background that scrolls past and a vehicle that travels to
 * a stop for each of Today's 3 as it is finished — a truck down a night
 * highway, a wizard on a broom past the towers, a carriage on a road at
 * sunset, a dragonfly through a glade, a rocket past the planets, a galleon
 * at sea. Ported from the demo the office approved on 2026-11-24.
 *
 * Plain canvas drawing, no React and no library, so a frame costs nothing
 * but the drawing. `createScene()` owns one canvas: it sizes itself to the
 * box it is in, stops while the box is off screen or the tab is hidden, and
 * draws a single still frame for somebody who asked their computer for less
 * motion. Every colour is fixed — the scene is a dark picture in every app
 * theme, like the banner.
 *
 * Nothing here is data. What the scene shows (how many stops are reached,
 * whether the unlock is on) is handed in by GameScene.tsx, which reads it
 * from the game state the server sent.
 */

export interface SceneTheme {
  accent: string;
  /** CSS background behind the canvas while it first draws. */
  ground: string;
  /** The start and one stop per pick. Scene captions only, never a status. */
  stops: [string, string, string, string];
  /** The route chip, by how far the day has got. */
  idle: string;
  start: string;
  complete: string;
  /** What reaching level UNLOCK_LEVEL adds to the vehicle. */
  unlock: string;
}

export const SCENE_THEMES: Record<GameTheme, SceneTheme> = {
  freight: { accent: '#f59e0b', ground: 'linear-gradient(180deg,#040a1a,#1c3a7a)', stops: ['Dock', 'Dallas', 'Memphis', 'Atlanta'], idle: 'Pick today’s 3 to start the route', start: 'On the road', complete: 'Route complete', unlock: 'A reefer trailer for your truck' },
  wizarding: { accent: '#c4b5fd', ground: 'linear-gradient(180deg,#07031a,#36215f)', stops: ['Tower', 'Library', 'Observatory', 'Great Hall'], idle: 'Pick today’s 3 to begin the quest', start: 'Broom aloft', complete: 'Quest complete', unlock: 'A golden broom' },
  empire: { accent: '#e0b84f', ground: 'linear-gradient(180deg,#12030a,#8a2f17)', stops: ['Keep', 'Village', 'Fortress', 'Capital'], idle: 'Pick today’s 3 to start the campaign', start: 'On the march', complete: 'Campaign won', unlock: 'A royal purple carriage' },
  fairy: { accent: '#f9a8d4', ground: 'linear-gradient(180deg,#030d0a,#1b5141)', stops: ['Glade', 'Mushroom Ring', 'Moon Pond', 'Crystal Tree'], idle: 'Pick today’s 3 to wake the garden', start: 'Wings up', complete: 'Garden in bloom', unlock: 'Golden wings' },
  space: { accent: '#67e8f9', ground: 'linear-gradient(180deg,#02030b,#141040)', stops: ['Base', 'Moon', 'Mars', 'Saturn'], idle: 'Pick today’s 3 to set the course', start: 'Launched', complete: 'Orbit reached', unlock: 'A gold hull for your rocket' },
  pirate: { accent: '#e7c88a', ground: 'linear-gradient(180deg,#020c0e,#174a50)', stops: ['Port', 'Skull Isle', 'Coral Bay', 'Gold Cove'], idle: 'Pick today’s 3 to chart the voyage', start: 'Anchors up', complete: 'Voyage complete', unlock: 'Black sails for your ship' },
};

/** Where the four stops sit, as a share of the scene's width. */
export const STOP_X = [0.11, 0.38, 0.65, 0.89] as const;

export interface SceneState {
  theme: GameTheme;
  /** 0–3: how many of Today's 3 are done, which is the stop the vehicle heads for. */
  reached: number;
  unlocked: boolean;
}

export interface SceneController {
  set(state: SceneState): void;
  destroy(): void;
}

interface Particle {
  x: number; y: number; vx: number; vy: number; r: number; grow: number;
  life: number; max: number; a: number; c: string; glow?: boolean; world?: boolean;
}

/** Distance from the bottom of the scene to the ground line, in px. */
const GROUND_FROM_BOTTOM = 64;

export function createScene(box: HTMLElement, cv: HTMLCanvasElement): SceneController {
  const X = cv.getContext('2d');
  const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let W = 0, H = 0, G = 0, cam = 0, speed = 0, T = 0, last = 0;
  let vx: number | null = null;
  let running = false, visible = true, dead = false;
  const P: Particle[] = [];
  let S: SceneState = { theme: 'freight', reached: 0, unlocked: false };
  const acc = () => SCENE_THEMES[S.theme].accent;

  if (!X) return { set() {}, destroy() {} };

  /* ------------------------------------------------------------ helpers */
  const rgba = (h: string, a: number) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16 & 255},${n >> 8 & 255},${n & 255},${a})`; };
  const shade = (h: string, f: number) => {
    const n = parseInt(h.slice(1), 16);
    const c = [n >> 16 & 255, n >> 8 & 255, n & 255].map((v) => Math.max(0, Math.min(255, Math.round(f < 0 ? v * (1 + f) : v + (255 - v) * f))));
    return `rgb(${c.join(',')})`;
  };
  const vg = (y0: number, y1: number, st: [string, number][]) => { const g = X.createLinearGradient(0, y0, 0, y1); st.forEach(([c, o]) => g.addColorStop(o, c)); return g; };
  const glow = (x: number, y: number, r: number, c: string, a: number) => {
    const g = X.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, rgba(c, a)); g.addColorStop(1, rgba(c, 0));
    X.fillStyle = g; X.beginPath(); X.arc(x, y, r, 0, Math.PI * 2); X.fill();
  };
  const circ = (x: number, y: number, r: number, f: string | CanvasGradient) => { X.fillStyle = f; X.beginPath(); X.arc(x, y, Math.max(0, r), 0, Math.PI * 2); X.fill(); };
  const rr = (x: number, y: number, w: number, h: number, r: number, f: string | CanvasGradient) => {
    X.fillStyle = f; X.beginPath(); X.moveTo(x + r, y); X.arcTo(x + w, y, x + w, y + h, r); X.arcTo(x + w, y + h, x, y + h, r);
    X.arcTo(x, y + h, x, y, r); X.arcTo(x, y, x + w, y, r); X.closePath(); X.fill();
  };
  /** A repeatable "random" number for a given index: the same building every time it scrolls past. */
  const hr = (n: number) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  /** Something every `sp` px across the world, scrolling at `f` of the camera's speed. */
  const each = (sp: number, f: number, fn: (x: number, i: number) => void) => {
    const off = cam * f, i0 = Math.floor(off / sp) - 1, i1 = Math.ceil((off + W) / sp) + 1;
    for (let i = i0; i <= i1; i++) fn(i * sp - off, i);
  };
  const ridge = (f: number, base: number, amp: number, c: string, seed: number) => {
    X.fillStyle = c; X.beginPath(); X.moveTo(0, H);
    for (let x = 0; x <= W + 8; x += 8) {
      const w = x + cam * f;
      X.lineTo(x, base - (Math.sin(w * 0.004 + seed) * 0.5 + Math.sin(w * 0.011 + seed * 2) * 0.3 + Math.sin(w * 0.027 + seed * 3) * 0.2 + 1) * amp / 2);
    }
    X.lineTo(W, H); X.closePath(); X.fill();
  };
  const stars = (n: number, f: number, seed: number, maxY: number, col: string) => {
    for (let i = 0; i < n; i++) {
      const span = W + 20, x = ((hr(i + seed) * span - cam * f) % span + span) % span - 10, y = hr(i * 7.3 + seed) * maxY;
      const r = 0.5 + hr(i * 3.1 + seed) * 1.1, a = 0.3 + 0.5 * (0.5 + 0.5 * Math.sin(T * 1.5 + i * 1.7));
      if (speed > 140 && f > 0.08) { X.strokeStyle = rgba(col, a * 0.8); X.lineWidth = r; X.beginPath(); X.moveTo(x, y); X.lineTo(x + speed * f * 0.07, y); X.stroke(); }
      else circ(x, y, r, rgba(col, a));
    }
  };
  const wheel = (x: number, y: number, r: number, rot: number, tire = '#0b0f1a', rim = '#cbd5e1') => {
    circ(x, y, r, tire); circ(x, y, r * 0.62, rim); X.strokeStyle = 'rgba(51,65,85,.9)'; X.lineWidth = 1.4;
    for (let k = 0; k < 6; k++) { const a = rot + k * Math.PI / 3; X.beginPath(); X.moveTo(x, y); X.lineTo(x + Math.cos(a) * r * 0.6, y + Math.sin(a) * r * 0.6); X.stroke(); }
    circ(x, y, r * 0.2, '#e2e8f0');
  };
  const puff = (p: Particle) => { if (P.length < 160) P.push(p); };
  const particles = (dt: number) => {
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i]; p.life += dt;
      if (p.life >= p.max) { P.splice(i, 1); continue; }
      p.x += (p.vx - (p.world ? speed : 0)) * dt; p.y += p.vy * dt; p.r = Math.max(0.2, p.r + p.grow * dt);
      const a = p.a * (1 - p.life / p.max);
      if (p.glow) { glow(p.x, p.y, p.r * 4, p.c, a * 0.5); circ(p.x, p.y, p.r, rgba('#ffffff', a)); } else circ(p.x, p.y, p.r, rgba(p.c, a));
    }
  };
  const waveLine = (f: number, y: number, amp: number, a: number, lw = 1.5) => {
    X.strokeStyle = rgba('#e7f5f2', a); X.lineWidth = lw; X.beginPath();
    for (let x = 0; x <= W; x += 6) { const yy = y + Math.sin((x + cam * f) * 0.035 + T * 1.6) * amp; if (x) X.lineTo(x, yy); else X.moveTo(x, yy); }
    X.stroke();
  };

  /* -------------------------------------------------------- backgrounds */
  function bgFreight() {
    const A = acc();
    X!.fillStyle = vg(0, G, [['#040a1a', 0], ['#0b1a33', 0.5], ['#1c3a7a', 1]]); X!.fillRect(0, 0, W, G);
    stars(45, 0.01, 1, G * 0.6, '#ffffff'); glow(W * 0.84, 52, 70, '#fde68a', 0.16); circ(W * 0.84, 52, 15, '#fef3c7');
    ridge(0.04, G - 40, 70, '#10234a', 1);
    each(64, 0.16, (x, i) => {
      const bw = 24 + hr(i) * 30, bh = 26 + hr(i + 9) * 78;
      X!.fillStyle = i % 3 ? '#0b1a3a' : '#0d1f45'; X!.fillRect(x, G - bh, bw, bh);
      for (let wy = G - bh + 6; wy < G - 6; wy += 9) for (let wx = 4; wx < bw - 4; wx += 7) {
        const h2 = hr(i * 31 + wy * 7 + wx);
        if (h2 > 0.7) { X!.fillStyle = rgba(h2 > 0.93 ? '#bae6fd' : '#fbbf24', 0.35 + 0.35 * Math.max(0, Math.sin(T * 0.6 + h2 * 30))); X!.fillRect(x + wx, wy, 3, 4); }
      }
      if (hr(i + 40) > 0.8) circ(x + bw / 2, G - bh - 6, 1.6, rgba('#ef4444', 0.5 + 0.5 * Math.sin(T * 3 + i)));
    });
    X!.fillStyle = vg(G, H, [['#0d1730', 0], ['#070e20', 1]]); X!.fillRect(0, G, W, H - G);
    X!.fillStyle = '#2f4677'; X!.fillRect(0, G, W, 2); X!.fillStyle = '#1b2a4f'; X!.fillRect(0, H - 8, W, 2);
    const off = cam % 48; X!.fillStyle = A; for (let x = -off; x < W; x += 48) X!.fillRect(x, G + 28, 26, 3);
    each(280, 1, (x) => {
      X!.fillStyle = '#1a2a4c'; X!.fillRect(x, G - 96, 4, 98); X!.fillRect(x, G - 96, 26, 3); rr(x + 20, G - 94, 10, 4, 2, '#cbd5e1');
      glow(x + 25, G - 86, 46, '#fde68a', 0.2);
      X!.fillStyle = rgba('#fde68a', 0.06); X!.beginPath(); X!.moveTo(x + 21, G - 90); X!.lineTo(x + 4, G + 30); X!.lineTo(x + 52, G + 30); X!.lineTo(x + 30, G - 90); X!.fill();
    });
  }
  function bgSpace() {
    const A = acc();
    X!.fillStyle = vg(0, H, [['#02030b', 0], ['#070b1f', 0.55], ['#141040', 1]]); X!.fillRect(0, 0, W, H);
    glow(W * 0.22, 80, 170, '#7c3aed', 0.15); glow(W * 0.6, 170, 200, '#22d3ee', 0.07); glow(W * 0.45, 40, 120, '#db2777', 0.07);
    stars(80, 0.015, 1, H, '#ffffff'); stars(40, 0.08, 2, H, '#c7d2fe'); stars(22, 0.3, 3, H, '#ffffff');
    const px = W * 0.84, py = 80;
    X!.strokeStyle = rgba(A, 0.55); X!.lineWidth = 3; X!.beginPath(); X!.ellipse(px, py, 50, 11, -0.25, Math.PI, Math.PI * 2); X!.stroke();
    const pg = X!.createRadialGradient(px - 8, py - 8, 2, px, py, 26); pg.addColorStop(0, '#e9d5ff'); pg.addColorStop(0.5, '#8b5cf6'); pg.addColorStop(1, '#2e1065');
    X!.fillStyle = pg; X!.beginPath(); X!.arc(px, py, 26, 0, Math.PI * 2); X!.fill();
    X!.beginPath(); X!.ellipse(px, py, 50, 11, -0.25, 0, Math.PI); X!.stroke();
    each(300, 0.7, (x, i) => {
      if (hr(i) < 0.45) return;
      const ay = 30 + hr(i + 3) * (G - 20), r = 5 + hr(i + 5) * 10;
      X!.save(); X!.translate(x, ay); X!.rotate(T * 0.3 + i); X!.beginPath();
      for (let k = 0; k < 8; k++) { const a = k / 8 * Math.PI * 2, q = r * (0.72 + hr(i * 10 + k) * 0.4); X!.lineTo(Math.cos(a) * q, Math.sin(a) * q); }
      X!.closePath(); X!.fillStyle = '#342e52'; X!.fill(); X!.strokeStyle = '#5d5689'; X!.lineWidth = 1; X!.stroke();
      circ(-r * 0.3, -r * 0.2, r * 0.2, '#2a2545'); X!.restore();
    });
    const off = cam % 42; X!.fillStyle = rgba(A, 0.35); for (let x = -off; x < W; x += 42) X!.fillRect(x, H - 30, 18, 2);
  }
  function bgPirate() {
    X!.fillStyle = vg(0, G + 8, [['#020c0e', 0], ['#08262b', 0.55], ['#174a50', 1]]); X!.fillRect(0, 0, W, G + 8);
    stars(40, 0.01, 21, G * 0.6, '#fdf6e3'); glow(W * 0.78, 48, 80, '#f8edd0', 0.18); circ(W * 0.78, 48, 17, '#fbf3dc');
    each(480, 0.05, (x, i) => {
      if (hr(i) < 0.35) return;
      const s = 0.7 + hr(i + 1) * 0.6;
      X!.fillStyle = '#051c1e'; X!.beginPath(); X!.ellipse(x, G + 8, 64 * s, 18 * s, 0, Math.PI, 0); X!.fill();
      X!.strokeStyle = '#051c1e'; X!.lineWidth = 3; X!.beginPath(); X!.moveTo(x + 10 * s, G - 6 * s); X!.quadraticCurveTo(x + 14 * s, G - 26 * s, x + 20 * s, G - 44 * s); X!.stroke();
      for (let k = 0; k < 5; k++) {
        const a = -2.6 + k * 0.55; X!.lineWidth = 2.5; X!.beginPath(); X!.moveTo(x + 20 * s, G - 44 * s);
        X!.quadraticCurveTo(x + 20 * s + Math.cos(a) * 14 * s, G - 50 * s + Math.sin(a) * 6 * s, x + 20 * s + Math.cos(a) * 22 * s, G - 40 * s + Math.sin(a) * 4 * s + Math.sin(T * 1.4 + k) * 1.5); X!.stroke();
      }
    });
    X!.fillStyle = vg(G + 6, H, [['#0c3f45', 0], ['#03181b', 1]]); X!.fillRect(0, G + 6, W, H - G - 6);
    for (let k = 0; k < 9; k++) { const ww = 20 + Math.sin(T * 2 + k) * 9; X!.fillStyle = rgba('#fbf3dc', 0.24 - k * 0.022); X!.fillRect(W * 0.78 - ww / 2 + Math.sin(T * 1.3 + k) * 4, G + 12 + k * 5, ww, 2); }
    waveLine(0.25, G + 14, 2.5, 0.12); waveLine(0.5, G + 26, 3.5, 0.16);
  }
  function fgPirate() {
    X!.fillStyle = 'rgba(9,52,58,.94)'; X!.beginPath(); X!.moveTo(0, H);
    for (let x = 0; x <= W; x += 6) X!.lineTo(x, G + 22 + Math.sin((x + cam) * 0.04 + T * 1.8) * 4);
    X!.lineTo(W, H); X!.closePath(); X!.fill(); waveLine(1, G + 22, 4, 0.28, 2); waveLine(1.3, G + 40, 5, 0.14);
  }
  function bgWizard() {
    const A = acc();
    X!.fillStyle = vg(0, G + 20, [['#07031a', 0], ['#1a1033', 0.5], ['#36215f', 1]]); X!.fillRect(0, 0, W, H);
    stars(60, 0.01, 9, G * 0.8, '#ede9fe'); glow(W * 0.8, 48, 70, '#c4b5fd', 0.18); circ(W * 0.8, 48, 16, '#f5f3ff'); circ(W * 0.8 + 7, 43, 14, '#160d2e');
    each(560, 0.06, (x) => {
      const b = G + 12; X!.fillStyle = '#120a28'; X!.fillRect(x, b - 44, 96, 44);
      ([[0, 74, 14], [22, 108, 18], [50, 84, 14], [72, 64, 22]] as const).forEach(([tx, th, tw], j) => {
        X!.fillRect(x + tx, b - th, tw, th); X!.beginPath(); X!.moveTo(x + tx - 3, b - th); X!.lineTo(x + tx + tw / 2, b - th - 26); X!.lineTo(x + tx + tw + 3, b - th); X!.fill();
        glow(x + tx + tw / 2, b - th + 16, 10, A, 0.35 + 0.2 * Math.sin(T * 2 + j));
        X!.fillStyle = rgba('#e9d5ff', 0.75); X!.fillRect(x + tx + tw / 2 - 1.5, b - th + 12, 3, 6); X!.fillStyle = '#120a28';
      });
    });
    ridge(0.14, G + 20, 40, '#180e33', 4);
    each(130, 0.3, (x, i) => {
      if (hr(i) < 0.45) return;
      const cy = 34 + hr(i + 1) * (G - 70) + Math.sin(T * 1.4 + i) * 5;
      X!.fillStyle = '#f5f3ff'; X!.fillRect(x, cy, 3, 10); glow(x + 1.5, cy - 3, 12, '#fcd34d', 0.5 + 0.2 * Math.sin(T * 9 + i)); circ(x + 1.5, cy - 3, 1.6, '#fef3c7');
    });
    for (let k = 0; k < 3; k++) each(360, 0.12 + k * 0.06, (x) => { X!.fillStyle = rgba('#c4b5fd', 0.045); X!.beginPath(); X!.ellipse(x, G + 26 + k * 10, 160, 10, 0, 0, Math.PI * 2); X!.fill(); });
  }
  function bgEmpire() {
    const A = acc();
    X!.fillStyle = vg(0, G, [['#12030a', 0], ['#3a0b12', 0.45], ['#8a2f17', 0.85], ['#d2691e', 1]]); X!.fillRect(0, 0, W, G);
    stars(18, 0.01, 13, G * 0.3, '#fde68a'); glow(W * 0.68, G - 8, 170, '#f59e0b', 0.34); circ(W * 0.68, G - 8, 30, '#fbbf24');
    ridge(0.04, G - 26, 90, '#2b070c', 2);
    each(640, 0.09, (x) => {
      const b = G - 4; X!.fillStyle = '#1c0508'; X!.fillRect(x, b - 32, 128, 32);
      ([[0, 64], [54, 86], [112, 58]] as const).forEach(([tx, th], j) => {
        X!.fillRect(x + tx, b - th, 18, th); for (let k = 0; k < 3; k++) X!.fillRect(x + tx + k * 7, b - th - 5, 4, 5);
        X!.strokeStyle = '#1c0508'; X!.lineWidth = 1.5; X!.beginPath(); X!.moveTo(x + tx + 9, b - th - 5); X!.lineTo(x + tx + 9, b - th - 22); X!.stroke();
        X!.fillStyle = A; X!.beginPath(); X!.moveTo(x + tx + 9, b - th - 22);
        for (let q = 0; q <= 6; q++) X!.lineTo(x + tx + 9 + q * 2.4, b - th - 22 + Math.sin(T * 5 + q + j) * 1.2);
        for (let q = 6; q >= 0; q--) X!.lineTo(x + tx + 9 + q * 2.4, b - th - 15 + Math.sin(T * 5 + q + j) * 1.2);
        X!.fill(); X!.fillStyle = '#1c0508';
      });
      for (let k = 0; k < 16; k++) X!.fillRect(x + k * 8, b - 36, 4, 4);
    });
    ridge(0.18, G + 6, 26, '#200709', 6);
    X!.fillStyle = vg(G, H, [['#3d1b0c', 0], ['#1d0c05', 1]]); X!.fillRect(0, G, W, H - G);
    X!.strokeStyle = '#4f2510'; X!.lineWidth = 2; [G + 20, G + 42].forEach((y) => { X!.beginPath(); X!.moveTo(0, y); X!.lineTo(W, y); X!.stroke(); });
    each(46, 1, (x, i) => { if (hr(i) > 0.55) circ(x, G + 10 + hr(i + 2) * 38, 1.5 + hr(i + 4) * 2, '#5d3018'); });
    each(300, 1, (x, i) => {
      X!.fillStyle = '#2b1408'; X!.fillRect(x, G - 44, 4, 48); rr(x - 3, G - 48, 10, 5, 2, '#3b1f12');
      const fh = 12 + Math.sin(T * 14 + i) * 3; glow(x + 2, G - 54, 34, '#f97316', 0.35);
      X!.fillStyle = '#f97316'; X!.beginPath(); X!.moveTo(x - 3, G - 48); X!.quadraticCurveTo(x + 2 + Math.sin(T * 9 + i) * 2, G - 48 - fh * 1.6, x + 7, G - 48); X!.fill();
      X!.fillStyle = '#fde047'; X!.beginPath(); X!.moveTo(x, G - 48); X!.quadraticCurveTo(x + 2, G - 48 - fh, x + 4, G - 48); X!.fill();
    });
  }
  function bgFairy() {
    const A = acc();
    X!.fillStyle = vg(0, G + 18, [['#030d0a', 0], ['#0e2a24', 0.55], ['#1b5141', 1]]); X!.fillRect(0, 0, W, H);
    stars(28, 0.01, 5, G * 0.5, '#fce7f3'); glow(W * 0.18, 52, 100, '#f9a8d4', 0.12); circ(W * 0.18, 52, 13, '#fdf2f8');
    each(150, 0.07, (x, i) => {
      const h = 70 + hr(i) * 60, c = '#07201a';
      X!.fillStyle = c; X!.fillRect(x + 18, G + 20 - h, 7, h); circ(x + 21, G + 20 - h, 24 + hr(i + 2) * 12, c); circ(x + 6, G + 28 - h, 17, c); circ(x + 38, G + 26 - h, 19, c);
    });
    each(220, 0.3, (x, i) => {
      if (hr(i + 4) < 0.35) return;
      const s = 0.7 + hr(i) * 0.6, by = G + 22;
      X!.fillStyle = 'rgba(245,240,232,.9)'; X!.fillRect(x - 3 * s, by - 24 * s, 6 * s, 24 * s); glow(x, by - 26 * s, 34 * s, '#f472b6', 0.2 + 0.08 * Math.sin(T * 2 + i));
      X!.fillStyle = vg(by - 36 * s, by - 24 * s, [['#f472b6', 0], ['#9d174d', 1]]); X!.beginPath(); X!.ellipse(x, by - 24 * s, 17 * s, 12 * s, 0, Math.PI, 0); X!.fill();
      circ(x - 6 * s, by - 30 * s, 2 * s, '#fff'); circ(x + 5 * s, by - 32 * s, 1.6 * s, '#fff'); circ(x + 1 * s, by - 27 * s, 1.4 * s, '#fff');
    });
    X!.fillStyle = vg(G + 16, H, [['#0f3329', 0], ['#061712', 1]]); X!.fillRect(0, G + 16, W, H - G - 16);
    each(64, 1, (x, i) => {
      if (hr(i) < 0.5) return;
      const c = hr(i + 1) > 0.5 ? A : '#fde68a', fy = G + 30 + hr(i + 2) * 20;
      X!.strokeStyle = '#1f6b52'; X!.lineWidth = 1.2; X!.beginPath(); X!.moveTo(x, H); X!.lineTo(x, fy); X!.stroke(); glow(x, fy, 9, c, 0.4); circ(x, fy, 2.2, c);
    });
    for (let i = 0; i < 18; i++) {
      const span = W + 40, fx = ((hr(i) * span - cam * 0.45 + Math.sin(T * 0.7 + i) * 20) % span + span) % span - 20;
      const fy = 28 + hr(i + 30) * (G - 10) + Math.sin(T * 1.1 + i * 2) * 8, a = 0.35 + 0.65 * Math.abs(Math.sin(T * 1.8 + i));
      glow(fx, fy, 10, '#d9f99d', a * 0.55); circ(fx, fy, 1.5, rgba('#f7fee7', a));
    }
  }
  function fgFairy() {
    X!.strokeStyle = '#22785c'; X!.lineWidth = 1.4;
    each(8, 1.15, (x, i) => { const h = 7 + hr(i) * 12, sw = Math.sin(T * 2 + i * 0.3) * 2.2; X!.beginPath(); X!.moveTo(x, H); X!.quadraticCurveTo(x + sw, H - h / 2, x + sw * 1.6, H - h); X!.stroke(); });
  }

  /* ----------------------------------------------------------- vehicles */
  function vTruck(x: number, mov: boolean, dt: number) {
    const A = acc(), wy = G + 38, b = mov ? Math.sin(T * 34) * 0.8 : 0, pt = S.unlocked ? ['#eef5ff', '#9fbbe3'] : ['#f8fafc', '#a3adbd'];
    X!.save(); X!.translate(x - 78, b);
    const bg = X!.createLinearGradient(152, 0, 280, 0); bg.addColorStop(0, 'rgba(254,243,199,.34)'); bg.addColorStop(1, 'rgba(254,243,199,0)');
    X!.fillStyle = bg; X!.beginPath(); X!.moveTo(152, wy - 25); X!.lineTo(280, wy - 46); X!.lineTo(280, wy + 8); X!.lineTo(152, wy - 17); X!.fill();
    X!.fillStyle = 'rgba(0,0,0,.4)'; X!.beginPath(); X!.ellipse(78, wy + 9, 84, 5, 0, 0, Math.PI * 2); X!.fill();
    rr(0, wy - 54, 102, 42, 3, vg(wy - 54, wy - 12, [[pt[0], 0], [pt[1], 1]]));
    X!.strokeStyle = 'rgba(15,23,42,.10)'; X!.lineWidth = 1; for (let k = 8; k < 102; k += 8) { X!.beginPath(); X!.moveTo(k, wy - 52); X!.lineTo(k, wy - 14); X!.stroke(); }
    X!.fillStyle = 'rgba(255,255,255,.6)'; X!.fillRect(2, wy - 52, 98, 2); X!.fillStyle = A; X!.fillRect(0, wy - 21, 102, 4);
    X!.fillStyle = 'rgba(15,23,42,.55)'; X!.font = '700 11px Rajdhani, Arial Narrow, sans-serif'; X!.fillText('TOTAL TRANSPORT', 8, wy - 29);
    if (S.unlocked) {
      // The reefer unit on the trailer's nose, and a cold-blue stripe.
      rr(91, wy - 50, 13, 28, 2, '#64748b'); X!.strokeStyle = '#cbd5e1';
      for (let k = 0; k < 4; k++) { X!.beginPath(); X!.moveTo(93, wy - 45 + k * 5); X!.lineTo(102, wy - 45 + k * 5); X!.stroke(); }
      X!.fillStyle = '#38bdf8'; X!.fillRect(0, wy - 25, 88, 2);
    }
    X!.fillStyle = '#0f172a'; X!.fillRect(4, wy - 13, 146, 6);
    rr(115, wy - 70, 5, 26, 1, '#d1d5db'); X!.fillStyle = '#9ca3af'; X!.fillRect(114, wy - 71, 7, 3);
    X!.beginPath(); X!.moveTo(104, wy - 12); X!.lineTo(104, wy - 50); X!.quadraticCurveTo(104, wy - 54, 108, wy - 54); X!.lineTo(123, wy - 54); X!.lineTo(133, wy - 46); X!.lineTo(141, wy - 31);
    X!.quadraticCurveTo(151, wy - 30, 153, wy - 25); X!.lineTo(154, wy - 12); X!.closePath();
    X!.fillStyle = vg(wy - 54, wy - 12, [[shade(A, 0.3), 0], [A, 0.45], [shade(A, -0.4), 1]]); X!.fill();
    X!.beginPath(); X!.moveTo(124, wy - 50); X!.lineTo(131, wy - 45); X!.lineTo(138, wy - 32); X!.lineTo(124, wy - 32); X!.closePath();
    X!.fillStyle = vg(wy - 50, wy - 32, [['#1e3a6e', 0], ['#0b1a33', 1]]); X!.fill();
    X!.strokeStyle = 'rgba(255,255,255,.4)'; X!.lineWidth = 2; X!.beginPath(); X!.moveTo(128, wy - 47); X!.lineTo(133, wy - 36); X!.stroke();
    X!.strokeStyle = 'rgba(0,0,0,.25)'; X!.lineWidth = 1; X!.beginPath(); X!.moveTo(121, wy - 50); X!.lineTo(121, wy - 14); X!.stroke(); rr(113, wy - 30, 6, 2, 1, '#e5e7eb');
    rr(148, wy - 28, 5, 13, 1, '#e5e7eb'); X!.strokeStyle = '#94a3b8';
    for (let k = 0; k < 4; k++) { X!.beginPath(); X!.moveTo(148, wy - 26 + k * 3); X!.lineTo(153, wy - 26 + k * 3); X!.stroke(); }
    rr(139, wy - 14, 18, 5, 2, '#9ca3af'); circ(151, wy - 24, 2.4, '#fef9c3'); glow(152, wy - 24, 12, '#fef3c7', 0.55);
    X!.fillStyle = '#ef4444'; X!.fillRect(0, wy - 18, 2, 4); glow(1, wy - 16, 6, '#ef4444', 0.5);
    [16, 32, 115, 141].forEach((px) => wheel(px, wy - 1, 9.5, cam / 9.5));
    X!.restore();
    if (Math.random() < dt * (mov ? 30 : 5)) puff({ x: x - 78 + 117, y: wy - 72 + b, vx: -6, vy: -18, r: 2.5, grow: 7, life: 0, max: 1.7, a: mov ? 0.32 : 0.18, c: '#cbd5e1', world: true });
  }
  function vRocket(x: number, mov: boolean, dt: number) {
    const A = acc(), y = G + 2 + Math.sin(T * 2) * 5, pt = S.unlocked ? ['#fef3c7', '#b45309'] : ['#f8fafc', '#8a94a8'];
    X!.save(); X!.translate(x, y); X!.rotate(Math.sin(T * 1.3) * 0.03);
    const len = (mov ? 78 : 32) + Math.sin(T * 45) * 6, fg = X!.createLinearGradient(-60, 0, -60 - len, 0);
    fg.addColorStop(0, 'rgba(255,255,255,.95)'); fg.addColorStop(0.25, rgba(A, 0.85)); fg.addColorStop(1, rgba(A, 0));
    X!.fillStyle = fg; X!.beginPath(); X!.moveTo(-58, -9); X!.quadraticCurveTo(-58 - len * 0.6, -7, -58 - len, 0); X!.quadraticCurveTo(-58 - len * 0.6, 7, -58, 9); X!.fill(); glow(-62, 0, 30, A, 0.4);
    X!.fillStyle = shade(A, -0.2);
    X!.beginPath(); X!.moveTo(-44, -12); X!.lineTo(-64, -34); X!.lineTo(-52, -34); X!.lineTo(-24, -12); X!.fill();
    X!.beginPath(); X!.moveTo(-44, 12); X!.lineTo(-64, 34); X!.lineTo(-52, 34); X!.lineTo(-24, 12); X!.fill();
    rr(-63, -10, 11, 20, 2, '#334155'); X!.fillStyle = '#64748b'; X!.fillRect(-63, -10, 2, 20);
    X!.beginPath(); X!.moveTo(-54, -14); X!.lineTo(24, -14); X!.quadraticCurveTo(64, -12, 76, 0); X!.quadraticCurveTo(64, 12, 24, 14); X!.lineTo(-54, 14); X!.closePath();
    X!.fillStyle = vg(-14, 14, [[pt[0], 0], [pt[0], 0.3], [pt[1], 1]]); X!.fill();
    X!.fillStyle = A; X!.fillRect(-36, -14, 7, 28); X!.fillRect(-24, -14, 3, 28);
    X!.strokeStyle = 'rgba(255,255,255,.65)'; X!.lineWidth = 2; X!.beginPath(); X!.moveTo(-46, -9); X!.lineTo(30, -9); X!.stroke();
    X!.strokeStyle = 'rgba(15,23,42,.25)'; X!.lineWidth = 1; X!.beginPath(); X!.moveTo(48, -8); X!.lineTo(48, 8); X!.stroke();
    const wg = X!.createRadialGradient(30, -4, 1, 32, -1, 9); wg.addColorStop(0, '#ecfeff'); wg.addColorStop(0.4, '#67e8f9'); wg.addColorStop(1, '#155e75');
    X!.fillStyle = wg; X!.beginPath(); X!.arc(32, -1, 8, 0, Math.PI * 2); X!.fill(); X!.strokeStyle = '#e2e8f0'; X!.lineWidth = 2.5; X!.stroke();
    X!.restore();
    if (Math.random() < dt * (mov ? 70 : 16)) puff({ x: x - 66, y: y + (Math.random() - 0.5) * 8, vx: -60 - Math.random() * 60, vy: (Math.random() - 0.5) * 12, r: 1.7, grow: -0.7, life: 0, max: 0.9, a: 0.9, c: A, glow: true, world: true });
  }
  function vShip(x: number, mov: boolean, dt: number) {
    const A = acc(), bob = Math.sin(T * 1.6) * 3, pt = S.unlocked ? ['#3f4654', '#151a23'] : ['#fdf6e3', '#d6c39a'];
    X!.save(); X!.translate(x, G + 10 + bob); X!.rotate(Math.sin(T * 1.25) * 0.035);
    X!.fillStyle = '#3b2412'; X!.fillRect(-16, -104, 4, 94); X!.fillRect(20, -90, 3.5, 80);
    const bl = 7 + Math.sin(T * 2.2) * 1.5 + (mov ? 5 : 0);
    const sail = (mx: number, top: number, w: number, h: number) => {
      X!.beginPath(); X!.moveTo(mx - w / 2, top); X!.lineTo(mx + w / 2, top); X!.quadraticCurveTo(mx + w / 2 + bl, top + h / 2, mx + w / 2, top + h);
      X!.lineTo(mx - w / 2, top + h); X!.quadraticCurveTo(mx - w / 2 + bl, top + h / 2, mx - w / 2, top); X!.closePath();
      X!.fillStyle = vg(top, top + h, [[pt[0], 0], [pt[1], 1]]); X!.fill(); X!.strokeStyle = 'rgba(0,0,0,.2)'; X!.lineWidth = 1; X!.stroke();
      X!.strokeStyle = '#3b2412'; X!.lineWidth = 2; X!.beginPath(); X!.moveTo(mx - w / 2 - 3, top); X!.lineTo(mx + w / 2 + 3, top); X!.stroke();
    };
    sail(-14, -96, 42, 30); sail(-14, -61, 48, 34); sail(22, -82, 34, 26); sail(22, -51, 40, 30);
    if (S.unlocked) { circ(-14, -46, 5, '#e5e7eb'); X!.fillStyle = '#e5e7eb'; X!.fillRect(-17, -42, 6, 4); }
    X!.beginPath(); X!.moveTo(25, -88); X!.lineTo(80, -26); X!.lineTo(30, -24); X!.closePath(); X!.fillStyle = pt[0]; X!.globalAlpha = 0.92; X!.fill(); X!.globalAlpha = 1;
    X!.strokeStyle = '#3b2412'; X!.lineWidth = 3; X!.beginPath(); X!.moveTo(56, -20); X!.lineTo(90, -32); X!.stroke();
    X!.lineWidth = 0.8; X!.beginPath(); X!.moveTo(-14, -104); X!.lineTo(90, -32); X!.moveTo(-14, -104); X!.lineTo(-64, -28); X!.stroke();
    X!.fillStyle = A; X!.beginPath(); X!.moveTo(-12, -104);
    for (let k = 0; k <= 10; k++) X!.lineTo(-12 + k * 2.3, -104 + Math.sin(T * 6 + k * 0.7) * 1.7);
    for (let k = 10; k >= 0; k--) X!.lineTo(-12 + k * 2.3, -95 + Math.sin(T * 6 + k * 0.7) * 1.7);
    X!.fill();
    X!.beginPath(); X!.moveTo(-68, -28); X!.lineTo(-44, -23); X!.lineTo(40, -17); X!.lineTo(66, -24); X!.quadraticCurveTo(58, 4, 32, 10); X!.lineTo(-46, 10); X!.quadraticCurveTo(-62, 4, -68, -28); X!.closePath();
    X!.fillStyle = vg(-28, 10, [['#8f5e2e', 0], ['#5c3517', 0.55], ['#331b09', 1]]); X!.fill();
    X!.strokeStyle = 'rgba(0,0,0,.28)'; X!.lineWidth = 1;
    for (let k = 0; k < 3; k++) { X!.beginPath(); X!.moveTo(-62, -15 + k * 8); X!.quadraticCurveTo(0, -9 + k * 8, 54, -13 + k * 8); X!.stroke(); }
    X!.strokeStyle = A; X!.lineWidth = 2; X!.beginPath(); X!.moveTo(-68, -28); X!.lineTo(-44, -23); X!.lineTo(40, -17); X!.lineTo(66, -24); X!.stroke();
    for (let k = 0; k < 4; k++) rr(-38 + k * 20, -13, 7, 5, 1, '#1c0f06');
    glow(-64, -32, 18, '#fbbf24', 0.65); circ(-64, -32, 2.6, '#fde68a');
    X!.restore();
    if (mov && Math.random() < dt * 34) puff({ x: x - 62, y: G + 22 + bob, vx: -20, vy: -3, r: 2, grow: 6, life: 0, max: 1.2, a: 0.4, c: '#e7f5f2', world: true });
    if (Math.random() < dt * (mov ? 20 : 6)) puff({ x: x + 58 + Math.random() * 10, y: G + 20 + bob, vx: -10, vy: -8, r: 1.2, grow: 2, life: 0, max: 0.7, a: 0.5, c: '#ffffff', world: true });
  }
  /* The wizard on a broom. Everything that trails (cape, beard, hat tip,
     bristles) bends backwards and flutters harder while flying to a stop. */
  function vBroom(x: number, mov: boolean, dt: number) {
    const A = acc(), y = G - 10 + Math.sin(T * 1.9) * 6, fl = mov ? 1.7 : 1, gold = S.unlocked;
    const br = gold ? ['#fde68a', '#d97706'] : ['#d9a45b', '#7c4a1e'], handle = gold ? '#f59e0b' : '#6b3f1d', robe = '#2e1f6b', robe2 = '#241855';
    X!.save(); X!.translate(x, y); X!.rotate(-0.07 + Math.sin(T * 1.3) * 0.035);
    glow(-10, 12, 80, A, 0.13);
    X!.fillStyle = '#3b1d7a'; X!.beginPath(); X!.moveTo(0, -33);
    for (let k = 0; k <= 9; k++) X!.lineTo(-2 - k * 6.4 * fl, -33 + k * 2.6 + Math.sin(T * 9 - k * 0.8) * 2.4 * fl);
    for (let k = 9; k >= 0; k--) X!.lineTo(-6 - k * 5.6 * fl, -17 + k * 1.6 + Math.sin(T * 9 - k * 0.8 + 0.7) * 2.4 * fl);
    X!.closePath(); X!.fill();
    X!.fillStyle = vg(-10, 18, [[br[0], 0], [br[1], 1]]); X!.beginPath(); X!.moveTo(-44, 1); X!.lineTo(-86, -10 + Math.sin(T * 11) * 1.5);
    X!.quadraticCurveTo(-98, 4, -86, 18 + Math.sin(T * 11 + 1) * 1.5); X!.lineTo(-44, 10); X!.closePath(); X!.fill();
    X!.strokeStyle = rgba(gold ? '#92400e' : '#3b2410', 0.45); X!.lineWidth = 1;
    for (let k = 0; k < 9; k++) { X!.beginPath(); X!.moveTo(-44, 2 + k); X!.lineTo(-88 - hr(k) * 6, -8 + k * 3.2 + Math.sin(T * 12 + k) * 1.4 * fl); X!.stroke(); }
    rr(-49, -1, 7, 13, 2, A); X!.fillStyle = 'rgba(0,0,0,.2)'; X!.fillRect(-49, 5, 7, 1.5);
    X!.lineCap = 'round'; X!.strokeStyle = handle; X!.lineWidth = 4.5; X!.beginPath(); X!.moveTo(-44, 6); X!.lineTo(64, -5); X!.stroke();
    X!.strokeStyle = rgba('#ffffff', gold ? 0.55 : 0.22); X!.lineWidth = 1.2; X!.beginPath(); X!.moveTo(-36, 4); X!.lineTo(60, -6); X!.stroke();
    circ(65, -5, 3, gold ? '#fbbf24' : '#5a3417');
    X!.fillStyle = robe2; X!.beginPath(); X!.moveTo(-4, 2); X!.quadraticCurveTo(8, 4, 12, 13); X!.lineTo(7, 15); X!.quadraticCurveTo(2, 9, -8, 7); X!.closePath(); X!.fill();
    X!.fillStyle = robe; X!.beginPath(); X!.moveTo(-13, 3); X!.quadraticCurveTo(-13, -24, -2, -34); X!.quadraticCurveTo(9, -30, 11, -16); X!.lineTo(14, 3); X!.closePath(); X!.fill();
    X!.fillStyle = '#3b2a85'; X!.beginPath(); X!.moveTo(-6, -22); X!.quadraticCurveTo(2, -16, 6, -8); X!.lineTo(2, -6); X!.quadraticCurveTo(-2, -14, -7, -18); X!.fill();
    X!.fillStyle = robe; X!.beginPath(); X!.moveTo(-2, 1); X!.quadraticCurveTo(14, 3, 20, 14); X!.lineTo(14, 17); X!.quadraticCurveTo(8, 9, -6, 8); X!.closePath(); X!.fill();
    rr(15, 13, 10, 5, 2.5, '#1c1208');
    X!.strokeStyle = robe; X!.lineWidth = 5; X!.beginPath(); X!.moveTo(4, -25); X!.quadraticCurveTo(17, -15, 24, -3); X!.stroke(); circ(24, -2.5, 2.8, '#f0cfb2');
    circ(2, -38, 6.5, '#f0cfb2'); circ(8.4, -38, 1.7, '#e8b896'); circ(4.5, -40.5, 0.9, '#1e1b4b');
    X!.fillStyle = '#eef0f4'; X!.beginPath(); X!.moveTo(-3, -35); X!.quadraticCurveTo(-7, -26, -16 + Math.sin(T * 9) * 2 * fl, -21); X!.quadraticCurveTo(-3, -24, 8, -34); X!.closePath(); X!.fill();
    X!.fillStyle = '#4c1d95'; X!.beginPath(); X!.ellipse(1, -43, 13, 3, -0.12, 0, Math.PI * 2); X!.fill();
    X!.beginPath(); X!.moveTo(-9, -44); X!.quadraticCurveTo(-8, -58, -22 + Math.sin(T * 5) * 2.5 * fl, -70); X!.quadraticCurveTo(-4, -59, 9, -45); X!.closePath(); X!.fill();
    X!.strokeStyle = A; X!.lineWidth = 1.6; X!.beginPath(); X!.moveTo(-8, -47); X!.quadraticCurveTo(0, -49, 8, -47); X!.stroke();
    X!.fillStyle = A; X!.beginPath();
    for (let k = 0; k < 5; k++) {
      let a = -Math.PI / 2 + k * Math.PI * 2 / 5; X!.lineTo(-3 + Math.cos(a) * 3, -54 + Math.sin(a) * 3);
      a += Math.PI / 5; X!.lineTo(-3 + Math.cos(a) * 1.3, -54 + Math.sin(a) * 1.3);
    }
    X!.fill();
    X!.lineCap = 'butt'; X!.restore();
    if (Math.random() < dt * (mov ? 52 : 14)) puff({ x: x - 90, y: y + 4 + (Math.random() - 0.5) * 14, vx: -30 - Math.random() * 40, vy: (Math.random() - 0.5) * 20, r: 1.3, grow: -0.45, life: 0, max: 1.1, a: 1, c: A, glow: true, world: true });
    if (Math.random() < dt * (mov ? 16 : 4)) puff({ x: x - 80, y: y + 4, vx: -20, vy: (Math.random() - 0.5) * 14, r: 1.1, grow: -0.3, life: 0, max: 1.3, a: 0.9, c: '#fde68a', glow: true, world: true });
  }
  function horse(hx: number, wy: number, mov: boolean, A: string) {
    const c = '#160805', sw = mov ? 0.6 : 0.05, sp = mov ? 13 : 1.5; X!.lineCap = 'round';
    const leg = (px: number, ph: number, col: string) => {
      const a = Math.sin(T * sp + ph) * sw, bend = mov ? Math.max(0, Math.sin(T * sp + ph + 1.2)) * 0.9 : 0.05;
      const kx = hx + px + Math.sin(a) * 14, ky = wy - 30 + Math.cos(a) * 14;
      X!.strokeStyle = col; X!.lineWidth = 4.5; X!.beginPath(); X!.moveTo(hx + px, wy - 32); X!.lineTo(kx, ky); X!.lineTo(kx + Math.sin(a - bend) * 14, ky + Math.cos(a - bend) * 14); X!.stroke();
    };
    leg(-17, 0, '#0b0403'); leg(17, Math.PI, '#0b0403');
    X!.fillStyle = c; X!.beginPath(); X!.ellipse(hx, wy - 37, 28, 12, 0, 0, Math.PI * 2); X!.fill();
    X!.beginPath(); X!.moveTo(hx + 16, wy - 45); X!.quadraticCurveTo(hx + 26, wy - 62, hx + 33, wy - 68); X!.lineTo(hx + 42, wy - 63); X!.quadraticCurveTo(hx + 33, wy - 50, hx + 27, wy - 32); X!.closePath(); X!.fill();
    X!.beginPath(); X!.moveTo(hx + 31, wy - 70); X!.quadraticCurveTo(hx + 46, wy - 64, hx + 55, wy - 53); X!.quadraticCurveTo(hx + 53, wy - 48, hx + 46, wy - 50); X!.quadraticCurveTo(hx + 39, wy - 56, hx + 32, wy - 59); X!.closePath(); X!.fill();
    X!.beginPath(); X!.moveTo(hx + 32, wy - 69); X!.lineTo(hx + 31, wy - 78); X!.lineTo(hx + 37, wy - 69); X!.fill();
    X!.strokeStyle = '#3a1a0e'; X!.lineWidth = 3.5; X!.beginPath(); X!.moveTo(hx + 32, wy - 68); X!.quadraticCurveTo(hx + 20, wy - 60 + Math.sin(T * 8) * 1.5, hx + 15, wy - 44); X!.stroke();
    X!.strokeStyle = c; X!.lineWidth = 5; X!.beginPath(); X!.moveTo(hx - 26, wy - 41); X!.quadraticCurveTo(hx - 42, wy - 36 + Math.sin(T * 6) * 3, hx - 40, wy - 17); X!.stroke();
    leg(-11, Math.PI, c); leg(23, 0, c);
    X!.strokeStyle = A; X!.lineWidth = 1.6; X!.beginPath(); X!.moveTo(hx - 4, wy - 48); X!.lineTo(hx + 6, wy - 26); X!.stroke();
    X!.beginPath(); X!.moveTo(hx + 44, wy - 58); X!.lineTo(hx + 2, wy - 40); X!.stroke(); circ(hx + 44, wy - 61, 1.3, A); X!.lineCap = 'butt';
  }
  function vCarriage(x: number, mov: boolean, dt: number) {
    const A = acc(), wy = G + 40, body = S.unlocked ? ['#7c3aed', '#3b0764'] : ['#a11d3c', '#4c0519'];
    X!.save(); X!.translate(x - 26, mov ? Math.sin(T * 20) * 0.8 : 0);
    X!.fillStyle = 'rgba(0,0,0,.4)'; X!.beginPath(); X!.ellipse(20, wy + 1, 100, 5, 0, 0, Math.PI * 2); X!.fill();
    X!.strokeStyle = '#5b3a1e'; X!.lineWidth = 3; X!.beginPath(); X!.moveTo(0, wy - 30); X!.lineTo(52, wy - 36); X!.stroke();
    rr(-74, wy - 66, 76, 40, 8, vg(wy - 66, wy - 26, [[body[0], 0], [body[1], 1]]));
    X!.fillStyle = shade(body[1], -0.2); X!.beginPath(); X!.moveTo(-78, wy - 64); X!.quadraticCurveTo(-36, wy - 84, 6, wy - 64); X!.closePath(); X!.fill();
    X!.strokeStyle = A; X!.lineWidth = 2; X!.beginPath(); X!.moveTo(-78, wy - 64); X!.quadraticCurveTo(-36, wy - 84, 6, wy - 64); X!.stroke(); X!.lineWidth = 1.5; X!.strokeRect(-70, wy - 60, 68, 30);
    rr(-30, wy - 58, 20, 17, 3, '#fbbf24'); glow(-20, wy - 50, 30, '#fbbf24', 0.35); X!.fillStyle = 'rgba(0,0,0,.25)'; X!.fillRect(-21, wy - 58, 2, 17);
    X!.fillStyle = A; X!.beginPath(); X!.moveTo(-60, wy - 40); X!.lineTo(-60, wy - 50); X!.lineTo(-55, wy - 45); X!.lineTo(-50, wy - 53); X!.lineTo(-45, wy - 45); X!.lineTo(-40, wy - 50); X!.lineTo(-40, wy - 40); X!.closePath(); X!.fill();
    circ(-36, wy - 77, 2.5, A); X!.strokeStyle = '#d6d3d1'; X!.lineWidth = 1.5; X!.beginPath(); X!.moveTo(-36, wy - 75); X!.lineTo(-36, wy - 100); X!.stroke();
    X!.fillStyle = A; X!.beginPath(); X!.moveTo(-36, wy - 100);
    for (let k = 0; k <= 8; k++) X!.lineTo(-36 - k * 3.2, wy - 100 + k * 0.6 + Math.sin(T * 7 + k * 0.8) * 1.6);
    for (let k = 8; k >= 0; k--) X!.lineTo(-36 - k * 3.2, wy - 92 - k * 0.4 + Math.sin(T * 7 + k * 0.8) * 1.6);
    X!.fill();
    wheel(-58, wy - 13, 13, cam / 13, '#2b1408', '#b45309'); wheel(-10, wy - 13, 13, cam / 13, '#2b1408', '#b45309');
    horse(78, wy, mov, A);
    X!.restore();
    if (mov && Math.random() < dt * 26) puff({ x: x - 90, y: wy - 4, vx: -10, vy: -10, r: 2.5, grow: 9, life: 0, max: 1.2, a: 0.28, c: '#c2894f', world: true });
  }
  function vDragonfly(x: number, mov: boolean, dt: number) {
    const A = acc(), y = G - 14 + Math.sin(T * 2.4) * 7, wc = S.unlocked ? '253,224,71' : '236,253,245', fl = Math.abs(Math.sin(T * (mov ? 48 : 32)));
    X!.save(); X!.translate(x, y); X!.rotate(Math.sin(T * 1.7) * 0.05); glow(0, 0, 60, A, 0.12);
    const wing = (ang: number, len: number, ox: number, al: number) => {
      X!.save(); X!.translate(ox, -4); X!.rotate(ang); X!.scale(1, 0.22 + fl * 0.78);
      X!.beginPath(); X!.ellipse(len / 2, 0, len / 2, 7, 0, 0, Math.PI * 2); X!.fillStyle = `rgba(${wc},${al})`; X!.fill();
      X!.strokeStyle = `rgba(${wc},.7)`; X!.lineWidth = 1; X!.stroke();
      X!.beginPath(); X!.moveTo(2, 0); X!.lineTo(len - 2, 0); X!.moveTo(len * 0.3, 0); X!.lineTo(len * 0.5, -4); X!.moveTo(len * 0.55, 0); X!.lineTo(len * 0.75, 3); X!.stroke();
      X!.restore();
    };
    wing(-2.0, 48, -3, 0.26); wing(-1.75, 44, 2, 0.26);
    for (let k = 10; k >= 0; k--) { const px = -12 - k * 6, r = 3.6 - k * 0.17; circ(px, Math.sin(T * 3 + k * 0.4) * 0.7, r, k % 2 ? '#0d9488' : (k < 5 ? '#2dd4bf' : A)); }
    X!.fillStyle = vg(-6, 6, [['#14b8a6', 0], ['#0f766e', 1]]); X!.beginPath(); X!.ellipse(0, 0, 11, 7, 0, 0, Math.PI * 2); X!.fill();
    circ(13, -1, 5.5, '#134e4a'); circ(15, -3, 4, '#a7f3d0'); circ(16, -4.5, 1.4, '#ffffff');
    X!.strokeStyle = '#0f3d38'; X!.lineWidth = 1; for (let k = 0; k < 3; k++) { X!.beginPath(); X!.moveTo(-3 + k * 4, 5); X!.lineTo(-6 + k * 4, 11); X!.stroke(); }
    wing(-1.45, 46, 4, 0.36); wing(-1.2, 40, 8, 0.36);
    X!.restore();
    if (Math.random() < dt * (mov ? 44 : 12)) puff({ x: x - 78, y: y + (Math.random() - 0.5) * 6, vx: -30 - Math.random() * 30, vy: (Math.random() - 0.5) * 16, r: 1.3, grow: -0.4, life: 0, max: 1.1, a: 1, c: A, glow: true, world: true });
  }

  const DRAW: Record<GameTheme, { bg: () => void; fg?: () => void; veh: (x: number, mov: boolean, dt: number) => void }> = {
    freight: { bg: bgFreight, veh: vTruck },
    wizarding: { bg: bgWizard, veh: vBroom },
    empire: { bg: bgEmpire, veh: vCarriage },
    fairy: { bg: bgFairy, fg: fgFairy, veh: vDragonfly },
    space: { bg: bgSpace, veh: vRocket },
    pirate: { bg: bgPirate, fg: fgPirate, veh: vShip },
  };

  /* --------------------------------------------------------------- loop */
  const size = () => {
    const r = box.getBoundingClientRect();
    if (!r.width) return;
    const d = Math.min(2, window.devicePixelRatio || 1);
    W = r.width; H = r.height; G = H - GROUND_FROM_BOTTOM;
    cv.width = Math.round(W * d); cv.height = Math.round(H * d);
    X.setTransform(d, 0, 0, d, 0, 0);
  };
  const target = () => STOP_X[Math.max(0, Math.min(3, S.reached))] * W;
  const drawAll = (mov: boolean, dt: number) => {
    if (!W || vx === null) return;
    X.clearRect(0, 0, W, H);
    const d = DRAW[S.theme];
    d.bg(); particles(dt); d.veh(vx, mov, dt); d.fg?.();
  };
  const frame = (now: number) => {
    if (dead || !visible || reduced) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now; T += dt;
    const tg = target(); if (vx === null) vx = tg;
    const dist = tg - vx; vx += dist * Math.min(1, dt * 1.3);
    const mov = Math.abs(dist) > 3;
    // Cruising when parked, at speed while travelling to a stop.
    speed += ((mov ? 360 : 26) - speed) * Math.min(1, dt * 2.5); cam += speed * dt;
    drawAll(mov, dt);
    requestAnimationFrame(frame);
  };
  const start = () => {
    if (dead) return;
    if (reduced) { vx = target(); T = 1.3; drawAll(false, 0); return; }
    if (running || !visible) return;
    running = true; last = performance.now(); requestAnimationFrame(frame);
  };

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => { size(); vx = target(); if (reduced) start(); }) : null;
  ro?.observe(box);
  const io = typeof IntersectionObserver !== 'undefined'
    ? new IntersectionObserver((es) => { visible = es[0]?.isIntersecting ?? true; if (visible) start(); })
    : null;
  io?.observe(box);
  // A hidden tab draws nothing: requestAnimationFrame already pauses, and this
  // makes sure the loop restarts when it comes back.
  const onVis = () => { visible = document.visibilityState === 'visible'; if (visible) start(); };
  document.addEventListener('visibilitychange', onVis);
  size();

  return {
    set(next) {
      const themeChanged = next.theme !== S.theme;
      S = next;
      if (themeChanged) P.length = 0;
      if (vx === null && W) vx = target();
      start();
    },
    destroy() {
      dead = true;
      ro?.disconnect(); io?.disconnect();
      document.removeEventListener('visibilitychange', onVis);
    },
  };
}
