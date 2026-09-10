/* Diagramme als reines SVG (ohne Bibliothek), serverseitig gerendert. */
export const HUES = [150, 20, 210, 45, 280, 0, 180, 320, 100, 240];
export const color = (k, me) => `hsl(${HUES[k % 10]} 50% ${me ? 32 : 46}%)`;
const fmt = v => Number.isInteger(v) ? String(v) : v.toFixed(1);

/** Tabellenplatz-Verlauf (Bump-Chart): ranks: {managerId: [rank pro Runde]} */
export function BumpChart({ labels, ranks, names, ids, me }) {
  const n = Math.max(2, labels.length), N = ids.length;
  const W = 640, H = 34 + N * 24, L = 70, R = 90, T = 18, B = 24;
  const x = i => L + (W - L - R) * i / (n - 1), y = r => T + (H - T - B) * (r - 1) / (N - 1);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Tabellenplatz-Verlauf">
      {ids.map((_, i) => <line key={i} x1={L} x2={W - R} y1={y(i + 1)} y2={y(i + 1)} stroke="var(--line)" />)}
      {labels.map((l, i) => <text key={i} x={x(i)} y={H - 6} fontSize="10" textAnchor="middle" fill="var(--muted)">{l}</text>)}
      {ids.map((m, k) => { const col = color(k, m === me); const pts = ranks[m]; const first = pts[0], last = pts[pts.length - 1];
        const off = (r, i) => { const same = ids.filter(o => ranks[o][i] === r); const j = same.indexOf(m); return same.length > 1 ? (j - (same.length - 1) / 2) * 13 : 0; };
        return <g key={m}>
          <polyline points={pts.map((r, i) => `${x(i)},${y(r)}`).join(' ')} fill="none" stroke={col} strokeWidth={m === me ? 3.5 : 2} strokeLinejoin="round" opacity={0.9} />
          {pts.map((r, i) => <circle key={i} cx={x(i)} cy={y(r)} r={m === me ? 5 : 4} fill={col} stroke="var(--surface)" strokeWidth="1.5" />)}
          <text x={L - 8} y={y(first) + 4 + off(first, 0)} fontSize="11" textAnchor="end" fill={col} fontWeight={m === me ? 700 : 500}>{names[m]}</text>
          <text x={W - R + 10} y={y(last) + 4 + off(last, pts.length - 1)} fontSize="11" fill={col} fontWeight={m === me ? 700 : 500}>{last}. {names[m]}</text>
        </g>; })}
    </svg>
  );
}

/** Linien-Diagramm: series {managerId: [v…]} */
export function Lines({ labels, series, names, ids, me, title, small }) {
  const n = Math.max(2, labels.length);
  const W = small ? 300 : 560, H = small ? 170 : 260, L = 30, R = small ? 10 : 80, T = 14, B = 22;
  const all = Object.values(series).flat(); const lo = 0, hi = Math.max(1, Math.ceil(Math.max(...all) / 5) * 5);
  const x = i => L + (W - L - R) * i / (n - 1), y = v => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const steps = hi <= 10 ? 2 : hi <= 30 ? 5 : 10; const grid = []; for (let v = lo; v <= hi; v += steps) grid.push(v);
  const last = ids.map((m, k) => ({ m, k, v: series[m][labels.length - 1] || 0 })).sort((a, b) => b.v - a.v);
  let yy = T; const lab = last.map(o => { const ty = Math.max(yy, y(o.v) - 4); yy = ty + 12; return { ...o, ty }; });
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
      {title && <text x={L} y={10} fontSize="11" fontWeight="600" fill="var(--text)">{title}</text>}
      {grid.map(v => <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" /><text x={L - 5} y={y(v) + 3} fontSize="9" textAnchor="end" fill="var(--muted)">{v}</text></g>)}
      {labels.map((l, i) => <text key={i} x={x(i)} y={H - 7} fontSize="9" textAnchor="middle" fill="var(--muted)">{l}</text>)}
      {ids.map((m, k) => { const col = color(k, m === me); return <g key={m}><polyline points={series[m].map((v, i) => `${x(i)},${y(v)}`).join(' ')} fill="none" stroke={col} strokeWidth={m === me ? 3 : 1.5} />{series[m].map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r={small ? 2 : 3} fill={col} />)}</g>; })}
      {!small && lab.map(o => <text key={o.m} x={W - R + 8} y={o.ty + 4} fontSize="10" fill={color(o.k, false)} fontWeight={o.m === me ? 700 : 400}>{names[o.m]} {fmt(o.v)}</text>)}
    </svg>
  );
}

