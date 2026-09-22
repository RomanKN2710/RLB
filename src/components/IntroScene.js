'use client';
import { useEffect, useRef } from 'react';

/* Intro-Szene auf Canvas: minimalistische Strichfigur mit Skelett (Becken, Rumpf, Kopf, Arme, Beine per inverser Kinematik),
   Ball mit Schwerkraft und Kontakten, Tor mit Netz, das beim Einschlag schwingt. Choreografie: Anlauf, zwei Übersteiger,
   Elastico, Jonglieren, Lupfer, Volley in den Winkel, Jubel. Alles als Funktion der Zeit, damit es auf jedem Gerät gleich läuft. */
export const SCENE_MS = 6700;
const W = 1400, H = 1000, GROUND = 860, R = 30;                      // Ballradius
const THIGH = 112, SHIN = 108, TORSO = 132, UARM = 78, FARM = 72, HEAD = 27;
const G = 2200;                                                      // px/s²
const rad = d => d * Math.PI / 180;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = s => s < .5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
const easeOut = s => 1 - Math.pow(1 - s, 3);

/** Wert einer Spur zur Zeit t: Wegpunkte [t, wert…], dazwischen weich interpoliert. */
function track(pts, t) {
  if (t <= pts[0][0]) return pts[0].slice(1);
  for (let i = 1; i < pts.length; i++) if (t <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; const s = ease((t - a[0]) / (b[0] - a[0])); return a.slice(1).map((v, k) => v + (b[k + 1] - v) * s); }
  return pts[pts.length - 1].slice(1);
}

/* ---------- Ball: vorab simuliert (Kontakte zu festen Zeiten), damit Fuss und Ball exakt zusammenpassen ---------- */
const PX0 = 520;                                                     // Standposition Becken x nach dem Anlauf
const B_REST = 630, B_REST2 = 550;
const TOUCHES = [[2750, 0, -1200], [3800, 40, -1000], [4700, 100, -1000]];   // [t, vx, vy] Jonglier-Kontakte
const VOLLEY_T = 5450, HIT_T = 5830, TARGET = [1250, 330];
function pelvisX(t) { if (t < 1100) return -220 + (380 + 220) * t / 1100; if (t < 1500) return 380 + 140 * easeOut((t - 1100) / 400); return PX0; }
function simulateBall() {
  const dt = 1 / 1000; const out = new Float32Array(SCENE_MS * 3); let x = 0, y = GROUND - R, vx = 0, vy = 0, spin = 0; let ti = 0;
  for (let ms = 0; ms < SCENE_MS; ms++) {
    if (ms < 1500) { x = pelvisX(ms) + 95 + 18 * Math.sin(ms / 1000 * 2 * Math.PI * 2.4); y = GROUND - R; spin += (x - (out[(ms - 1) * 3] || x)) / R; }
    else if (ms < 2280) { x = B_REST; y = GROUND - R; }
    else if (ms < 2400) { x = B_REST + 70 * easeOut((ms - 2280) / 120); y = GROUND - R; spin += 0.02; }
    else if (ms < 2440) { x = B_REST + 70; y = GROUND - R; }
    else if (ms < 2560) { x = B_REST + 70 - 150 * easeOut((ms - 2440) / 120); y = GROUND - R; spin -= 0.035; }
    else if (ms < TOUCHES[0][0]) { x = B_REST2; y = GROUND - R; }
    else if (ms < VOLLEY_T) {
      if (ti < TOUCHES.length && ms === TOUCHES[ti][0]) { vx = TOUCHES[ti][1]; vy = TOUCHES[ti][2]; ti++; }
      vy += G * dt; x += vx * dt; y += vy * dt; if (y > GROUND - R) { y = GROUND - R; vy = -vy * .3; } spin += vx * dt / R;
    }
    else if (ms < HIT_T) { const s = (ms - VOLLEY_T) / (HIT_T - VOLLEY_T); const x0 = out[(VOLLEY_T - 1) * 3], y0 = out[(VOLLEY_T - 1) * 3 + 1]; x = x0 + (TARGET[0] - x0) * s; y = y0 + (TARGET[1] - y0) * s - 60 * Math.sin(Math.PI * s); spin += 0.09; }
    else { const s = Math.min(1, (ms - HIT_T) / 700); x = TARGET[0] + 40 * easeOut(s); y = TARGET[1] + (GROUND - R - TARGET[1]) * s * s; spin += 0.01; }
    out[ms * 3] = x; out[ms * 3 + 1] = y; out[ms * 3 + 2] = spin;
  }
  return out;
}
const ball = (arr, t) => { const i = clamp(Math.floor(t), 0, SCENE_MS - 1) * 3; return [arr[i], arr[i + 1], arr[i + 2]]; };

