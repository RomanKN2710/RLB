import { notFound } from 'next/navigation';
import { getUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { q } from '@/lib/db';
import { fmtDt } from '@/components/ui';
import { Header as RHeader, Bids as RBids, Results as RResults, Kicker as RKicker, BlogPaste as RBlogPaste } from './RoundTools';
import { getSetting } from '@/lib/db';
import { status as inboxStatus } from '@/lib/kicker-inbox';
import { roundCheck } from '@/lib/rundencheck';

export default async function AdminRunde({ params }) {
  const __u = await getUser(); if (!__u || __u.role !== 'admin') return <div className="card"><h2>Kein Zugriff</h2><p className="mini">Dieser Bereich ist der Administration vorbehalten.</p></div>; const b = await D.base(); const round = await D.roundById((Number.isInteger(Number(params.id)) && Number(params.id) > 0) ? Number(params.id) : notFound());
  if (!round) return <div className="card">Runde nicht gefunden.</div>;
  const passed = round.deadline && new Date(round.deadline) < new Date();
  const d = await D.roundData(round, b);
  const matches = await q('select m.*, c1.id as c1, c2.id as c2 from matches m left join clubs c1 on c1.oldb_team_id=m.team1 left join clubs c2 on c2.oldb_team_id=m.team2 where m.round_id=$1 order by m.kickoff', [round.id]);
  const bids = await q('select b.*, m.name as manager_name, p.name as release_name, s.name as swap_name from bids b join managers m on m.id=b.manager_id left join players p on p.id=b.release_player_id left join players s on s.id=b.swap_out_player_id where b.round_id=$1 order by b.price desc', [round.id]);
  const kickerLog = await getSetting(`kicker_import_${round.id}`);
  const pasteLog = await getSetting(`lineup_paste_${round.id}`); const bidLog = await getSetting(`bid_paste_${round.id}`);
  const blogLog = { runs: [...(pasteLog?.runs || []).map(r => ({ ...r, art: 'Aufstellungen' })), ...(bidLog?.runs || []).map(r => ({ ...r, art: 'Gebote' }))].sort((a, b2) => (a.at < b2.at ? -1 : 1)) };
  const inbox = await inboxStatus(round.matchday).catch(() => null);
  const check = await roundCheck(round, b, d);
  const dlLocal = round.deadline ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(round.deadline)).replace(' ', 'T') : '';
  const step = (n, title, sub, state) => <div className="row between" style={{ alignItems: 'baseline' }}><h3 style={{ margin: 0 }}><span className="stepno">{n}</span>{title}</h3>{state}</div>;
  const nBids = bids.length, nSealed = bids.filter(x => x.status === 'sealed').length;
  const lineupsSaved = Object.keys(d.lineups).length;
  const impOk = kickerLog && kickerLog.games >= 9 && kickerLog.elf && !(kickerLog.errors || []).length;
  return (<>
    <div className="card"><div className="row between"><div><div className="eyebrow">Admin · Auswertung</div><h2 style={{ margin: 0 }}>{round.label}</h2></div>
      <div className="small">Deadline <b>{fmtDt(round.deadline)}</b> · {round.status === 'final' ? <span className="pill ok">final</span> : passed ? <span className="pill bad">auszuwerten</span> : <span className="pill open">offen</span>} · Spiele {matches.filter(m => m.finished).length}/{matches.length}</div></div>
      <div className="steps">
        <span className={lineupsSaved >= b.managers.length && (round.bids_resolved || !nBids) ? 'done' : ''}>1 Aufstellungen {lineupsSaved}/{b.managers.length} · Gebote {round.bids_resolved ? 'aufgelöst' : nSealed ? nSealed + ' verdeckt' : nBids ? nBids : 'keine'}</span>
        <span className={impOk ? 'done' : ''}>2 kicker {inbox?.n || 0}/9{inbox?.elf ? ' + Elf' : ''}{kickerLog ? ' · importiert' : ''}</span>
        <span className={round.status === 'final' ? 'done' : ''}>3 Abschluss {round.status === 'final' ? 'final' : check.problems.length ? check.problems.length + ' Problem(e)' : 'bereit'}</span></div>
    </div>

    <div className="card"><div className="eyebrow">Schritt 1</div>{step(1, 'Aufstellungen und Gebote', null, <span className="mini">aus der App oder vom Blog – wenn beides da ist, gilt der Blog</span>)}
      <p className="mini">Was Manager in der App eingeben, ist schon da. Den Blog einfügen (alles markieren, kopieren, auch die Handy-Ansicht): die Vorschau zeigt je Manager, was erkannt wurde und was sich gegenüber der App ändert. Danach nach der Deadline die Gebote auflösen – das bucht Käufe und Entlassungen, passt die Kader an und setzt Eventualaufträge in die Aufstellungen. Fehlende Aufstellungen gelten wie in der Vorrunde.</p>
      <RBlogPaste roundId={round.id} log={blogLog} />
      <div className="row between" style={{ marginTop: 14 }}><h3 style={{ margin: 0 }}>Gebote auflösen ({bids.length})</h3>{round.bids_resolved ? <span className="pill ok">aufgelöst</span> : nSealed ? <span className="pill open">{nSealed} verdeckt</span> : <span className="mini">keine Gebote</span>}</div>
      {bids.length ? <div className="tbl"><table><thead><tr><th className="l">Manager</th><th>Nr.</th><th className="l">Spieler</th><th>CHF</th><th className="l">Entlässt</th><th className="l">Eventual für</th><th className="l">Status</th></tr></thead><tbody>{bids.map(x => <tr key={x.id}><td className="l">{x.manager_name}</td><td>{x.priority || 1}{x.max_wins > 1 ? <span className="mini"> / max. {x.max_wins}</span> : ''}</td><td className="l">{x.pos} {x.player_name} <span className="mini">{x.club}</span></td><td>{x.price}</td><td className="l">{x.release_name || <span className="mini">aus Liste</span>}</td><td className="l">{x.swap_name || '–'}</td><td className="l">{x.status === 'sealed' ? <span className="pill grey">verdeckt</span> : x.status === 'won' ? <span className="pill ok">Zuschlag</span> : x.status === 'invalid' ? <span className="pill bad">ungültig</span> : <span className="pill grey">kein Zuschlag</span>} <span className="mini">{x.reason}</span></td></tr>)}</tbody></table></div> : null}
      <RBids roundId={round.id} resolved={round.bids_resolved} passed={!!passed} final={round.status === 'final'} /></div>

    <div className="card"><div className="eyebrow">Schritt 2</div>{step(2, 'kicker-Daten übernehmen', null, <span className="mini">nach den Spielen – per Skript oder von Hand</span>)}
      <p className="mini">Die neun Seiten «Aufstellung» und die «Elf des Tages» vom Handy senden (Skript) oder unten als Quelltext einfügen, dann importieren. Einsätze, Assists, Tore, Karten, Team der Runde und Spieler des Tages kommen von dort; Punkte und Zu-null aus den Resultaten. Jeder aufgestellte Spieler muss danach «Startelf», «eingewechselt» oder «Bank» sein.</p>
      <RKicker roundId={round.id} lastLog={kickerLog} inbox={inbox ? JSON.parse(JSON.stringify(inbox)) : null} /></div>

    <div className="card" style={{ borderLeft: `4px solid ${check.problems.length ? 'var(--bad)' : check.warnings.length ? 'var(--warn)' : 'var(--good)'}` }}><div className="eyebrow">Schritt 3</div>{step(3, 'Auswerten und abschliessen', null, <span className={`pill ${check.problems.length ? 'bad' : check.warnings.length ? 'open' : 'ok'}`}>{check.problems.length ? `${check.problems.length} Problem(e)` : 'Rundencheck ok'}{check.warnings.length ? ` · ${check.warnings.length} Hinweis(e)` : ''}</span>)}
      {check.problems.length > 0 && <ul style={{ margin: '6px 0', paddingLeft: 18 }}>{check.problems.map((x, i) => <li key={i} className="delta down">{x.text}</li>)}</ul>}
      {check.warnings.length > 0 && <ul className="small" style={{ margin: '4px 0', paddingLeft: 18 }}>{check.warnings.map((x, i) => <li key={i}>{x.text}</li>)}</ul>}
      {check.infos.length > 0 && <div className="mini">{check.infos.map(x => x.text).join(' · ')}</div>}
      <RHeader round={{ id: round.id, label: round.label, status: round.status, tdr: round.tdr || [], sdt: round.sdt || '', deadlineLocal: dlLocal, bidsResolved: round.bids_resolved }} managers={b.managers.map(m => ({ id: m.id, name: m.name }))} corrections={d.corrections.map(k => ({ id: k.id, manager: b.managerName[k.manager_id], text: k.text, delta: k.delta }))} /></div>

    <details className="card"><summary><b>Aufstellungen &amp; Spielerwerte</b> <span className="mini">Einsatz, Assists, Tore, Karten, Team der Runde je Spieler – nur zum Nachsehen und für Korrekturen</span></summary>
      {!passed && <div className="note" style={{ marginTop: 8 }}>Deadline noch nicht vorbei: Aufstellungen können sich noch ändern. Fehlende werden nach der Deadline automatisch aus der Vorrunde übernommen.</div>}
      <p className="row" style={{ marginTop: 8 }}><span className="mini">Aufstellung bearbeiten:</span>{b.managers.map(m => <a key={m.id} className="btn sm sec" href={`/aufstellung?m=${m.id}&r=${round.number}`}>{m.name}</a>)}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(540px, 1fr))', gap: 14 }}>{b.managers.map(m => { const lu = d.lineups[m.id]; const rows = lu ? Object.entries(lu.entries).map(([pid, e]) => { const p = b.players[pid]; const r = d.results[pid] || {}; return { pid, name: p?.name || pid, club: p?.club, pos: e.pos, clubpts: d.clubRes[p?.club]?.pts, cs: d.clubRes[p?.club]?.cs, start: r.start || 0, assist: r.assist || 0, tore: r.tore || 0, karten: r.karten || 0, tdr: r.tdr || 0, kpos: r.kpos || null, locked: !!r.locked }; }) : [];
        return <RResults key={m.id} roundId={round.id} managerId={m.id} managerName={m.name} rows={rows} totals={d.totals[m.id]} />; })}</div></details>
    <details className="card"><summary><b>Spiele &amp; Vereinsergebnisse</b> <span className="mini">{matches.filter(m => m.finished).length}/{matches.length} beendet · Punkte 3/1/0 und Zu-null aus OpenLigaDB</span></summary>
      <table style={{ marginTop: 8 }}><tbody>{matches.map(m => { const c1 = d.clubRes[m.c1], c2 = d.clubRes[m.c2]; return <tr key={m.id}><td className="l">{fmtDt(m.kickoff)}</td><td className="l">{m.c1} – {m.c2}</td><td>{m.finished ? `${m.goals1}:${m.goals2}` : '–'}</td><td className="l mini">{c1 ? `${m.c1} ${c1.pts}P${c1.cs ? ' zu null' : ''} · ${m.c2} ${c2.pts}P${c2.cs ? ' zu null' : ''}` : ''}</td></tr>; })}</tbody></table>
      <p className="mini">Fehlt ein Resultat: Sync in der Admin-Übersicht unter «Werkzeuge».</p></details>
  </>);
}
