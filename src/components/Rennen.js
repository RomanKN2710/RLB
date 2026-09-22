'use client';
import { useState } from 'react';

/* Das Rennen: animierte Verlaufsgrafik (Rangpunkte oder Platz je Runde). Linien zeichnen sich nacheinander, Replay per Knopf. */
export default function Rennen({ history, names, me }) {
  const [mode, setMode] = useState('rp'); const [run, setRun] = useState(0); const [hover, setHover] = useState(null);
  const ids = Object.keys(names).map(Number); const n = Math.max(2, history.length);
  const val = (m, h) => { const r = h.table.find(x => x.manager_id === m) || {}; return mode === 'rp' ? (r.total || 0) : (r.rank || ids.length); };
  const series = {}; ids.forEach(m => series[m] = history.map(h => val(m, h)));
  const W = 900, H = 340, L = 40, Rm = 110, T = 18, B = 30;
  const all = Object.values(series).flat();
  const lo = mode === 'rp' ? Math.floor(Math.min(...all) / 5) * 5 : 1, hi = mode === 'rp' ? (Math.ceil(Math.max(...all) / 5) * 5 || 70) : ids.length;
  const x = i => L + (W - L - Rm) * (n === 1 ? 0.5 : i / (n - 1));
  const y = v => mode === 'rp' ? T + (H - T - B) * (1 - (v - lo) / ((hi - lo) || 1)) : T + (H - T - B) * ((v - 1) / ((hi - 1) || 1));
  const hues = [150, 20, 210, 45, 280, 0, 180, 320, 100, 240];
  const last = ids.map((m, k) => ({ m, k, v: series[m][history.length - 1] })).sort((a, b) => mode === 'rp' ? b.v - a.v : a.v - b.v);
  const grid = []; if (mode === 'rp') { for (let v = lo; v <= hi; v += 10) grid.push(v); } else { for (let v = 1; v <= hi; v++) grid.push(v); }
  let yy = T; const labels = last.map(o => { const ty = Math.max(yy, y(o.v) - 4); yy = ty + 13; return { ...o, ty }; });
  const dur = 0.9, stagger = 0.12;
  return (
    <div>
      <style>{`.rennen polyline.line{stroke-dasharray:1;stroke-dashoffset:1;animation:rennen-draw ${dur}s ease-out forwards}.rennen circle.pt,.rennen text.lbl{opacity:0;animation:rennen-in .3s ease-out forwards}@keyframes rennen-draw{to{stroke-dashoffset:0}}@keyframes rennen-in{to{opacity:1}}.rennen .dim{opacity:.18}`}</style>
      <div className="row between" style={{ marginBottom: 6 }}>
        <div className="row" style={{ gap: 6 }}><button type="button" className={`sm ${mode === 'rp' ? '' : 'sec'}`} onClick={() => { setMode('rp'); setRun(r => r + 1); }}>Rangpunkte</button><button type="button" className={`sm ${mode === 'rank' ? '' : 'sec'}`} onClick={() => { setMode('rank'); setRun(r => r + 1); }}>Platz</button></div>
        <button type="button" className="sec sm" onClick={() => setRun(r => r + 1)}>▶ Replay</button>
      </div>
      <svg key={run} className="chart rennen" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Das Rennen um die Tabellenspitze" onMouseLeave={() => setHover(null)}>
        {grid.map(v => <g key={v}><line x1={L} x2={W - Rm} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="var(--muted)">{mode === 'rank' ? `${v}.` : v}</text></g>)}
        {history.map((h, i) => <text key={i} x={x(i)} y={H - 10} fontSize="11" textAnchor="middle" fill="var(--muted)">{h.label}</text>)}
        {last.map((o, order) => { const m = o.m, k = o.k; const col = `hsl(${hues[k % 10]} 50% ${m === me ? 35 : 48}%)`; const dim = hover != null && hover !== m; const delay = order * stagger;
          return <g key={m} className={dim ? 'dim' : ''} onMouseEnter={() => setHover(m)} style={{ cursor: 'pointer' }}>
            <polyline className="line" pathLength="1" points={series[m].map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={col} strokeWidth={m === me || hover === m ? 3.5 : 2} strokeLinejoin="round" strokeLinecap="round" style={{ animationDelay: `${delay}s` }} />
            {series[m].map((v, i) => <circle key={i} className="pt" cx={x(i)} cy={y(v)} r={m === me ? 4 : 3} fill={col} style={{ animationDelay: `${delay + dur * (n === 1 ? 0 : i / (n - 1))}s` }} />)}
          </g>; })}
        {labels.map((o, order) => <text key={o.m} className="lbl" x={W - Rm + 10} y={o.ty + 4} fontSize="12" fill={`hsl(${hues[o.k % 10]} 50% 42%)`} fontWeight={o.m === me ? 700 : 500} style={{ animationDelay: `${order * stagger + dur}s`, opacity: hover != null && hover !== o.m ? .25 : undefined }} onMouseEnter={() => setHover(o.m)}>{order + 1}. {names[o.m]} {mode === 'rp' ? (Number.isInteger(o.v) ? o.v : o.v.toFixed(1)) : ''}</text>)}
      </svg>
    </div>
  );
}
