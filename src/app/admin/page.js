import Link from 'next/link';
import { getUser } from '@/lib/auth';
import * as D from '@/lib/data';
import { q, getSetting } from '@/lib/db';
import { postponedCandidates } from '@/lib/oldb';
import { fmtDt } from '@/components/ui';
import { Sync, Split, UserRow, CreateUser, Vorsaison, Manual, PoolPaste } from './AdminTools';
import { SquadSync, Leavers } from './SquadTools';
import { rlbLeavers } from '@/lib/squads';
import clubSlugs from '../../../db/seed/kicker-clubs.json';

export default async function Admin() {
  const __u = await getUser(); if (!__u || __u.role !== 'admin') return null;
  const b = await D.base(); const rounds = await D.rounds(); const open = await D.openRound();
  const users = await q('select u.*, m.name as manager_name from users u left join managers m on m.id=u.manager_id order by u.role, u.name');
  const lastSync = await getSetting('last_sync'); const lastCur = await getSetting('last_sync_current');
  const bidCounts = await q("select round_id, count(*)::int as n from bids where status='sealed' group by round_id");
  const lineupCounts = await q('select round_id, count(*)::int as n from lineups group by round_id');
  const postponed = await postponedCandidates();
  const vorsaison = (await getSetting('vorsaison_reihenfolge')) || [];
  const now = Date.now();
  return (<>
    <div className="adminbox"><h3>Admin · Aufstellungs-Blog</h3>
      <p className="mini"><Link className="btn sm sec" href="/admin/blog">Rohansicht öffnen</Link> Zeigt, was die App im Blog (rotisseryleaguebundesliga.blogspot.com) liest – Vorstufe für die automatische Übernahme der Aufstellungen nach der Deadline.</p></div>
    <div className="adminbox"><h3>Admin · Spielplan (OpenLigaDB)</h3>
      <div className="row"><Sync /><span className="mini">Letzter Voll-Sync: {lastSync ? fmtDt(lastSync.at) : 'nie'} · aktuelle Spieltage: {lastCur ? fmtDt(lastCur.at) : 'nie'}. Beim Seitenaufruf wird automatisch aktualisiert (stündlich Resultate, täglich der ganze Spielplan).</span></div>
      {postponed.length > 0 && <div className="note" style={{ marginTop: 8 }}><b>Verschobene Spiele</b> (Kandidaten für Nachtragsrunden, Ziff. 8): {postponed.map(m => <div key={m.id} className="row">{fmtDt(m.kickoff)} · {b.teamToClub[m.team1]} – {b.teamToClub[m.team2]} (aktuell in {m.round_label}) <Split matchId={m.id} /></div>)}</div>}
    </div>
    <div className="card"><div className="eyebrow">Runden</div><h2>Alle Runden</h2>
      <div className="tbl"><table><thead><tr><th>#</th><th className="l">Runde</th><th className="l">Deadline</th><th className="l">Status</th><th>Aufst.</th><th>Gebote</th><th className="l"></th></tr></thead><tbody>
        {rounds.map(r => { const passed = r.deadline && new Date(r.deadline).getTime() < now; const isOpen = open && open.id === r.id; return (
          <tr key={r.id}><td>{r.number}</td><td className="l"><b>{r.label}</b>{r.type === 'nachtrag' && <span className="badge">Nachtrag</span>}</td><td className="l">{fmtDt(r.deadline)}{r.deadline_manual && <span className="badge v">manuell</span>}</td>
            <td className="l">{r.status === 'final' ? <span className="pill ok">final</span> : isOpen ? <span className="pill open">offen (Aufstellung/Gebote)</span> : passed ? <span className="pill bad">auszuwerten</span> : <span className="pill grey">kommend</span>}{r.bids_resolved && <span className="badge">Gebote aufgelöst</span>}</td>
            <td>{(lineupCounts.find(x => x.round_id === r.id) || {}).n || 0}</td><td>{(bidCounts.find(x => x.round_id === r.id) || {}).n || 0}</td>
            <td className="l"><Link className="btn sm sec" href={`/admin/runde/${r.id}`}>Auswerten</Link></td></tr>); })}
      </tbody></table></div>
      <p className="mini">Offen ist immer nur die nächste Runde (kleinste Nummer mit Deadline in der Zukunft). Deadlines folgen dem Spielplan (90 Min. vor dem ersten Anpfiff) und können pro Runde manuell überschrieben werden.</p></div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">Benutzer</div><h2>Konten</h2>
        <div className="tbl"><table><thead><tr><th className="l">Name</th><th className="l">E-Mail</th><th className="l">Rolle</th><th className="l">Team</th><th className="l"></th></tr></thead><tbody>{users.map(x => <tr key={x.id}><td className="l">{x.name}</td><td className="l">{x.email}</td><td className="l">{x.role}{x.must_change_pw && <span className="badge v">Startpasswort</span>}</td><td className="l">{x.manager_name || '–'}</td><td className="l"><UserRow userId={x.id} /></td></tr>)}</tbody></table></div>
        <CreateUser managers={b.managers.map(m => ({ id: m.id, name: m.name }))} /></div>
      <div className="card"><div className="eyebrow">Einstellungen</div><h2>Vorsaison-Reihenfolge</h2><p className="mini">Für Gleichstände bei Geboten vor der ersten gewerteten Runde (Ziff. 7.1: schlechtester Tabellenplatz der Vorsaison zuerst). Danach zählt die aktuelle Tabelle automatisch.</p>
        <Vorsaison list={vorsaison} managers={b.managers.map(m => m.name)} />
        <h3 style={{ marginTop: 14 }}>Manueller Kauf / Buchung</h3><Manual managers={b.managers.map(m => ({ id: m.id, name: m.name }))} clubs={b.clubs.map(c => c.id)} /></div>
    <SquadSync status={await getSetting('squads_sync')} slugs={Object.values(clubSlugs)} season={process.env.KICKER_SEASON || '2026-27'} />
    <Leavers items={(await rlbLeavers(b)).map(x => ({ player: { id: x.player.id, name: x.player.name, club: x.player.club, price: Number(x.player.price) }, manager: b.managerName[x.player.manager_id], since: x.since }))} />
    <div className="card"><div className="eyebrow">kicker-Kader</div><h3>Letzte Änderungen (Zu- und Abgänge, Positionen)</h3>{(await q('select l.*, p.name as rlb_name, m.name as manager_name from squad_log l left join players p on p.id=l.rlb_player_id left join managers m on m.id=p.manager_id order by l.at desc limit 40')).map(l => <div key={l.id} className="small">{new Date(l.at).toLocaleDateString('de-CH')} · <b>{l.type}</b> {l.name} {l.type === 'wechsel' ? `${l.club_from} → ${l.club_to}` : l.type === 'abgang' ? `${l.club_from} → ?` : l.type === 'position' ? `${l.club_to}: ${l.pos_from} → ${l.pos_to}` : `→ ${l.club_to} (${l.pos_to})`}{l.rlb_name && <span className="badge v">RLB: {l.manager_name}</span>}</div>) }</div>
    <PoolPaste />
    </div>
  </>);
}
