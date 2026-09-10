import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { q } from '@/lib/db';
import { fmtDt } from '@/components/ui';
import BidForm from './BidForm';
import FreeList from './FreeList';

export default async function Markt() {
  const u = await requireUser(); const admin = u.role === 'admin';
  const b = await D.base(); const open = await D.openRound(); const pool = await D.freeAgents(b); const free = pool.filter(p => !p.taken);
  const managerId = u.manager_id;
  let mine = null, budget = null, kader = [], lineup = null;
  if (open && managerId) {
    mine = (await q('select * from bids where round_id=$1 and manager_id=$2', [open.id, managerId]))[0] || null;
    budget = await D.budgetLeft(managerId); kader = await D.kader(managerId, open.number);
    lineup = (await q('select * from lineups where round_id=$1 and manager_id=$2', [open.id, managerId]))[0] || await D.prevLineup(open, managerId);
  }
  const submitted = open ? await q('select manager_id from bids where round_id=$1', [open.id]) : [];
  const published = await q("select b.*, m.name as manager_name, r.label as round_label, r.number as rnum, p.name as release_name from bids b join managers m on m.id=b.manager_id join rounds r on r.id=b.round_id left join players p on p.id=b.release_player_id where b.status<>'sealed' order by r.number desc, b.price desc");
  const releases = await q("select t.*, m.name as manager_name, r.label as round_label, r.number as rnum from transfers t join managers m on m.id=t.manager_id left join rounds r on r.id=t.round_id where t.type='entlassung' order by t.created_at desc limit 20");
  const prevRound = open ? (await q('select * from rounds where number < $1 order by number desc limit 1', [open.number]))[0] : null;
  const tag = s => s === 'won' ? <span className="tag-won">Zuschlag</span> : s === 'invalid' ? <span className="tag-inv">ungültig</span> : <span className="tag-lost">kein Zuschlag</span>;
  return (<>
    <div className="card"><div className="row between"><div><div className="eyebrow">Transfermarkt</div><h2>{open ? `Gebote für ${open.label}` : 'Keine offene Runde'}</h2></div>
      {open && <div className="small">Gebots-Deadline <b>{fmtDt(open.deadline)}</b></div>}</div>
      {open && <div className="row" style={{ marginTop: 6 }}>{b.managers.map(m => <span key={m.id} className={`pill ${submitted.find(s => s.manager_id === m.id) ? 'ok' : 'grey'}`}>{m.name} {submitted.find(s => s.manager_id === m.id) ? 'Gebot ✓' : '–'}</span>)}</div>}
      <p className="mini">Gebote sind verdeckt: nur der Admin sieht sie, und erst nach der Auflösung werden alle veröffentlicht (Ziff. 7.1). Höchstgebot gewinnt, bei Gleichstand der schlechtere Tabellenplatz. Budget CHF 50 pro Saison (7.4), ab CHF 20 Vertragspflicht.</p>
    </div>
    {open && managerId && <div className="card"><div className="eyebrow">Mein Gebot</div><h2>{mine ? <>Gebot abgegeben <span className="pill ok">verdeckt</span></> : 'Neues Gebot'}</h2>
      {mine && <div className="kv" style={{ marginBottom: 10 }}><b>Spieler</b><span>{mine.pos} {mine.player_name} ({mine.club})</span><b>Gebot</b><span>CHF {mine.price}</span><b>Entlassung</b><span>{(kader.find(p => p.id === mine.release_player_id) || {}).name || mine.release_player_id}</span><b>Eventualauftrag</b><span>{mine.swap_out_player_id ? `ja, ersetzt ${(b.players[mine.swap_out_player_id] || {}).name}` : 'nein'}</span></div>}
      <BidForm pool={free} clubs={b.clubs.map(c => c.id)} kader={kader.map(p => ({ id: p.id, label: `${p.base_pos} ${p.name} (${p.club}, ${p.price})` }))} lineup={lineup ? Object.keys(lineup.entries).map(pid => ({ id: pid, label: (b.players[pid] || {}).name })) : []} budget={budget} hasBid={!!mine} mine={mine} minBid={R.MIN_BID} />
    </div>}
    <div className="card"><div className="eyebrow">Ziff. 7.1</div><h2>Freie Spieler <span className="mini">{free.length} im Pool · {pool.length - free.length} in RLB-Kadern</span></h2>
      <p className="mini">Der Pool entsteht aus den kicker-Aufstellungen jeder Runde (Startelf und Einwechslungen, Position laut kicker-Spielbericht) und wächst mit jedem Spieltag. Neue Bundesliga-Spieler erscheinen, sobald sie erstmals gespielt haben; ein Gebot ist auch auf Spieler möglich, die noch nicht im Pool stehen (Name frei eintippen).</p>
      <FreeList pool={free} /></div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">Veröffentlicht</div><h2>Gebote &amp; Zuteilungen</h2>
        {published.length ? <div className="tbl"><table><thead><tr><th className="l">Runde</th><th className="l">Manager</th><th className="l">Spieler</th><th>CHF</th><th className="l">Entlässt</th><th className="l">Ergebnis</th></tr></thead><tbody>{published.map(x => <tr key={x.id}><td className="l">{x.round_label}</td><td className="l">{x.manager_name}</td><td className="l">{x.pos} {x.player_name} <span className="mini">{x.club}</span></td><td>{x.price}</td><td className="l">{x.release_name || ''}</td><td className="l">{tag(x.status)} <span className="mini">{x.reason}</span></td></tr>)}</tbody></table></div> : <div className="mini">noch keine</div>}</div>
      <div className="card"><div className="eyebrow">Ziff. 7.3</div><h2>Entlassene Spieler</h2>{releases.length ? <ul className="clean small">{releases.map(t => <li key={t.id}>{t.round_label || '–'}: {t.manager_name} entlässt {t.player_name} (Wert {t.price}){prevRound && t.round_id === prevRound.id && <span className="badge v">Mindestgebot {t.price} in dieser Runde</span>}</li>)}</ul> : <div className="mini">keine</div>}<p className="mini">Der entlassende Manager darf erst eine Runde später bieten; in der Folgerunde gilt der alte Wert als Mindestgebot.</p></div>
    </div>
  </>);
}
