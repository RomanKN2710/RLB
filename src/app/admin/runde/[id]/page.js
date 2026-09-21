import { getUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { q } from '@/lib/db';
import { fmtDt } from '@/components/ui';
import { Header as RHeader, Bids as RBids, Results as RResults, Goals as RGoals, Kicker as RKicker, LineupPaste as RLineupPaste } from './RoundTools';
import { getSetting } from '@/lib/db';
import { status as inboxStatus } from '@/lib/kicker-inbox';
import { roundCheck } from '@/lib/rundencheck';

export default async function AdminRunde({ params }) {
  const __u = await getUser(); if (!__u || __u.role !== 'admin') return null; const b = await D.base(); const round = await D.roundById(Number(params.id));
  if (!round) return <div className="card">Runde nicht gefunden.</div>;
  const passed = round.deadline && new Date(round.deadline) < new Date();
  const d = await D.roundData(round, b);
  const matches = await q('select m.*, c1.id as c1, c2.id as c2 from matches m left join clubs c1 on c1.oldb_team_id=m.team1 left join clubs c2 on c2.oldb_team_id=m.team2 where m.round_id=$1 order by m.kickoff', [round.id]);
  const bids = await q('select b.*, m.name as manager_name, p.name as release_name, s.name as swap_name from bids b join managers m on m.id=b.manager_id left join players p on p.id=b.release_player_id left join players s on s.id=b.swap_out_player_id where b.round_id=$1 order by b.price desc', [round.id]);
  const kickerLog = await getSetting(`kicker_import_${round.id}`);
  const pasteLog = await getSetting(`lineup_paste_${round.id}`);
  const inbox = await inboxStatus(round.matchday).catch(() => null);
  const check = await roundCheck(round, b, d);
  const dlLocal = round.deadline ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(round.deadline)).replace(' ', 'T') : '';
  return (<>
    <div className="adminbox"><h3>Admin · {round.label}</h3>
      <div className="kv"><b>Deadline</b><span>{fmtDt(round.deadline)} {round.deadline_manual ? '(manuell)' : '(aus Spielplan)'}</span><b>Status</b><span>{round.status}{passed ? ' · Deadline vorbei' : ' · offen'}</span><b>Spiele</b><span>{matches.filter(m => m.finished).length}/{matches.length} beendet</span></div>
      <RHeader round={{ id: round.id, label: round.label, status: round.status, tdr: round.tdr || [], sdt: round.sdt || '', deadlineLocal: dlLocal, bidsResolved: round.bids_resolved }} managers={b.managers.map(m => ({ id: m.id, name: m.name }))} corrections={d.corrections.map(k => ({ id: k.id, manager: b.managerName[k.manager_id], text: k.text, delta: k.delta }))} />
    </div>
    <div className={`card ${check.ok ? '' : ''}`} style={{ borderLeft: `4px solid ${check.problems.length ? 'var(--bad)' : check.warnings.length ? 'var(--warn)' : 'var(--good)'}` }}><div className="eyebrow">Rundencheck</div>
      <h3 style={{ margin: '4px 0' }}>{check.problems.length ? `${check.problems.length} Problem(e)` : 'Keine Probleme'}{check.warnings.length ? ` · ${check.warnings.length} Hinweis(e)` : ''}</h3>
      {check.problems.length > 0 && <ul style={{ margin: '4px 0', paddingLeft: 18 }}>{check.problems.map((x, i) => <li key={i} className="delta down">{x.text}</li>)}</ul>}
      {check.warnings.length > 0 && <ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>{check.warnings.map((x, i) => <li key={i}>{x.text}</li>)}</ul>}
      {check.infos.length > 0 && <div className="mini">{check.infos.map(x => x.text).join(' · ')}</div>}
      <p className="mini">Geprüft: Aufstellungen (11 Spieler, Positionen, Spielberechtigung), Kadergrösse und Verträge, Spiele, kicker-Import und Vollständigkeit, Elf des Tages (11 Namen und Spieler des Tages in der Datenbank, Punkte bei den Aufgestellten), Gebote.</p></div>
    <div className="grid2">
      <div className="card"><h3>Spiele &amp; Vereinsergebnisse</h3><table><tbody>{matches.map(m => { const c1 = d.clubRes[m.c1], c2 = d.clubRes[m.c2]; return <tr key={m.id}><td className="l">{fmtDt(m.kickoff)}</td><td className="l">{m.c1} – {m.c2}</td><td>{m.finished ? `${m.goals1}:${m.goals2}` : '–'}</td><td className="l mini">{c1 ? `${m.c1} ${c1.pts}P${c1.cs ? ' zu null' : ''} · ${m.c2} ${c2.pts}P${c2.cs ? ' zu null' : ''}` : ''}</td></tr>; })}</tbody></table><p className="mini">Punkte 3/1/0 und Zu-null werden aus den OpenLigaDB-Resultaten abgeleitet. Fehlt ein Resultat, Sync auslösen (Admin-Übersicht).</p>
        <div className="eyebrow">Torschützen (OpenLigaDB)</div><div className="small">{matches.flatMap(m => (m.goals || []).map((g, i) => <span key={m.id + '-' + i} className={g.ownGoal ? 'muted' : ''}>{g.name}{g.ownGoal ? ' (ET)' : ''}{g.penalty ? ' (E)' : ''} {g.minute}&#39;</span>)).reduce((acc, el, i) => acc.concat(i ? [', ', el] : [el]), [])}</div>
        <RGoals roundId={round.id} /></div>
      <div className="card"><h3>Gebote ({bids.length})</h3>{bids.length ? <div className="tbl"><table><thead><tr><th className="l">Manager</th><th className="l">Spieler</th><th>CHF</th><th className="l">Entlässt</th><th className="l">Eventual für</th><th className="l">Status</th></tr></thead><tbody>{bids.map(x => <tr key={x.id}><td className="l">{x.manager_name}</td><td className="l">{x.pos} {x.player_name} <span className="mini">{x.club}</span></td><td>{x.price}</td><td className="l">{x.release_name}</td><td className="l">{x.swap_name || '–'}</td><td className="l">{x.status} <span className="mini">{x.reason}</span></td></tr>)}</tbody></table></div> : <div className="mini">keine Gebote</div>}
        <RBids roundId={round.id} resolved={round.bids_resolved} passed={!!passed} /></div>
    </div>
    <div className="adminbox"><h3>Aufstellungen aus dem Blog einfügen</h3><p className="mini">Für Manager, die ihre Aufstellung im Blog statt in der App abgeben. Der Admin darf auch nach der Deadline speichern; hat ein Manager schon in der App gespeichert, zeigt die Vorschau den Unterschied, und der Blog hat Vorrang. Unzulässige Aufstellungen (Ziff. 5.1) werden nicht übernommen, dann gilt die Vorrunde.</p><RLineupPaste roundId={round.id} />
      {pasteLog?.runs?.length > 0 && <details style={{ marginTop: 8 }}><summary className="mini">Bisherige Übernahmen aus dem Blog ({pasteLog.runs.length})</summary>
        {pasteLog.runs.slice().reverse().map((r, i) => <div key={i} className="mini" style={{ borderTop: '1px solid var(--line)', padding: '4px 0' }}><b>{fmtDt(r.at)}</b> · {r.by} · {r.n} übernommen<ul style={{ margin: '2px 0 0', paddingLeft: 18 }}>{(r.log || []).map((l, j) => <li key={j}>{l}</li>)}</ul></div>)}</details>}</div>
    <div className="adminbox"><h3>kicker-Seiten importieren</h3><p className="mini">Grundlage sind die Quelltexte der kicker-Seiten «Aufstellung» (Startelf, Reservebank, Wechsel, Tore, Vorlagen, Karten) je Spiel und «Elf des Tages» je Spieltag, gesendet vom Handy oder hier eingefügt. Der Bericht zeigt für jeden aufgestellten Spieler, ob er auf der Seite gefunden wurde; «nicht auf der Seite» mit Hinweis heisst Namensabgleich prüfen. Vorlagen bei Eigentoren werden nicht gezählt, aber im Protokoll genannt.</p><RKicker roundId={round.id} lastLog={kickerLog} inbox={inbox ? { matchday: inbox.matchday, n: inbox.n, elf: inbox.elf, matches: inbox.matches.map(m => ({ title: m.title })) } : null} /></div>
    <div className="card"><div className="eyebrow">Resultate (kicker)</div><h2>Aufstellungen &amp; Spielerwerte</h2><p className="mini">Einsatz, Assists, Tore, Karten (Gelb 1, Gelb-Rot 2, Rot 3, Rot mit Gelb 4) und Team der Runde kommen aus kicker; Tore zusätzlich aus OpenLigaDB. Manuelle Änderungen sperren die Zeile gegen den Import. Punkte und Shutouts werden berechnet.</p>
      {!passed && <div className="note">Deadline noch nicht vorbei: Aufstellungen können sich noch ändern. Fehlende Aufstellungen werden nach der Deadline automatisch aus der Vorrunde übernommen.</div>}
      <p className="row" style={{ marginTop: 6 }}><span className="mini">Aufstellung bearbeiten (nur Admin, auch nach der Deadline):</span>
        {b.managers.map(m => <a key={m.id} className="btn sm sec" href={`/aufstellung?m=${m.id}&r=${round.number}`}>{m.name}</a>)}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(540px, 1fr))', gap: 14 }}>{b.managers.map(m => { const lu = d.lineups[m.id]; const rows = lu ? Object.entries(lu.entries).map(([pid, e]) => { const p = b.players[pid]; const r = d.results[pid] || {}; return { pid, name: p?.name || pid, club: p?.club, pos: e.pos, clubpts: d.clubRes[p?.club]?.pts, cs: d.clubRes[p?.club]?.cs, start: r.start || 0, assist: r.assist || 0, tore: r.tore || 0, karten: r.karten || 0, tdr: r.tdr || 0, kpos: r.kpos || null, locked: !!r.locked }; }) : [];
        return <RResults key={m.id} roundId={round.id} managerId={m.id} managerName={m.name} rows={rows} totals={d.totals[m.id]} />; })}</div></div>
  </>);
}
