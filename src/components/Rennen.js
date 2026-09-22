'use client';
import { useEffect, useRef, useState } from 'react';

/* Das Rennen: animierte Verlaufsgrafik (Rangpunkte oder Platz je Runde). Alle Linien laufen gleichzeitig los, der Name jedes
   Managers fliegt an der Spitze seiner Linie mit und sortiert sich am Ende rechts in die Rangliste ein. Rechnet in echten
   Pixeln (Breite per ResizeObserver), damit Linien und Schrift auf dem Handy gleich dick bleiben. */
const HUES = [150, 20, 210, 45, 280, 0, 180, 320, 100, 240];
const DUR = 2600, SETTLE = 600;
const easeInOut = s => s < .5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2;
const easeOut = s => 1 - Math.pow(1 - s, 3);

export default function Rennen({ history, names, me }) {
  const [mode, setMode] = useState('rp'); const [run, setRun] = useState(0); const [hover, setHover] = useState(null);
  const [W, setW] = useState(900); const [t, setT] = useState(0); const wrap = useRef(null);
  useEffect(() => { const el = wrap.current; if (!el) return; const ro = new ResizeObserver(() => setW(Math.max(320, el.clientWidth))); ro.observe(el); setW(Math.max(320, el.clientWidth)); return () => ro.disconnect(); }, []);
  useEffect(() => { let raf = 0; const t0 = performance.now(); const tick = now => { const el = now - t0; setT(el); if (el < DUR + SETTLE + 50) raf = requestAnimationFrame(tick); }; raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf); }, [run, mode]);

  const ids = Object.keys(names).map(Number); const n = Math.max(2, history.length); const small = W < 560;
  const val = (m, h) => { const r = h.table.find(x => x.manager_id === m) || {}; return mode === 'rp' ? (r.total || 0) : (r.rank || ids.length); };
  const series = {}; ids.forEach(m => series[m] = history.map(h => val(m, h)));
  const H = small ? 300 : 360, L = small ? 30 : 40, Rm = small ? 126 : 156, T = 22, B = 30;
  const all = Object.values(series).flat();
  const lo = mode === 'rp' ? Math.floor(Math.min(...all) / 5) * 5 : 1, hi = mode === 'rp' ? (Math.ceil(Math.max(...all) / 5) * 5 || 70) : ids.length;
  const x = i => L + (W - L - Rm) * (n === 1 ? 0.5 : i / (n - 1));
  const y = v => mode === 'rp' ? T + (H - T - B) * (1 - (v - lo) / ((hi - lo) || 1)) : T + (H - T - B) * ((v - 1) / ((hi - 1) || 1));
  const f = easeInOut(Math.min(1, t / DUR)); const settle = easeOut(Math.max(0, Math.min(1, (t - DUR) / SETTLE)));
  const headIdx = f * (history.length - 1); const fi = Math.floor(headIdx), fr = headIdx - fi;
  const col = (k, dark) => `hsl(${HUES[k % 10]} 62% ${dark ? 38 : 46}%)`;
  const order = ids.map((m, k) => ({ m, k, v: series[m][history.length - 1] })).sort((a, b) => mode === 'rp' ? b.v - a.v : a.v - b.v);
  const rankOf = {}; order.forEach((o, i) => rankOf[o.m] = i);
  const rowH = small ? 22 : 26; const colTop = Math.max(T, (H - B - order.length * rowH) / 2 + T);
  const grid = []; if (mode === 'rp') { for (let v = lo; v <= hi; v += 10) grid.push(v); } else { for (let v = 1; v <= hi; v++) grid.push(v); }
  const fmt = v => mode === 'rp' ? (Number.isInteger(v) ? v : v.toFixed(1)) : '';
  return (
    <div ref={wrap}>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="row" style={{ gap: 6 }}><button type="button" className={`sm ${mode === 'rp' ? '' : 'sec'}`} onClick={() => setMode('rp')}>Rangpunkte</button><button type="button" className={`sm ${mode === 'rank' ? '' : 'sec'}`} onClick={() => setMode('rank')}>Platz</button></div>
        <button type="button" className="sec sm" onClick={() => setRun(r => r + 1)}>▶ Replay</button>
      </div>
      <svg className="chart rennen2" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="Das Rennen um die Tabellenspitze" onMouseLeave={() => setHover(null)} style={{ fontFamily: '"Barlow Condensed", sans-serif' }}>
        {grid.map(v => <g key={v}><line x1={L} x2={W - Rm} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" /><text x={L - 6} y={y(v) + 4} fontSize="12" textAnchor="end" fill="var(--muted)">{mode === 'rank' ? `${v}.` : v}</text></g>)}
        {history.map((h, i) => <text key={i} x={x(i)} y={H - 9} fontSize={small ? 12 : 13} fontWeight="600" textAnchor="middle" fill={i <= headIdx + 0.001 ? 'var(--ink)' : 'var(--muted)'}>{h.label}</text>)}
        {order.map((o, oi) => { const m = o.m, k = o.k; const s = series[m]; const isMe = m === me; const dim = hover != null && hover !== m; const c = col(k, isMe);
          const pts = []; for (let i = 0; i <= fi; i++) pts.push([x(i), y(s[i])]);
          let hx = x(fi), hy = y(s[fi]); if (fi < history.length - 1 && fr > 0) { hx = x(fi) + (x(fi + 1) - x(fi)) * fr; hy = y(s[fi]) + (y(s[fi + 1]) - y(s[fi])) * fr; pts.push([hx, hy]); }
          const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' ');
          const label = `${names[m]}${mode === 'rp' ? ' ' + fmt(s[history.length - 1] * settle + (s[fi] + (s[Math.min(fi + 1, s.length - 1)] - s[fi]) * fr) * (1 - settle)) : ''}`;
          const tw = label.length * (small ? 8.4 : 9.4) + 20; const fx = hx + 12, fy = hy; const cx = W - Rm + 10, cy = colTop + rankOf[m] * rowH + rowH / 2;
          const lx = fx + (cx - fx) * settle, ly = fy + (cy - fy) * settle;
          return <g key={m} className={dim ? 'dim' : ''} onMouseEnter={() => setHover(m)} style={{ cursor: 'pointer', transition: 'opacity .2s' }}>
            <path d={d} fill="none" stroke={c} strokeOpacity=".22" strokeWidth={isMe ? 13 : 10} strokeLinejoin="round" strokeLinecap="round" />
            <path d={d} fill="none" stroke={c} strokeWidth={isMe ? 6 : 4.5} strokeLinejoin="round" strokeLinecap="round" />
            {pts.slice(0, fi + 1).map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={isMe ? 5 : 4} fill="var(--surface)" stroke={c} strokeWidth="3" />)}
            <circle cx={hx} cy={hy} r={isMe ? 7 : 6} fill={c} stroke="var(--surface)" strokeWidth="2.5" />
            <g transform={`translate(${lx.toFixed(1)} ${ly.toFixed(1)})`}>
              <rect x="0" y={-11} width={tw} height="22" rx="11" fill={c} opacity={0.95 - settle * 0.95} />
              <text x={9} y={5} fontSize={small ? 13 : 16} fontWeight="700" fill={settle > 0.5 ? c : '#fff'} style={{ letterSpacing: '.02em', textTransform: 'uppercase' }}>{settle > 0.5 ? `${rankOf[m] + 1}. ` : ''}{label}</text>
            </g>
          </g>; })}
      </svg>
      <style>{`.rennen2 .dim{opacity:.15}`}</style>
    </div>
  );
}
