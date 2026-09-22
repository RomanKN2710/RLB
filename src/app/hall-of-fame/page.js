import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as HOF from '@/lib/halloffame';
import { seasonAwards } from '@/lib/auszeichnungen';
import { fmtRp } from '@/components/ui';
export const dynamic = 'force-dynamic';

const medal = r => r === 1 ? '🥇' : r === 2 ? '🥈' : r === 3 ? '🥉' : '';
export default async function HallOfFame() {
  const u = await requireUser(); const { seasons, ehrentafel } = await HOF.all();
  const sd = await D.season(null); const played = sd.upto.filter((r, i) => r.status === 'final' || sd.datas[i].matches.some(m => m.finished));
  const cur = played.length ? sd.history[sd.upto.indexOf(played[played.length - 1])].table : null;
  const aw = seasonAwards(sd); const name = id => sd.base.managerName[id];
  return (<>
    <div className="card"><div className="eyebrow">Ewige Bestenliste</div><h2>Hall of Fame</h2>
      {seasons.length ? <>
        {seasons.map(s => <div key={s.season} className="hof-champ"><div className="hof-season">{s.season}</div><div>🏆 <span className="hof-name">{s.rows.find(r => r.rank === 1)?.manager || '–'}</span>{s.rows.find(r => r.rank === 1)?.points != null && <span className="mini"> {fmtRp(Number(s.rows.find(r => r.rank === 1).points))} RP</span>}<div className="mini">{s.rows.filter(r => r.rank === 2 || r.rank === 3).map(r => `${medal(r.rank)} ${r.manager}`).join('  ')}{s.rows.length ? ` · Letzter: ${s.rows[s.rows.length - 1].manager}` : ''}</div></div></div>)}
        {cur && <div className="hof-champ"><div className="hof-season">laufend</div><div>👑 <span className="hof-name">{name(cur[0].manager_id)}</span> <span className="mini">führt mit {fmtRp(cur[0].total)} RP nach {played.length} Spieltagen</span></div></div>}
      </> : <p className="mini">Noch keine vergangene Saison erfasst. Der Admin kann frühere Endstände unter Admin → Hall of Fame eintragen.</p>}
    </div>
    <div className="grid2">
      <div className="card"><h3>Ehrentafel</h3>{ehrentafel.length ? <div className="tbl"><table><thead><tr><th className="l">Manager</th><th>Titel</th><th>Podest</th><th>Saisons</th><th>Ø Platz</th></tr></thead><tbody>{ehrentafel.map(e => <tr key={e.manager}><td className="l"><b>{e.manager}</b></td><td>{e.titles ? '🏆'.repeat(Math.min(e.titles, 6)) + (e.titles > 6 ? ` ×${e.titles}` : '') : '–'}</td><td>{e.podium}</td><td>{e.seasons}</td><td>{e.avgRank.toFixed(1)}</td></tr>)}</tbody></table></div> : <p className="mini">Erscheint, sobald Saisons erfasst sind.</p>}</div>
      <div className="card"><h3>Auszeichnungen dieser Saison</h3>{aw.rounds.length ? <div className="tbl"><table><thead><tr><th className="l">Manager</th><th>Anzahl</th><th className="l">Auszeichnungen</th></tr></thead><tbody>{sd.base.managerIds.map(m => ({ m, list: aw.tally[m] })).sort((a, b) => b.list.length - a.list.length).map(x => <tr key={x.m} className={x.m === u.manager_id ? 'me' : ''}><td className="l"><b>{name(x.m)}</b></td><td>{x.list.length}</td><td className="l" style={{ whiteSpace: 'normal' }}>{x.list.map((a, i) => <span key={i} title={a.detail}>{a.icon} {a.title} <span className="mini">({a.round.label.replace('Spieltag ', 'ST ')})</span>{i < x.list.length - 1 ? ' · ' : ''}</span>)}</td></tr>)}</tbody></table></div> : <p className="mini">Noch keine gewertete Runde.</p>}</div>
    </div>
    {seasons.map(s => <details key={s.season} className="card"><summary><b>Endstand {s.season}</b>{s.note && <span className="mini"> · {s.note}</span>}</summary>
      <div className="tbl"><table><thead><tr><th>#</th><th className="l">Manager</th><th>Rangpunkte</th></tr></thead><tbody>{s.rows.map(r => <tr key={r.rank}><td>{r.rank} {medal(r.rank)}</td><td className="l">{r.manager}</td><td>{r.points != null ? fmtRp(Number(r.points)) : '–'}</td></tr>)}</tbody></table></div></details>)}
  </>);
}