/* ---------- Figur ---------- */
/** Zwei-Knochen-IK: Hüfte H, Fuss F → Knie (nach vorne gebeugt, Figur blickt nach rechts). */
function knee(hx, hy, fx, fy, l1, l2, dirSign = 1) {
  let dx = fx - hx, dy = fy - hy, d = Math.hypot(dx, dy); const max = l1 + l2 - 0.5; if (d > max) { dx *= max / d; dy *= max / d; d = max; }
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1)); const base = Math.atan2(dy, dx);
  const ang = base - dirSign * a; return [hx, hy, hx + Math.cos(ang) * l1, hy + Math.sin(ang) * l1, hx + dx, hy + dy];
}
function pose(t, B) {
  const [bx, by] = B; const run = t < 1500; const blend = clamp((t - 1250) / 250, 0, 1);       // Übergang Laufen → Stehen
  const px = pelvisX(t);
  // Lauf: Füsse auf Ellipsen, Becken wippt, Arme gegenläufig
  const w = 2 * Math.PI * 2.4; const ph = t / 1000 * w; const S = 62 * (1 - blend), L = 48 * (1 - blend);
  const footRun = p => [px - S * Math.cos(p), GROUND - L * Math.max(0, Math.sin(p))];
  let lf = footRun(ph + Math.PI), rf = footRun(ph); let py = GROUND - 212 + 8 * Math.abs(Math.sin(ph)) * (1 - blend);
  let torso = 14 * (1 - blend) + 6, head = 0;
  let la = [-40 * Math.sin(ph) * (1 - blend), 70], ra = [40 * Math.sin(ph) * (1 - blend), 70];     // [Oberarm-Winkel von vertikal, Ellbogenbeuge]
  if (!run || blend > 0) {
    // Stehen: linker Fuss Standbein, rechter Fuss spielt (Spuren); Becken/Rumpf reagieren
    const L0 = [px - 48, GROUND], R0 = [px + 44, GROUND];
    const rTrack = [[1500, ...R0], [1560, bx - 70, GROUND - 24], [1680, bx, GROUND - 95], [1790, bx + 66, GROUND - 26], [1870, ...R0],
      [1920, bx - 70, GROUND - 24], [2040, bx, GROUND - 95], [2150, bx + 66, GROUND - 26], [2230, ...R0],
      [2280, bx - R - 8, GROUND - 6], [2400, bx - R - 8, GROUND - 6], [2440, bx + R + 8, GROUND - 22], [2560, bx + R + 8, GROUND - 6], [2640, px + 40, GROUND],
      [2700, bx - 10, GROUND - 4], [2750, bx, by + R - 4], [2830, bx + 20, GROUND - 60], [2950, px + 44, GROUND],
      [3700, px + 44, GROUND], [3800, bx, by + R - 6], [3880, bx + 10, by - 40], [4000, px + 44, GROUND],
      [4600, px + 44, GROUND], [4700, bx, by + R - 6], [4790, bx + 15, by - 60], [4950, px + 44, GROUND],
      [5250, px + 44, GROUND], [5330, px - 95, GROUND - 70], [VOLLEY_T, bx - 4, by + 6], [5540, px + 190, by - 90], [5700, px + 120, GROUND - 40], [5850, px + 44, GROUND], [6700, px + 44, GROUND]];
    const lTrack = [[1500, ...L0], [5250, ...L0], [5330, px - 40, GROUND], [VOLLEY_T, px - 30, GROUND - 20], [5540, px - 20, GROUND - 60], [5700, px - 40, GROUND], [6000, px - 40, GROUND], [6100, px - 40, GROUND - 40], [6300, px - 40, GROUND], [6700, px - 40, GROUND]];
    const pyTrack = [[1500, GROUND - 205], [1680, GROUND - 212], [1870, GROUND - 205], [2040, GROUND - 212], [2230, GROUND - 205], [2750, GROUND - 200], [3800, GROUND - 202], [4700, GROUND - 200],
      [5330, GROUND - 205], [VOLLEY_T, GROUND - 225], [5540, GROUND - 240], [5700, GROUND - 205], [6000, GROUND - 205], [6100, GROUND - 250], [6300, GROUND - 205], [6700, GROUND - 205]];
    const pxTrack = [[1500, 0], [1680, 10], [1870, 0], [2040, 10], [2230, 0], [2280, -8], [2560, 6], [2640, 0], [5330, -20], [VOLLEY_T, 10], [5540, 30], [5700, 10], [5850, 0]];
    const torsoTrack = [[1500, 6], [1680, 14], [2230, 8], [2280, 12], [2560, 10], [2750, 4], [2830, -6], [3800, 2], [3880, -6], [4700, 2], [4790, -8], [5250, 0], [5330, -12], [VOLLEY_T, -22], [5540, -30], [5700, -6], [5850, 0], [6000, -4], [6100, -10], [6300, 0]];
    const headTrack = [[1500, 0], [2750, 8], [2900, -12], [3800, 8], [3900, -12], [4700, 8], [4800, -14], [5330, -6], [VOLLEY_T, -10], [5700, 0], [6000, -8]];
    const laTrack = [[1500, -25, 60], [1680, -55, 40], [1870, -25, 60], [2040, -55, 40], [2230, -30, 55], [2560, -45, 50], [2750, -35, 70], [2830, -60, 60], [3800, -35, 70], [3880, -60, 60], [4700, -35, 70], [4790, -65, 60],
      [5330, -70, 50], [VOLLEY_T, -95, 30], [5540, -110, 20], [5700, -50, 50], [5850, -30, 60], [6000, -150, 20], [6100, -165, 10], [6300, -150, 25], [6700, -150, 25]];
    const raTrack = [[1500, 30, 60], [1680, 60, 40], [1870, 30, 60], [2040, 60, 40], [2230, 35, 55], [2560, 50, 50], [2750, 40, 70], [2830, 70, 60], [3800, 40, 70], [3880, 70, 60], [4700, 40, 70], [4790, 75, 60],
      [5330, 60, 50], [VOLLEY_T, 40, 60], [5540, 20, 70], [5700, 40, 50], [5850, 30, 60], [6000, 150, 20], [6100, 165, 10], [6300, 150, 25], [6700, 150, 25]];
    const m = blend;
    const rfS = track(rTrack, t), lfS = track(lTrack, t), pyS = track(pyTrack, t)[0], pxS = track(pxTrack, t)[0], toS = track(torsoTrack, t)[0], laS = track(laTrack, t), raS = track(raTrack, t);
    rf = [rf[0] + (rfS[0] - rf[0]) * m, rf[1] + (rfS[1] - rf[1]) * m]; lf = [lf[0] + (lfS[0] - lf[0]) * m, lf[1] + (lfS[1] - lf[1]) * m];
    py = py + (pyS - py) * m; torso = torso + (toS - torso) * m; la = [la[0] + (laS[0] - la[0]) * m, la[1] + (laS[1] - la[1]) * m]; ra = [ra[0] + (raS[0] - ra[0]) * m, ra[1] + (raS[1] - ra[1]) * m];
    head = track(headTrack, t)[0] * m;
    return build(px + pxS * m, py, torso, head, lf, rf, la, ra);
  }
  return build(px, py, torso, head, lf, rf, la, ra);
}
/** Gelenkpunkte aus Becken, Rumpfneigung (° nach hinten), Fusszielen und Armwinkeln. */
function build(px, py, torso, head, lf, rf, la, ra) {
  const tA = rad(-90 - torso); const nx = px + Math.cos(tA) * TORSO, ny = py + Math.sin(tA) * TORSO;   // Hals
  const hA = rad(-90 - torso - head); const hx = nx + Math.cos(hA) * (HEAD + 9), hy = ny + Math.sin(hA) * (HEAD + 9);
  const sx = nx - Math.cos(tA) * 14, sy = ny - Math.sin(tA) * 14;                                       // Schulter
  const arm = ([u, bend]) => { const a1 = rad(90 - torso + u); const ex = sx + Math.cos(a1) * UARM, ey = sy + Math.sin(a1) * UARM; const a2 = a1 - rad(bend); return [sx, sy, ex, ey, ex + Math.cos(a2) * FARM, ey + Math.sin(a2) * FARM]; };
  const hipL = [px - 6, py], hipR = [px + 6, py];
  return { px, py, nx, ny, hx, hy, torso, larm: arm(la), rarm: arm(ra), lleg: knee(hipL[0], hipL[1], lf[0], lf[1], THIGH, SHIN), rleg: knee(hipR[0], hipR[1], rf[0], rf[1], THIGH, SHIN), hipL, hipR };
}

