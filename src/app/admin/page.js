import Link from 'next/link';
import { getUser } from '@/lib/auth';
import * as D from '@/lib/data';
import { q, getSetting } from '@/lib/db';
import { postponedCandidates } from '@/lib/oldb';
import { fmtDt } from '@/components/ui';
import { Sync, Split, UserRow, CreateUser, Vorsaison, Manual, PoolPaste, MatchdayImport } from './AdminTools';
import { runPending, status as migrationStatus } from '@/lib/migrations';
import { allStatus as inboxAll } from '@/lib/kicker-inbox';
import { SquadSync, Leavers } from './SquadTools';
import { rlbLeavers } from '@/lib/squads';
import clubSlugs from '../../../db/seed/kicker-clubs.json';

/* Admin-Übersicht: 1) Spieltage auswerten (Aufstellungen → kicker-Seiten → Import → abschliessen), 2) Kader & Pool, 3) Konten & Einstellungen, 4) Werkzeuge. */
export default async function Admin() {
  const __u = await getUser(); if (!__u || __u.role !== 'admin') return null;
  const justRun = await runPending(__u.id); const migrations = await migrationStatus();
  const b = await D.base(); const rounds = await D.rounds(); const open = await D.openRound();
  const users = await q('select u.*, m.name as manager_name from users u left join managers m on m.id=u.manager_id order by u.role, u.name');
  const lastSync = await getSetting('last_sync'); const lastCur = await getSetting('last_sync_current');
  const bidCounts = await q("select round_id, count(*)::int as n from bids where status='sealed' group by round_id");
  const lineupCounts = await q('select round_id, count(*)::int as n, count(*) filter (where updated_by is not null)::int as manual from lineups group by round_id');
  const lockedRows = await q('select round_id, count(*)::int as n from results where locked group by round_id');
  const finished = await q('select round_id, count(*)::int as n, count(*) filter (where finished)::int as f from matches group by round_id');
  const postponed = await postponedCandidates();
  const vorsaison = (await getSetting('vorsaison_reihenfolge')) || [];
  const inboxRaw = await inboxAll().catch(() => []);
  const settings = await q("select key, value from settings where key like 'kicker_import_%'");
  const importOf = r => (settings.find(s => s.key === `kicker_import_${r.id}`) || {}).value || null;
  const now = Date.now();
  const lastPlayed = [...rounds].filter(r => r.type === 'regulaer' && r.deadline && new Date(r.deadline).getTime() < now).pop();
  const show = rounds.filter(r => r.type === 'nachtrag' || r.matchday <= (lastPlayed ? lastPlayed.matchday + 1 : 2));
  const cnt = (list, r) => (list.find(x => x.round_id === r.id) || {});
  const blogUrl = process.env.BLOG_URL || 'https://rotisseryleaguebundesliga.blogspot.com';
  return (<>
    <div className="card"><div className="eyebrow">Admin</div><h2>Spieltage auswerten</h2>
      <p className="mini">Ablauf je Spieltag: Aufstellungen aus dem <a href={blogUrl} target="_blank" rel="noreferrer">Blog</a> ins <Link href="/archiv">Archiv</Link> und in die Runde übernehmen → nach den Spielen die neun kicker-Aufstellungsseiten und die Elf des Tages vom Handy senden → importieren → Bericht prüfen (jeder aufgestellte Spieler muss «Startelf», «eingewechselt» oder «Bank» sein) → Runde abschliessen.</p>
      <div className="tbl"><table><thead><tr><th className="l">Spieltag</th><th className="l">Deadline</th><th className="l">Status</th><th>Aufst.</th><th>Gebote</th><th className="l">kicker-Seiten</th><th className="l">Import</th><th className="l"></th></tr></thead><tbody>
        {show.map(r => { const passed = r.deadline && new Date(r.deadline).getTime() < now; const isOpen = open && open.id === r.id;
          const ib = inboxRaw.find(x => x.matchday === r.matchday && r.type === 'regulaer'); const imp = importOf(r); const c = imp?.counts || {}; const bad = (c.nicht_gefunden || 0) + (c.spiel_fehlt || 0) + (c.verein_unbekannt || 0) + (imp?.errors?.length || 0);
          const fin = cnt(finished, r); const lu = cnt(lineupCounts, r); const locked = cnt(lockedRows, r).n || 0;
          return (<tr key={r.id}><td className="l"><b>{r.label}</b>{r.type === 'nachtrag' && <span className="badge">Nachtrag</span>}</td>
            <td className="l">{fmtDt(r.deadline)}{r.deadline_manual && <span className="badge v">manuell</span>}</td>
            <td className="l">{r.status === 'final' ? <span className="pill ok">final</span> : isOpen ? <span className="pill open">offen</span> : passed ? <span className="pill bad">auszuwerten</span> : <span className="pill grey">kommend</span>}{fin.n > 0 && <div className="mini">{fin.f}/{fin.n} Spiele beendet</div>}</td>
            <td>{lu.n || 0}/{b.managers.length}</td><td>{cnt(bidCounts, r).n || 0}{r.bids_resolved && <span className="badge">aufgelöst</span>}</td>
            <td className="l">{ib ? <span className={`pill ${ib.n >= 9 && ib.elf ? 'ok' : 'open'}`}>{ib.n}/9{ib.elf ? ' + Elf' : ', Elf fehlt'}</span> : <span className="mini">–</span>}</td>
            <td className="l">{imp ? <div className="mini">{new Date(imp.at).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}: {imp.games ?? '?'} Spiele{imp.elf ? ' + Elf' : ''} · Startelf {c.startelf || 0}, eingew. {c.eingewechselt || 0}, Bank {c.bank || 0}{c.nicht_im_kader ? `, nicht im Kader ${c.nicht_im_kader}` : ''}{bad > 0 ? <b className="delta down"> · {bad} Problem(e)</b> : imp.counts ? <span className="pill ok" style={{ marginLeft: 4 }}>vollständig</span> : null}{locked > 0 && ` · ${locked} gesperrt`}</div> : <span className="mini">noch nicht</span>}</td>
            <td className="l"><span className="row" style={{ gap: 4 }}>{ib && (ib.n > 0 || ib.elf) && r.type === 'regulaer' && <MatchdayImport matchday={r.matchday} />}<Link className="btn sm sec" href={`/admin/runde/${r.id}`}>Auswerten</Link></span></td></tr>); })}
      </tbody></table></div>
      <p className="mini">Offen ist immer nur die nächste Runde (kleinste Nummer mit Deadline in der Zukunft). Deadlines folgen dem Spielplan (90 Min. vor dem ersten Anpfiff) und können pro Runde überschrieben werden. Weitere Runden erscheinen, sobald sie an der Reihe sind.</p>
      {postponed.length > 0 && <div className="note" style={{ marginTop: 8 }}><b>Verschobene Spiele</b> (Kandidaten für Nachtragsrunden, Ziff. 8): {postponed.map(m => <div key={m.id} className="row">{fmtDt(m.kickoff)} · {b.teamToClub[m.team1]} – {b.teamToClub[m.team2]} (aktuell in {m.round_label}) <Split matchId={m.id} /></div>)}</div>}
    </div>

    <details className="card"><summary><b>kicker-Seiten vom Handy senden</b> <span className="mini">Skript einrichten</span></summary>
      <p className="mini" style={{ marginTop: 8 }}><a className="btn sm sec" href="/api/kicker-inbox/rlb.user.js">Tampermonkey-Skript installieren (rlb.user.js)</a> In Firefox für Android mit Tampermonkey öffnen; Adresse und Schlüssel sind eingesetzt. Danach jede kicker-Aufstellungsseite und die Elf des Tages nur noch öffnen, unten erscheint die Bestätigung. Android reicht kicker-Links sonst an die kicker-App weiter: in Firefox unter Einstellungen → Erweitert → «Links in Apps öffnen» auf «Nie» stellen.</p>
      {process.env.CRON_SECRET && <details><summary className="mini">Alternative ohne Tampermonkey: Lesezeichen-Skript für Chrome / Samsung Internet</summary><p className="mini">Text kopieren, in Chrome ein Lesezeichen anlegen und dessen Adresse durch diesen Text ersetzen (Name z. B. «rlb»). Auf jeder kicker-Aufstellungsseite «rlb» in die Adresszeile tippen und das Lesezeichen aus den Vorschlägen antippen.</p>
        <textarea readOnly rows={3} style={{ width: '100%', fontSize: 11 }} value={`javascript:fetch('https://${process.env.VERCEL_PROJECT_PRODUCTION_URL || 'rlb-nine.vercel.app'}/api/kicker-inbox?key=${process.env.CRON_SECRET}',{method:'POST',body:document.documentElement.outerHTML}).then(r=>r.text()).then(t=>alert(t)).catch(e=>alert('Fehler: '+e))`} /></details>}
    </details>

    <details className="card"><summary><b>Kader &amp; Spielerpool</b> <span className="mini">kicker-Kader, Abgänge, manuelle Käufe und Buchungen</span></summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <SquadSync status={await getSetting('squads_sync')} slugs={Object.values(clubSlugs)} season={process.env.KICKER_SEASON || '2026-27'} />
        <Leavers items={(await rlbLeavers(b)).map(x => ({ player: { id: x.player.id, name: x.player.name, club: x.player.club, price: Number(x.player.price) }, manager: b.managerName[x.player.manager_id], since: x.since }))} />
        <div className="adminbox"><h3>Manueller Kauf / Buchung</h3><Manual managers={b.managers.map(m => ({ id: m.id, name: m.name }))} clubs={b.clubs.map(c => c.id)} /></div>
        <PoolPaste />
        <div className="card"><div className="eyebrow">kicker-Kader</div><h3>Letzte Änderungen (Zu- und Abgänge, Positionen)</h3>{(await q('select l.*, p.name as rlb_name, m.name as manager_name from squad_log l left join players p on p.id=l.rlb_player_id left join managers m on m.id=p.manager_id order by l.at desc limit 40')).map(l => <div key={l.id} className="small">{new Date(l.at).toLocaleDateString('de-CH')} · <b>{l.type}</b> {l.name} {l.type === 'wechsel' ? `${l.club_from} → ${l.club_to}` : l.type === 'abgang' ? `${l.club_from} → ?` : l.type === 'position' ? `${l.club_to}: ${l.pos_from} → ${l.pos_to}` : `→ ${l.club_to} (${l.pos_to})`}{l.rlb_name && <span className="badge v">RLB: {l.manager_name}</span>}</div>)}</div>
      </div></details>

    <details className="card"><summary><b>Konten &amp; Einstellungen</b> <span className="mini">Benutzer, Vorsaison-Reihenfolge</span></summary>
      <div className="grid2" style={{ marginTop: 8 }}>
        <div><div className="eyebrow">Benutzer</div>
          <div className="tbl"><table><thead><tr><th className="l">Name</th><th className="l">E-Mail</th><th className="l">Rolle</th><th className="l">Team</th><th className="l"></th></tr></thead><tbody>{users.map(x => <tr key={x.id}><td className="l">{x.name}</td><td className="l">{x.email}</td><td className="l">{x.role}{x.must_change_pw && <span className="badge v">Startpasswort</span>}</td><td className="l">{x.manager_name || '–'}</td><td className="l"><UserRow userId={x.id} /></td></tr>)}</tbody></table></div>
          <CreateUser managers={b.managers.map(m => ({ id: m.id, name: m.name }))} /></div>
        <div><div className="eyebrow">Vorsaison-Reihenfolge</div><p className="mini">Für Gleichstände bei Geboten vor der ersten gewerteten Runde (Ziff. 7.1: schlechtester Tabellenplatz der Vorsaison zuerst). Danach zählt die aktuelle Tabelle automatisch.</p>
          <Vorsaison list={vorsaison} managers={b.managers.map(m => m.name)} /></div>
      </div></details>

    <details className="card"><summary><b>Werkzeuge</b> <span className="mini">Spielplan, Datenabzug, Blog-Archiv, einmalige Korrekturen</span></summary>
      <div className="stack" style={{ marginTop: 8 }}>
        <div className="row"><Sync /><span className="mini">Spielplan und Resultate (OpenLigaDB). Letzter Voll-Sync: {lastSync ? fmtDt(lastSync.at) : 'nie'} · aktuelle Spieltage: {lastCur ? fmtDt(lastCur.at) : 'nie'}. Beim Seitenaufruf wird automatisch aktualisiert (stündlich Resultate, täglich der ganze Spielplan).</span></div>
        <div className="row"><a className="btn sm sec" href="/api/export">Datenabzug (JSON)</a><span className="mini">Alle Daten ohne Passwörter, zum Nachprüfen ausserhalb der App.</span></div>
        <div className="row"><Link className="btn sm sec" href="/archiv">Blog-Archiv</Link><span className="mini">Alle Blog-Einträge je Runde neben Aufstellung und Kader; neue Einträge per Copy-Paste einspielen.</span></div>
        <details><summary className="mini">Einmalige Datenkorrekturen: {migrations.filter(m => m.at).length} von {migrations.length} eingespielt{justRun.length ? ` (${justRun.length} soeben)` : ''}{migrations.some(m => m.error) ? ' – Fehler!' : ''}</summary>
          <p className="mini">Nachträge und Korrekturen aus den Abgleichen laufen automatisch beim Aufruf dieser Seite, jeder Schritt genau einmal.</p>
          {migrations.map(m => <details key={m.key}><summary className="mini">{m.error ? '✗' : m.at ? '✓' : '…'} {m.title}{m.at ? ` – ${new Date(m.at).toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}` : ''}{m.error ? ` – Fehler: ${m.error}` : ''}</summary><ul className="mini" style={{ paddingLeft: 18 }}>{m.log.map((l, i) => <li key={i}>{l}</li>)}</ul></details>)}
        </details>
      </div></details>
  </>);
}
