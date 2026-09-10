import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { BumpChart, Lines, StackedBars, Heatmap, Legend } from '@/components/Charts';

export default async function Statistik() {
  const u = await requireUser(); const sd = await D.season(null); const b = sd.base; const ids = b.managerIds; const me = u.manager_id;
  const rounds = sd.history.filter(h => h.round.status === 'final' || sd.datas[sd.history.indexOf(h)].matches.some(m => m.finished));
  const labels = rounds.map(h => h.round.label.replace('Spieltag ', 'ST ').replace('Nachtrag ', 'N '));
  const ranks = {}; ids.forEach(m => ranks[m] = rounds.map(h => (h.table.find(r => r.manager_id === m) || {}).rank || ids.length));
  const totalRp = {}; ids.forEach(m => totalRp[m] = rounds.map(h => (h.table.find(r => r.manager_id === m) || {}).total || 0));
  // kumulierte Werte pro Kategorie
  const cum = {}; R.CATS.forEach(([c]) => { cum[c] = {}; ids.forEach(m => cum[c][m] = rounds.map(h => (h.table.find(r => r.manager_id === m) || { tot: {} }).tot[c] || 0)); });
  // Form: Rangpunkte der reinen Tageswerte jeder Runde
  const form = {}; ids.forEach(m => form[m] = []);
  rounds.forEach(h => { const i = sd.history.indexOf(h); const st = R.standings(ids, [sd.datas[i].totals]); ids.forEach(m => form[m].push((st.find(r => r.manager_id === m) || {}).total || 0)); });
  const maxRp = ids.length * R.CATS.length;
  // Bestwerte
  const best = R.CATS.map(([c, label]) => { const asc = c === 'karten'; const rows = sd.table.map(r => ({ m: r.manager_id, v: r.tot[c] })).sort((a, x) => asc ? a.v - x.v : x.v - a.v); return { c, label, top: rows[0], asc }; });
  const bestRound = (() => { let o = null; rounds.forEach((h, i) => ids.forEach(m => { const v = form[m][i]; if (!o || v > o.v) o = { m, v, label: labels[i] }; })); return o; })();
  const tdr = {}; sd.datas.forEach(d => Object.entries(d.results).forEach(([pid, r]) => { if (r.tdr) tdr[pid] = (tdr[pid] || 0) + r.tdr; }));
  const topTdr = Object.entries(tdr).sort((a, x) => x[1] - a[1]).slice(0, 5);
  if (!rounds.length) return <div className="card">Noch keine gewertete Runde.</div>;
  return (<>
    <div className="card"><div className="eyebrow">Statistik</div><h2>Tabellenplatz-Verlauf</h2><p className="mini">Rang nach jeder gewerteten Runde (Gesamtwertung). Eigene Linie fett.</p>
      <BumpChart labels={labels} ranks={ranks} names={b.managerName} ids={ids} me={me} /></div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">Gesamt</div><h2>Rangpunkte-Verlauf</h2><Lines labels={labels} series={totalRp} names={b.managerName} ids={ids} me={me} /></div>
      <div className="card"><div className="eyebrow">Form</div><h2>Tages-Rangpunkte pro Runde</h2><p className="mini">Jede Runde für sich gewertet (max. {maxRp}): wer war an diesem Spieltag am stärksten? Sortiert nach Durchschnitt.</p><Heatmap labels={labels} cells={form} names={b.managerName} ids={ids} me={me} max={maxRp} /></div>
    </div>
    <div className="card"><div className="eyebrow">Zusammensetzung</div><h2>Rangpunkte nach Kategorie (aktuell)</h2><StackedBars rows={sd.table} cats={R.CATS} names={b.managerName} me={me} /></div>
    <div className="card"><div className="eyebrow">Kategorien</div><h2>Saisonwerte im Verlauf</h2><Legend names={b.managerName} ids={ids} me={me} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10 }}>{R.CATS.map(([c, label]) => <div key={c}><Lines small title={label + (c === 'karten' ? ' (weniger ist besser)' : '')} labels={labels} series={cum[c]} names={b.managerName} ids={ids} me={me} /></div>)}</div></div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">Rekorde</div><h2>Bestwerte</h2><div className="kv">{best.map(x => <span key={x.c} style={{ display: 'contents' }}><b>{x.label}</b><span>{b.managerName[x.top.m]} · {x.top.v}{x.asc ? ' (wenigste)' : ''}</span></span>)}{bestRound && <><b>Bester Spieltag</b><span>{b.managerName[bestRound.m]} · {bestRound.v} Tages-Rangpunkte ({bestRound.label})</span></>}</div></div>
      <div className="card"><div className="eyebrow">Team der Runde</div><h2>Meistgewählte Spieler</h2><ul className="clean">{topTdr.length ? topTdr.map(([pid, n]) => <li key={pid}>{b.players[pid]?.name} <span className="muted">({b.managerName[b.players[pid]?.manager_id]})</span> · {n}×</li>) : <li className="muted">–</li>}</ul></div>
    </div>
  </>);
}
