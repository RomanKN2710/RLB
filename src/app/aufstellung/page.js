import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { fmtDt } from '@/components/ui';
import LineupEditor from '@/components/LineupEditor';
import { q, one } from '@/lib/db';

export default async function Aufstellung({ searchParams }) {
  const u = await requireUser(); const admin = u.role === 'admin';
  const b = await D.base();
  const open = await D.openRound();
  const managerId = admin && searchParams?.m ? Number(searchParams.m) : u.manager_id;

  // Der Admin darf jede Runde wählen, auch eine mit abgelaufener Deadline oder eine bereits
  // gewertete (Ziff. 5.1 gilt für die Manager, nicht für die Korrektur durch den Admin).
  // saveLineupAction prüft die Deadline ohnehin nur für Nicht-Admins.
  const alleRunden = admin ? await D.rounds() : [];
  const gewaehlt = admin && searchParams?.r ? await one('select * from rounds where number=$1', [Number(searchParams.r)]) : null;
  const round = gewaehlt || open;

  if (!managerId) return <div className="card"><h2>Kein Team</h2><p>Dein Konto ist keinem Team zugeordnet. {admin && 'Als Admin: Team unten wählen.'}</p>{admin && <p className="row">{b.managers.map(m => <a key={m.id} className="btn sec sm" href={`/aufstellung?m=${m.id}${gewaehlt ? `&r=${gewaehlt.number}` : ''}`}>{m.name}</a>)}</p>}</div>;

  const rundenWahl = admin && alleRunden.length ? (
    <p className="row" style={{ marginTop: 6 }}><span className="mini">Runde:</span>{alleRunden.map(r => (
      <a key={r.id} className={`btn sm ${round && r.id === round.id ? '' : 'sec'}`} href={`/aufstellung?m=${managerId}&r=${r.number}`}>
        {r.label}{r.status === 'final' ? ' ✓' : ''}
      </a>))}{open && <a className="btn sm sec" href={`/aufstellung?m=${managerId}`}>offene Runde</a>}</p>) : null;

  if (!round) return (<div className="card"><h2>Keine offene Runde</h2>
    <p className="mini">Sobald der Spielplan die nächste Runde mit Anpfiffzeit kennt, ist die Aufstellung hier bis 90 Minuten vor dem ersten Spiel offen.</p>
    {admin && <><p className="mini">Als Admin kannst du trotzdem jede vergangene Runde bearbeiten:</p>{rundenWahl}</>}</div>);

  const offenFuerAlle = open && open.id === round.id;
  const cur = (await q('select * from lineups where round_id=$1 and manager_id=$2', [round.id, managerId]))[0] || null;
  const prev = await D.prevLineup(round, managerId);
  const players = await D.kader(managerId, round.number);
  const isFirst = !(await q('select 1 from rounds where number < $1 limit 1', [round.number])).length;
  const matches = await q('select m.*, c1.id as c1, c2.id as c2 from matches m left join clubs c1 on c1.oldb_team_id=m.team1 left join clubs c2 on c2.oldb_team_id=m.team2 where m.round_id=$1 order by m.kickoff', [round.id]);
  const initial = cur ? cur.entries : (prev ? Object.fromEntries(Object.entries(prev.entries).filter(([pid]) => players.find(p => p.id === pid))) : {});
  const others = await q('select l.manager_id, l.updated_at from lineups l where l.round_id=$1', [round.id]);

  return (<>
    <div className="card"><div className="row between"><div><div className="eyebrow">Aufstellung</div><h2>{b.managerName[managerId]} · {round.label}</h2></div>
      <div className="small">Deadline <b>{fmtDt(round.deadline)}</b> {cur ? <span className="pill ok">gespeichert {fmtDt(cur.updated_at)}</span> : <span className="pill open">noch nicht gespeichert: es gilt die Vorrunde</span>}</div></div>

      {!offenFuerAlle && admin && <div className="note" style={{ margin: '10px 0' }}>
        <b>Admin-Korrektur.</b> Die Deadline dieser Runde ist vorbei{round.status === 'final' ? ' und die Runde ist bereits gewertet' : ''}. Für die Manager ist sie gesperrt, du kannst sie ändern.
        {round.status === 'final' && ' Achtung: Die Wertung dieser Runde ändert sich dadurch rückwirkend, Tabelle und Rangpunkte werden neu gerechnet.'}
      </div>}

      <p className="mini">Ohne Änderung gilt die Aufstellung der Vorrunde (Ziff. 5.1). Jeder neu aufgestellte Spieler kostet 50 % seines Werts; Jugendspieler (J) verlieren bei Aufstellung ihren Status (4.3.4). Positionsregel: 1 T, 3–5 V, 3–6 M, 1–3 S.</p>
      {admin && <p className="row">{b.managers.map(m => <a key={m.id} className={`btn sm ${m.id === managerId ? '' : 'sec'}`} href={`/aufstellung?m=${m.id}${gewaehlt ? `&r=${gewaehlt.number}` : ''}`}>{m.name}</a>)}</p>}
      {rundenWahl}
      <LineupEditor roundId={round.id} managerId={managerId} players={players.map(p => ({ id: p.id, name: p.name, club: p.club, base_pos: p.base_pos, positions: R.positionsOf(p), price: Number(p.price), jugend: p.jugend, contract: p.contract, slot: p.slot }))} initial={initial} prevEntries={prev ? prev.entries : null} freeIn={cur ? cur.free_in : []} isFirst={isFirst} />
    </div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">{round.label}</div><h3>Spiele</h3><table><tbody>{matches.map(m => <tr key={m.id}><td className="l">{fmtDt(m.kickoff)}</td><td className="l">{m.c1 || m.team1} – {m.c2 || m.team2}</td><td>{m.finished ? `${m.goals1}:${m.goals2}` : ''}</td></tr>)}</tbody></table><p className="mini">Quelle: OpenLigaDB. Zeiten werden täglich aktualisiert; die Deadline folgt dem frühesten Anpfiff.</p></div>
      <div className="card"><div className="eyebrow">Status</div><h3>Aufstellungen gespeichert</h3><div className="row">{b.managers.map(m => { const o = others.find(x => x.manager_id === m.id); return <span key={m.id} className={`pill ${o ? 'ok' : 'grey'}`}>{m.name} {o ? '✓' : 'Vorrunde'}</span>; })}</div></div>
    </div>
  </>);
}
