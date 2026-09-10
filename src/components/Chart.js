export default function Chart({ history, names, me }) {
  const ids = Object.keys(names).map(Number);
  const series = {}; ids.forEach(m => series[m] = history.map(h => (h.table.find(r => r.manager_id === m) || {}).total || 0));
  const W = 520, H = 260, L = 34, R = 74, T = 12, B = 26, n = Math.max(2, history.length);
  const all = Object.values(series).flat(); const lo = Math.floor(Math.min(...all) / 5) * 5, hi = Math.ceil(Math.max(...all) / 5) * 5 || 70;
  const x = i => L + (W - L - R) * i / (n - 1), y = v => T + (H - T - B) * (1 - (v - lo) / ((hi - lo) || 1));
  const hues = [150, 20, 210, 45, 280, 0, 180, 320, 100, 240];
  const last = ids.map((m, k) => ({ m, k, v: series[m][history.length - 1] || 0 })).sort((a, b) => b.v - a.v);
  const grid = []; for (let v = lo; v <= hi; v += 10) grid.push(v);
  let yy = T; const labels = last.map(o => { const ty = Math.max(yy, y(o.v) - 4); yy = ty + 12; return { ...o, ty }; });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Verlauf Rangpunkte">
      {grid.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 6} y={y(v) + 4} fontSize="10" textAnchor="end" fill="var(--muted)">{v}</text></g>)}
      {history.map((h, i) => <text key={i} x={x(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="var(--muted)">{h.label}</text>)}
      {ids.map((m, k) => { const col = `hsl(${hues[k % 10]} 45% ${m === me ? 35 : 50}%)`; return <g key={m}><polyline points={series[m].map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={col} strokeWidth={m === me ? 3 : 1.5} />{series[m].map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill={col} />)}</g>; })}
      {labels.map(o => <text key={o.m} x={W - R + 8} y={o.ty + 4} fontSize="10" fill={`hsl(${hues[o.k % 10]} 45% 45%)`} fontWeight={o.m === me ? 700 : 400}>{names[o.m]} {Number.isInteger(o.v) ? o.v : o.v.toFixed(1)}</text>)}
    </svg>
  );
}
