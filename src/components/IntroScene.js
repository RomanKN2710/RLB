'use client';
import { useEffect, useRef } from 'react';

/* Intro-Szene auf Canvas: minimalistische Strichfigur mit Skelett (Becken, Rumpf, Kopf, Arme, Beine per inverser Kinematik),
   Ball mit Schwerkraft und Kontakten, Tor mit Netz, das beim Einschlag schwingt. Choreografie: Jonglieren (rechts, links, rechts),
   Lupfer, Volley in den Winkel, Jubel. Alles als Funktion der Zeit, damit es auf jedem Gerät gleich läuft. */
export const SCENE_MS = 4400;
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
const PX0 = 520;                                                     // Standposition Becken x
const B0 = 610;                                                      // Ball vor dem Fuss
const TOUCHES = [[400, 0, -1200], [1450, -30, -1000], [2350, 100, -1000]];   // [t, vx, vy] Kontakte: rechts, links, rechts (Lupfer)
const VOLLEY_T = 3100, HIT_T = 3480, TARGET = [1250, 330];
function pelvisX() { return PX0; }
function simulateBall() {
  const dt = 1 / 1000; const out = new Float32Array(SCENE_MS * 3); let x = B0, y = GROUND - R, vx = 0, vy = 0, spin = 0; let ti = 0;
  for (let ms = 0; ms < SCENE_MS; ms++) {
    if (ms < TOUCHES[0][0]) { x = B0; y = GROUND - R; }
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
  const [bx, by] = B; const px = PX0; const G0 = GROUND;
  const L0 = [px - 48, G0], R0 = [px + 44, G0];
  // Spielfuss rechts: Kontakt 1, Kontakt 3 (Lupfer), Volley; links: Kontakt 2
  const rTrack = [[0, ...R0], [300, bx - 10, G0 - 4], [400, bx, by + R - 4], [480, bx + 20, G0 - 60], [620, ...R0],
    [2250, ...R0], [2350, bx, by + R - 6], [2440, bx + 15, by - 60], [2600, ...R0],
    [2900, ...R0], [2980, px - 95, G0 - 70], [VOLLEY_T, bx - 4, by + 6], [3190, px + 190, by - 90], [3350, px + 120, G0 - 40], [3500, ...R0], [SCENE_MS, ...R0]];
  const lTrack = [[0, ...L0], [1350, ...L0], [1450, bx, by + R - 6], [1530, bx - 10, by - 40], [1660, ...L0],
    [2900, ...L0], [2980, px - 40, G0], [VOLLEY_T, px - 30, G0 - 20], [3190, px - 20, G0 - 60], [3350, px - 40, G0], [3650, px - 40, G0], [3750, px - 40, G0 - 40], [3950, px - 40, G0], [SCENE_MS, px - 40, G0]];
  const pyTrack = [[0, G0 - 205], [400, G0 - 200], [480, G0 - 208], [1450, G0 - 202], [1530, G0 - 210], [2350, G0 - 200], [2440, G0 - 208],
    [2980, G0 - 205], [VOLLEY_T, G0 - 225], [3190, G0 - 240], [3350, G0 - 205], [3650, G0 - 205], [3750, G0 - 250], [3950, G0 - 205], [SCENE_MS, G0 - 205]];
  const pxTrack = [[0, 0], [1400, -14], [1660, 0], [2980, -20], [VOLLEY_T, 10], [3190, 30], [3350, 10], [3500, 0]];
  const torsoTrack = [[0, 6], [400, 4], [480, -6], [1450, 2], [1530, -6], [2350, 2], [2440, -8], [2900, 0], [2980, -12], [VOLLEY_T, -22], [3190, -30], [3350, -6], [3500, 0], [3650, -4], [3750, -10], [3950, 0]];
  const headTrack = [[0, 4], [400, 8], [560, -12], [1450, 8], [1600, -12], [2350, 8], [2460, -14], [2980, -6], [VOLLEY_T, -10], [3350, 0], [3650, -8]];
  const laTrack = [[0, -30, 60], [400, -35, 70], [480, -60, 60], [1450, -35, 70], [1530, -60, 60], [2350, -35, 70], [2440, -65, 60],
    [2980, -70, 50], [VOLLEY_T, -95, 30], [3190, -110, 20], [3350, -50, 50], [3500, -30, 60], [3650, -150, 20], [3750, -165, 10], [3950, -150, 25], [SCENE_MS, -150, 25]];
  const raTrack = [[0, 35, 60], [400, 40, 70], [480, 70, 60], [1450, 40, 70], [1530, 70, 60], [2350, 40, 70], [2440, 75, 60],
    [2980, 60, 50], [VOLLEY_T, 40, 60], [3190, 20, 70], [3350, 40, 50], [3500, 30, 60], [3650, 150, 20], [3750, 165, 10], [3950, 150, 25], [SCENE_MS, 150, 25]];
  return build(px + track(pxTrack, t)[0], track(pyTrack, t)[0], track(torsoTrack, t)[0], track(headTrack, t)[0], track(lTrack, t), track(rTrack, t), track(laTrack, t), track(raTrack, t));
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
  const cx = clamp((P0.px + bx) / 2 + 160, visW / 2, W - visW / 2), cy = GROUND - visH * 0.36;
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
