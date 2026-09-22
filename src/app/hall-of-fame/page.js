import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as HOF from '@/lib/halloffame';
import { seasonAwards } from '@/lib/auszeichnungen';
import { fmtRp } from '@/components/ui';
export const dynamic = 'force-dynamic';

const medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '';
const strip = (n, ch, max = 8) => n ? ch.repeat(Math.min(n, max)) + (n > max ? ` ×${n}` : '') : '';
export default async function HallOfFame() {
  const u = await requireUser(); const H = await HOF.all();
  const sd = await D.season(null); const played = sd.upto.filter((r, i) => r.status === 'final' || sd.datas[i].matches.some(m => m.finished));
  const cur = played.length ? sd.history[sd.upto.indexOf(played[played.length - 1])].table : null;
  const aw = seasonAwards(sd); const name = id => sd.base.managerName[id];
  const active = new Set(sd.base.managers.map(m => m.name)); const me = u.manager_name;
  const big = H.honours.slice(0, 3), rest = H.honours.slice(3);
  return (<>
    <div className="card hof-hero"><div className="eyebrow">Ewige Bestenliste · seit {H.firstSeason || '–'} · {H.count} Saisons</div><h2>Hall of Fame</h2>
      {H.count ? <div className="hof-big">{big.map(h => <div key={h.title} className={`hof-tile ${h.manager === me ? 'me' : ''}`}><div className="hof-tile-icon">{h.icon}</div><div className="hof-tile-title">{h.title}</div><div className="hof-tile-name">{h.manager}</div><div className="mini">{h.text}</div></div>)}</div>
        : <p className="mini">Noch keine Saison erfasst. Die ewige Rangliste wird beim nächsten Öffnen der Admin-Seite automatisch eingespielt.</p>}
      {rest.length > 0 && <div className="hof-badges">{rest.map(h => <span key={h.title} className={`hof-badge ${h.manager === me ? 'me' : ''}`} title={h.text}><span>{h.icon}</span><b>{h.title}</b> {h.manager}<span className="mini"> · {h.text}</span></span>)}</div>}
    </div>
    {H.count > 0 && <div className="card"><div className="eyebrow">Meister-Chronik</div><h3>Alle Meister seit {H.firstSeason}</h3>
      <div className="hof-chrono">{H.chrono.map((s, i) => { const prev = H.chrono[i - 1]; const rep = prev && prev.champions.some(c => s.champions.includes(c)); return <div key={s.season} className={`hof-chip ${rep ? 'rep' : ''} ${s.champions.includes(me) ? 'me' : ''}`}><div className="hof-chip-season">{s.season}</div><div className="hof-chip-name">{s.champions.join(' & ')}</div>{s.champions.length > 1 && <div className="mini">geteilt</div>}</div>; })}
        {cur && <div className="hof-chip live"><div className="hof-chip-season">2026/27</div><div className="hof-chip-name">{name(cur[0].manager_id)}</div><div className="mini">führt · {fmtRp(cur[0].total)} RP</div></div>}</div>
      <p className="mini">Gelb markiert: Titelverteidigung. Grün: laufende Saison.</p></div>}
    {H.count > 0 && <div className="card"><div className="eyebrow">Ewige Tabelle</div><h3>Alle Manager, sortiert nach Titeln, Podestplätzen und ewigen Punkten</h3>
      <div className="tbl"><table><thead><tr><th>#</th><th className="l">Manager</th><th className="l">Titel</th><th>🥈</th><th>🥉</th><th>Podest</th><th>Saisons</th><th>Ø Platz</th><th>Letzter</th><th>Punkte</th><th className="l">Dabei</th></tr></thead>
        <tbody>{H.table.map((x, i) => <tr key={x.manager} className={`${x.manager === me ? 'me' : ''} ${active.has(x.manager) ? '' : 'off'}`}><td>{i + 1}</td><td className="l"><b>{x.manager}</b>{active.has(x.manager) && <span className="badge j">aktiv</span>}</td>
          <td className="l">{x.titles ? <span title={x.titleSeasons.join(', ')}>{strip(x.titles, '🏆')}</span> : <span className="muted">–</span>}</td><td>{x.second || ''}</td><td>{x.third || ''}</td><td><b>{x.podium}</b></td><td>{x.seasons}</td><td>{x.avgRank.toFixed(1)}</td><td>{x.last ? `🏮${x.last > 1 ? '×' + x.last : ''}` : ''}</td><td>{x.points}</td><td className="l mini">{x.first}{x.latest !== x.first ? ` – ${x.latest}` : ''}</td></tr>)}</tbody></table></div>
      <p className="mini">Punkte nach Formel-1-Wertung je Endrang (25-18-15-12-10-8-6-4-2-1). Letzter = letzter Platz einer Saison. Grau: nicht mehr dabei.</p></div>}
    <div className="grid2">
      <div className="card"><h3>Auszeichnungen dieser Saison</h3>{aw.rounds.length ? <div className="tbl"><table><thead><tr><th className="l">Manager</th><th>Anzahl</th><th className="l">Auszeichnungen</th></tr></thead><tbody>{sd.base.managerIds.map(m => ({ m, list: aw.tally[m] })).sort((a, b) => b.list.length - a.list.length).map(x => <tr key={x.m} className={x.m === u.manager_id ? 'me' : ''}><td className="l"><b>{name(x.m)}</b></td><td>{x.list.length}</td><td className="l" style={{ whiteSpace: 'normal' }}>{x.list.map((a, i) => <span key={i} title={a.detail}>{a.icon} {a.title} <span className="mini">({a.round.label.replace('Spieltag ', 'ST ')})</span>{i < x.list.length - 1 ? ' · ' : ''}</span>)}</td></tr>)}</tbody></table></div> : <p className="mini">Noch keine gewertete Runde.</p>}</div>
      <div className="card"><h3>Endstände</h3><div className="stack" style={{ gap: 4 }}>{H.seasons.map(s => <details key={s.season}><summary><b>{s.season}</b> <span className="mini">Meister {s.champions.join(' & ')} · Letzter {s.rows.filter(r => r.rank === s.last).map(r => r.manager).join(' & ')} · {s.n} Manager</span></summary>
        <table><tbody>{s.rows.map(r => <tr key={r.manager}><td style={{ width: 40 }}>{r.rank} {medal(r.rank)}</td><td className="l">{r.manager}</td><td className="mini">{r.points != null ? fmtRp(Number(r.points)) + ' RP' : ''}</td></tr>)}</tbody></table></details>)}</div></div>
    </div>
  </>);
}