/** Gestapelte Balken: Rangpunkte pro Kategorie und Manager (aktueller Stand). rows: [{manager_id, rp:{cat: v}, total}] */
export function StackedBars({ rows, cats, names, me }) {
  const W = 640, rowH = 26, L = 70, R = 50, T = 24, H = T + rows.length * rowH + 8;
  const max = Math.max(...rows.map(r => r.total)) || 1; const x = v => L + (W - L - R) * v / max;
  const catCol = i => `hsl(${[210, 150, 45, 20, 0, 280, 180][i]} 55% 48%)`;
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Rangpunkte nach Kategorie">
      {cats.map(([c, label], i) => <g key={c}><rect x={L + i * 82} y={4} width="10" height="10" fill={catCol(i)} rx="2" /><text x={L + i * 82 + 14} y={13} fontSize="9" fill="var(--muted)">{label}</text></g>)}
      {rows.map((r, ri) => { let acc = 0; const y = T + ri * rowH; return <g key={r.manager_id}>
        <text x={L - 8} y={y + 16} fontSize="11" textAnchor="end" fill="var(--text)" fontWeight={r.manager_id === me ? 700 : 500}>{names[r.manager_id]}</text>
        {cats.map(([c], i) => { const v = r.rp[c] || 0; const x0 = x(acc); acc += v; return <g key={c}><rect x={x0} y={y + 4} width={Math.max(0, x(acc) - x0)} height={rowH - 8} fill={catCol(i)} stroke="var(--surface)" strokeWidth="1" />{v >= 4 && <text x={(x0 + x(acc)) / 2} y={y + 16} fontSize="9" textAnchor="middle" fill="#fff">{fmt(v)}</text>}</g>; })}
        <text x={x(r.total) + 6} y={y + 16} fontSize="11" fontWeight="700" fill="var(--text)">{fmt(r.total)}</text>
      </g>; })}
    </svg>
  );
}

/** Heatmap: Tages-Rangpunkte pro Manager und Runde (Form). cells: {managerId: [v…]} */
export function Heatmap({ labels, cells, names, ids, me, max }) {
  const cw = 44, ch = 24, L = 70, T = 22, W = L + labels.length * cw + 60, H = T + ids.length * ch + 6;
  const shade = v => `hsl(150 45% ${92 - 50 * (v / max)}%)`;
  const avg = m => cells[m].reduce((a, v) => a + v, 0) / (cells[m].length || 1);
  const order = [...ids].sort((a, b) => avg(b) - avg(a));
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Form pro Runde">
      {labels.map((l, i) => <text key={i} x={L + i * cw + cw / 2} y={14} fontSize="10" textAnchor="middle" fill="var(--muted)">{l}</text>)}
      <text x={L + labels.length * cw + 30} y={14} fontSize="10" textAnchor="middle" fill="var(--muted)">Ø</text>
      {order.map((m, ri) => { const y = T + ri * ch; return <g key={m}>
        <text x={L - 8} y={y + 16} fontSize="11" textAnchor="end" fill="var(--text)" fontWeight={m === me ? 700 : 500}>{names[m]}</text>
        {cells[m].map((v, i) => <g key={i}><rect x={L + i * cw + 1} y={y + 1} width={cw - 2} height={ch - 2} rx="3" fill={shade(v)} /><text x={L + i * cw + cw / 2} y={y + 16} fontSize="10" textAnchor="middle" fill={v / max > 0.55 ? '#fff' : 'var(--text)'}>{fmt(v)}</text></g>)}
        <text x={L + labels.length * cw + 30} y={y + 16} fontSize="11" textAnchor="middle" fontWeight="600" fill="var(--text)">{fmt(avg(m))}</text>
      </g>; })}
    </svg>
  );
}

export function Legend({ names, ids, me }) {
  return <div className="row" style={{ gap: 10, flexWrap: 'wrap', marginBottom: 6 }}>{ids.map((m, k) => <span key={m} className="mini" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: m === me ? 700 : 400 }}><span style={{ width: 14, height: 3, background: color(k, m === me), display: 'inline-block' }} />{names[m]}</span>)}</div>;
}