/* ---------- Zeichnen ---------- */
function drawScene(ctx, t, B, dim) {
  const [bx, by, spin] = ball(B, t); const { dpr, scale, bw, bh } = dim;
  ctx.save(); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.fillStyle = '#D20515'; ctx.fillRect(0, 0, bw, bh);
  // Kamera: füllt den Bildschirm (cover) und folgt der Mitte zwischen Spieler und Ball; Boden bei ~86 % der Höhe
  const visW = bw / scale, visH = bh / scale; const P0 = pose(t, [bx, by]);
  const cx = clamp((P0.px + bx) / 2 + 80, visW / 2, W - visW / 2), cy = GROUND - visH * 0.36;
  ctx.translate(bw / 2 - cx * scale, bh / 2 - cy * scale); ctx.scale(scale, scale);
  // Boden
  ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-50, GROUND + 2); ctx.lineTo(W + 50, GROUND + 2); ctx.stroke();
  // Tor mit Netz (Wellen nach dem Einschlag)
  const hit = t - HIT_T; const wave = hit > 0 ? Math.exp(-hit / 260) * Math.cos(hit / 1000 * 2 * Math.PI * 7) * 34 : 0;
  const disp = (x, y) => { const d = Math.hypot(x - TARGET[0], y - TARGET[1]); const f = Math.exp(-(d * d) / (2 * 120 * 120)); return [x + wave * f, y + wave * .4 * f]; };
  ctx.strokeStyle = 'rgba(255,255,255,.75)'; ctx.lineWidth = 2.2; ctx.beginPath();
  for (let i = 0; i <= 8; i++) { const y1 = 300 + i * 70, y2 = 262 + i * 75; const a = disp(1150, y1), b = disp(1370, y2); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  for (let i = 0; i <= 5; i++) { const x = 1150 + i * 44; const a = disp(x, 300 - i * 7.6), b = disp(x, GROUND); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); }
  ctx.stroke();
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 13; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(1150, GROUND); ctx.lineTo(1150, 300); ctx.lineTo(1370, 262); ctx.lineTo(1370, GROUND); ctx.stroke();
  // Schatten
  const P = P0;
  ctx.fillStyle = 'rgba(0,0,0,.18)';
  ctx.beginPath(); ctx.ellipse(P.px + 10, GROUND + 4, 70, 9, 0, 0, Math.PI * 2); ctx.fill();
  const hgt = clamp((GROUND - R - by) / 400, 0, 1); ctx.beginPath(); ctx.ellipse(bx, GROUND + 4, R * (1 - hgt * .5), 7 * (1 - hgt * .5), 0, 0, Math.PI * 2); ctx.fill();
  // Figur
  const line = (pts, w) => { ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]); ctx.stroke(); };
  ctx.strokeStyle = '#fff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  line(P.larm, 15); line(P.lleg, 21);
  line([P.px, P.py + 6, P.nx, P.ny], 34);
  line(P.rleg, 21); line(P.rarm, 15);
  ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(P.hx, P.hy, HEAD, 0, Math.PI * 2); ctx.fill();
  // Ball mit Nahtlinien (Drall sichtbar)
  ctx.beginPath(); ctx.arc(bx, by, R, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = '#D20515'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(bx, by, R * .62, spin, spin + Math.PI * .9); ctx.stroke(); ctx.beginPath(); ctx.arc(bx, by, R * .62, spin + Math.PI, spin + Math.PI * 1.9); ctx.stroke();
  // TOR!
  if (t > HIT_T + 40) { const s = clamp((t - HIT_T - 40) / 380, 0, 1); const k = 1 + (1 - s) * (1 - s) * 2.2; ctx.save(); ctx.translate(880, 190); ctx.scale(k, k); ctx.globalAlpha = s;
    ctx.fillStyle = '#fff'; ctx.font = '800 210px "Barlow Condensed", "Arial Narrow", sans-serif'; ctx.textAlign = 'center'; ctx.fillText('TOR!', 0, 0); ctx.restore(); }
  ctx.restore();
}

export default function IntroScene({ running = true }) {
  const ref = useRef(null);
  useEffect(() => {
    const cv = ref.current; if (!cv) return; const ctx = cv.getContext('2d'); const B = simulateBall(); let raf = 0; const t0 = performance.now();
    const fit = () => { const dpr = Math.min(2, window.devicePixelRatio || 1); const bw = cv.clientWidth, bh = cv.clientHeight; cv.width = Math.round(bw * dpr); cv.height = Math.round(bh * dpr); return { dpr, scale: Math.max(bw / 1400, bh / 720), bw, bh }; };
    let dim = fit(); const onResize = () => { dim = fit(); }; window.addEventListener('resize', onResize);
    const dbg = () => Number.isFinite(window.__introFrame) ? window.__introFrame : null;      // Testhilfe: festes Bild
    const frame = now => { const t = dbg() ?? Math.min(SCENE_MS - 1, now - t0); drawScene(ctx, t, B, dim); if ((t < SCENE_MS - 1 || dbg() != null) && running) raf = requestAnimationFrame(frame); };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', onResize); };
  }, [running]);
  return <canvas ref={ref} className="scene-canvas" aria-hidden="true" />;
}
