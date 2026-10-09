'use client';
import { useEffect, useRef, useState } from 'react';

/* Diagramme als reines SVG (ohne Bibliothek). Rechnen wie das Rennen in echten Pixeln (Breite per ResizeObserver),
   damit Schrift und Linien auf Handy und Desktop gleich gross bzw. dick sind. */
export const HUES = [150, 20, 210, 45, 280, 0, 180, 320, 100, 240];
export const color = k => `hsl(${HUES[k % 10]} 62% 48%)`;
const CAT_HUES = [210, 150, 45, 20, 0, 280, 180];
const catCol = i => `hsl(${CAT_HUES[i % 7]} 58% 48%)`;
const fmt = v => Number.isInteger(v) ? String(v) : v.toFixed(1);
const FONT = { fontFamily: '"IBM Plex Sans", sans-serif' };

function useWidth(fallback) {
  const ref = useRef(null); const [w, setW] = useState(fallback);
  useEffect(() => { const el = ref.current; if (!el) return; const upd = () => setW(Math.max(260, Math.round(el.clientWidth))); const ro = new ResizeObserver(upd); ro.observe(el); upd(); return () => ro.disconnect(); }, []);
  return [ref, w];
}
// Achsenbeschriftung ausdünnen, damit sich nichts überlappt (letzte Runde immer zeigen)
const showLabel = (i, n, span, minGap = 44) => { const step = Math.max(1, Math.ceil(minGap / Math.max(1, span / Math.max(1, n - 1)))); return i % step === 0 || i === n - 1; };
// Endbeschriftungen übereinander, ohne Überlappung
function stack(items, gap, top, bottom) {
  const s = [...items].sort((a, b) => a.y - b.y); let yy = top; s.forEach(o => { o.ty = Math.max(yy, o.y); yy = o.ty + gap; });
  const over = yy - gap - bottom; if (over > 0) s.forEach(o => { o.ty -= over; }); return s;
}

