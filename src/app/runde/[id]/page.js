import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { q } from '@/lib/db';
import { fmtDt } from '@/components/ui';

export default async function Runde({ params }) {
  const u = await requireUser(); const b = await D.base(); const round = await D.roundById(Number(params.id));
  if (!round) return <div className="card">Runde nicht gefunden.</div>;
  const passed = round.deadline && new Date(round.deadline) < new Date();
  const d = await D.roundData(round, b);
  const matches = await q('select m.*, c1.id as c1, c2.id as c2 from matches m left join clubs c1 on c1.oldb_team_id=m.team1 left join clubs c2 on c2.oldb_team_id=m.team2 where m.round_id=$1 order by m.kickoff', [round.id]);
  const bids = await q("select b.*, m.name as manager_name, p.name as release_name from bids b join managers m on m.id=b.manager_id left join players p on p.id=b.release_player_id where b.round_id=$1 and b.status<>'sealed' order by b.price desc", [round.id]);
  return (<>
    <div className="card"><div className="eyebrow">Runde</div><h2>{round.label} {round.status === 'final' ? <span className="pill ok">final</span> : passed ? <span className="pill open">in Auswertung</span> : <span className="pill grey">offen</span>}</h2>
      <div className="kv"><b>Deadline</b><span>{fmtDt(round.deadline)}</span><b>Team der Runde</b><span>{(round.tdr || []).join(', ') || '–'}</span><b>Spieler des Tages</b><span>{round.sdt || '–'}</span></div></div>
    <div className="grid2">
      <div className="card"><h3>Spiele</h3><table><tbody>{matches.map(m => <tr key={m.id}><td className="l">{fmtDt(m.kickoff)}</td><td className="l">{m.c1 || m.team1} – {m.c2 || m.team2}</td><td>{m.finished ? `${m.goals1}:${m.goals2}` : ''}</td></tr>)}</tbody></table></div>
      <div className="card"><h3>Gebote</h3>{bids.length ? <ul className="clean small">{bids.map(x => <li key={x.id}>{x.manager_name}: CHF {x.price} für {x.pos} {x.player_name} ({x.club}){x.release_name && `, entlässt ${x.release_name}`} · <span className={x.status === 'won' ? 'tag-won' : x.status === 'invalid' ? 'tag-inv' : 'tag-lost'}>{x.status === 'won' ? 'Zuschlag' : x.status === 'invalid' ? 'ungültig' : 'kein Zuschlag'}</span> <span className="mini">{x.reason}</span></li>)}</ul> : <div className="mini">{passed ? 'keine veröffentlichten Gebote' : 'Gebote sind bis zur Auflösung verdeckt'}</div>}</div>
    </div>
    {passed && <div className="grid3">{b.managers.map(m => { const lu = d.lineups[m.id]; if (!lu) return <div key={m.id} className="card"><h3>{m.name}</h3><div className="mini">keine Aufstellung</div></div>; const t = d.totals[m.id]; return (
      <div key={m.id} className="card" style={m.id === u.manager_id ? { borderColor: 'var(--accent)' } : {}}><div className="row between"><h3>{m.name}</h3><span className="mini">P {t.punkte} · Sh {t.shutout} · A {t.assist} · T {t.tore} · K {t.karten} · TdR {t.tdr} · St {t.start}</span></div>
        <table><tbody>{Object.entries(lu.entries).map(([pid, e]) => { const p = b.players[pid]; if (!p) return null; const r = d.results[pid]; const v = R.entryValues(p, e.pos, r, d.clubRes); return <tr key={pid}><td className="l muted">{e.pos}</td><td className="l">{p.name} <span className="mini">{p.club}</span></td><td className="mini">{r ? ['–', 'Start', 'Eingew.'][r.start] : ''}</td><td>{v.punkte}/{v.shutout}/{v.assist}/{v.tore}/{v.karten}/{v.tdr}</td></tr>; })}</tbody></table>
        <div className="mini">Spalten: P/Sh/A/T/K/TdR</div></div>); })}</div>}
  </>);
}