/** Tabellenplatz-Verlauf (Bump-Chart): ranks: {managerId: [rank pro Runde]} */
export function BumpChart({ labels, ranks, names, ids, me }) {
  const [ref, W] = useWidth(640); const small = W < 560;
  const n = Math.max(2, labels.length), N = ids.length;
  const rowGap = small ? 26 : 30; const H = 30 + N * rowGap, L = small ? 22 : 84, R = small ? 104 : 120, T = 16, B = 28;
  const x = i => L + (W - L - R) * (labels.length === 1 ? 0.5 : i / (n - 1)), y = r => T + (H - T - B) * (r - 1) / Math.max(1, N - 1);
  return (
    <div ref={ref}><svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Tabellenplatz-Verlauf" style={FONT}>
      {ids.map((_, i) => <g key={i}><line x1={L} x2={W - R} y1={y(i + 1)} y2={y(i + 1)} stroke="var(--line)" />{small && <text x={L - 6} y={y(i + 1) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">{i + 1}</text>}</g>)}
      {labels.map((l, i) => showLabel(i, labels.length, W - L - R) && <text key={i} x={x(i)} y={H - 8} fontSize="12" fontWeight="600" textAnchor="middle" fill="var(--muted)">{l}</text>)}
      {ids.map((m, k) => { const col = color(k); const pts = ranks[m]; const first = pts[0], last = pts[pts.length - 1]; const isMe = m === me;
        const off = (r, i) => { const same = ids.filter(o => ranks[o][i] === r); const j = same.indexOf(m); return same.length > 1 ? (j - (same.length - 1) / 2) * 13 : 0; };
        return <g key={m}>
          <polyline points={pts.map((r, i) => `${x(i)},${y(r)}`).join(' ')} fill="none" stroke={col} strokeWidth={isMe ? 5 : 3} strokeLinejoin="round" strokeLinecap="round" opacity={isMe ? 1 : 0.85} />
          {pts.map((r, i) => <circle key={i} cx={x(i)} cy={y(r)} r={isMe ? 5 : 4} fill="var(--surface)" stroke={col} strokeWidth="2.5" />)}
          {!small && <text x={L - 10} y={y(first) + 4 + off(first, 0)} fontSize="12" textAnchor="end" fill={col} fontWeight={isMe ? 700 : 600}>{names[m]}</text>}
          <text x={W - R + 10} y={y(last) + 4 + off(last, pts.length - 1)} fontSize={small ? 12 : 13} fill={col} fontWeight={isMe ? 700 : 600}>{last}. {names[m]}</text>
        </g>; })}
    </svg></div>
  );
}

/** Linien-Diagramm: series {managerId: [v…]} */
export function Lines({ labels, series, names, ids, me, title, small }) {
  const [ref, W] = useWidth(small ? 300 : 560); const narrow = W < 420;
  const n = Math.max(2, labels.length);
  const H = small ? 190 : 280, L = 34, R = small ? 12 : (narrow ? 96 : 112), T = title ? 26 : 12, B = 26;
  const all = Object.values(series).flat(); const lo = small ? 0 : Math.max(0, Math.floor(Math.min(...all) / 10) * 10), hi = Math.max(1, Math.ceil(Math.max(...all) / 5) * 5);
  const x = i => L + (W - L - R) * (labels.length === 1 ? 0.5 : i / (n - 1)), y = v => T + (H - T - B) * (1 - (v - lo) / ((hi - lo) || 1));
  const steps = hi - lo <= 10 ? 2 : hi - lo <= 30 ? 5 : hi - lo <= 80 ? 10 : 20; const grid = []; for (let v = lo; v <= hi; v += steps) grid.push(v);
  const li = labels.length - 1;
  const lab = small ? [] : stack(ids.map((m, k) => ({ m, k, v: series[m][li] || 0, y: y(series[m][li] || 0) })), 15, T + 4, H - B);
  return (
    <div ref={ref}><svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={title || 'Verlauf'} style={FONT}>
      {title && <text x={L} y={14} fontSize="13" fontWeight="600" fill="var(--ink)">{title}</text>}
      {grid.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} fontSize="11" textAnchor="end" fill="var(--muted)">{v}</text></g>)}
      {labels.map((l, i) => showLabel(i, labels.length, W - L - R) && <text key={i} x={x(i)} y={H - 8} fontSize="11" fontWeight="600" textAnchor="middle" fill="var(--muted)">{l}</text>)}
      {[...ids].sort((a, b) => (a === me) - (b === me)).map(m => { const k = ids.indexOf(m); const col = color(k); const isMe = m === me; return <g key={m}>
        <polyline points={series[m].map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={col} strokeWidth={isMe ? 4.5 : (small ? 2.2 : 2.8)} strokeLinejoin="round" strokeLinecap="round" opacity={isMe ? 1 : 0.85} />
        {!small && series[m].map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={isMe ? 4 : 3} fill="var(--surface)" stroke={col} strokeWidth="2" />)}</g>; })}
      {lab.map(o => <text key={o.m} x={W - R + 8} y={o.ty + 4} fontSize="12" fill={color(o.k)} fontWeight={o.m === me ? 700 : 600}>{names[o.m]} {fmt(o.v)}</text>)}
    </svg></div>
  );
}

/** Gestapelte Balken: Rangpunkte pro Kategorie und Manager (aktueller Stand). rows: [{manager_id, rp:{cat: v}, total}] */
export function StackedBars({ rows, cats, names, me }) {
  const [ref, W] = useWidth(640);
  // Legende fliesst über mehrere Zeilen, wenn es eng wird
  let lx = 0, ly = 0; const leg = cats.map(([c, label]) => { const w = label.length * 7 + 28; if (lx + w > W && lx > 0) { lx = 0; ly += 18; } const o = { c, label, x: lx, y: ly }; lx += w; return o; });
  const rowH = 30, L = 76, R = 46, T = ly + 28, H = T + rows.length * rowH + 4;
  const max = Math.max(...rows.map(r => r.total)) || 1; const x = v => L + (W - L - R) * v / max;
  return (
    <div ref={ref}><svg className="chart" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Rangpunkte nach Kategorie" style={FONT}>
      {leg.map((o, i) => <g key={o.c}><rect x={o.x} y={o.y + 3} width="12" height="12" fill={catCol(i)} rx="3" /><text x={o.x + 17} y={o.y + 13} fontSize="12" fill="var(--muted)">{o.label}</text></g>)}
      {rows.map((r, ri) => { let acc = 0; const y = T + ri * rowH; const isMe = r.manager_id === me; return <g key={r.manager_id}>
        <text x={L - 8} y={y + 19} fontSize="12" textAnchor="end" fill="var(--ink)" fontWeight={isMe ? 700 : 500}>{names[r.manager_id]}</text>
        {cats.map(([c], i) => { const v = r.rp[c] || 0; const x0 = x(acc); acc += v; const w = Math.max(0, x(acc) - x0); return <g key={c}><rect x={x0} y={y + 4} width={w} height={rowH - 8} fill={catCol(i)} stroke="var(--surface)" strokeWidth="1.5" />{w >= 24 && <text x={x0 + w / 2} y={y + 19} fontSize="11" fontWeight="600" textAnchor="middle" fill="#fff">{fmt(v)}</text>}</g>; })}
        <text x={x(r.total) + 6} y={y + 19} fontSize="13" fontWeight="700" fill="var(--ink)">{fmt(r.total)}</text>
      </g>; })}
    </svg></div>
  );
}

/** Heatmap: Tages-Rangpunkte pro Manager und Runde (Form). cells: {managerId: [v…]} */
export function Heatmap({ labels, cells, names, ids, me, max }) {
  const [ref, avail] = useWidth(560);
  const L = 74, A = 46, ch = 28, T = 24; const n = Math.max(1, labels.length);
  const cw = Math.max(36, Math.min(56, (avail - L - A) / n)); const W = L + n * cw + A, H = T + ids.length * ch + 4;
  const avg = m => cells[m].reduce((a, v) => a + v, 0) / (cells[m].length || 1);
  const order = [...ids].sort((a, b) => avg(b) - avg(a));
  return (
    <div ref={ref} style={{ overflowX: 'auto' }}><svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Form pro Runde" style={{ ...FONT, display: 'block' }}>
      {labels.map((l, i) => <text key={i} x={L + i * cw + cw / 2} y={15} fontSize="11" fontWeight="600" textAnchor="middle" fill="var(--muted)">{l}</text>)}
      <text x={L + n * cw + A / 2} y={15} fontSize="11" fontWeight="600" textAnchor="middle" fill="var(--muted)">Ø</text>
      {order.map((m, ri) => { const y = T + ri * ch; const isMe = m === me; return <g key={m}>
        <text x={L - 8} y={y + 18} fontSize="12" textAnchor="end" fill="var(--ink)" fontWeight={isMe ? 700 : 500}>{names[m]}</text>
        {cells[m].map((v, i) => { const s = Math.max(0, Math.min(1, v / max)); return <g key={i}><rect x={L + i * cw + 1.5} y={y + 1.5} width={cw - 3} height={ch - 3} rx="5" fill="var(--accent)" fillOpacity={0.08 + 0.82 * s} /><text x={L + i * cw + cw / 2} y={y + 18} fontSize="12" fontWeight={s > 0.75 ? 700 : 500} textAnchor="middle" fill={s > 0.5 ? 'var(--accent-ink)' : 'var(--ink)'}>{fmt(v)}</text></g>; })}
        {isMe && <rect x={L + 0.5} y={y + 0.5} width={n * cw - 1} height={ch - 1} rx="6" fill="none" stroke="var(--ink)" strokeWidth="1.5" />}
        <text x={L + n * cw + A / 2} y={y + 18} fontSize="12" textAnchor="middle" fontWeight="700" fill="var(--ink)">{fmt(avg(m))}</text>
      </g>; })}
    </svg></div>
  );
}

export function Legend({ names, ids, me }) {
  return <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8 }}>{ids.map((m, k) => <span key={m} className="small" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontWeight: m === me ? 700 : 500 }}><span style={{ width: 16, height: m === me ? 5 : 3, borderRadius: 2, background: color(k), display: 'inline-block' }} />{names[m]}</span>)}</div>;
}
