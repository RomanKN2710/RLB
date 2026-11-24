import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { q } from '@/lib/db';
import * as D from '@/lib/data';
import { fmtDt } from '@/components/ui';
export const dynamic = 'force-dynamic';

/* Protokoll für Admins: wer hat was wann geändert (Aufstellungen, Werte, Korrekturen, Gebote, Runden, Konten, Buchungen).
   Die Einträge schreibt die App bei jeder dieser Aktionen; hier sind sie lesbar und nach Art filterbar. */
const ART = {
  login: 'Anmeldung', lineup: 'Aufstellung gespeichert', lineup_paste: 'Aufstellungen aus dem Blog', bid: 'Gebot gespeichert', bid_withdraw: 'Gebot zurückgezogen', bid_paste: 'Gebote aus dem Blog', bids_applied: 'Gebote zugeteilt', bids_undone: 'Zuteilung zurückgesetzt', sealed_bids_view: 'Verdeckte Gebote eingesehen',
  results: 'Spielerwerte von Hand', results_unlock: 'Sperren aufgehoben', correction_add: 'Korrektur gebucht', correction_delete: 'Korrektur gelöscht', round_status: 'Runde geöffnet/abgeschlossen', round_label: 'Bezeichnung geändert', round_tdr_manual: 'Team der Runde von Hand', deadline: 'Deadline geändert', nachtrag: 'Nachtragsrunde angelegt',
  kicker_import: 'kicker-Import', club_change: 'Vereinswechsel', player_edit: 'Spieler bearbeitet', position_add: 'Zusatzposition gesetzt', position_remove: 'Zusatzposition entfernt', contract: 'Vertrag geändert', jugend: 'Jugendstatus geändert',
  manual_buy: 'Manueller Kauf', release: 'Entlassung', abgang: 'Abgang gebucht', ledger: 'Buchung', paid: 'Zahlung erfasst', trade_done: 'Trade vollzogen', trade_revert: 'Trade rückgängig',
  user_create: 'Konto angelegt', user_delete: 'Konto gelöscht', pw_reset: 'Startpasswort gesetzt', pw_change: 'Passwort geändert', pw_reset_request: 'Passwort-Link angefordert', pw_reset_mail: 'Passwort per Link gesetzt',
  squads_sync: 'kicker-Kader geladen', squads_json: 'Kader-JSON übernommen', squads_upload: 'Kaderseiten hochgeladen', pool_paste: 'Spielerpool ergänzt', blog_import: 'Blog-Archiv ergänzt', backup: 'Sicherung von Hand',
};
const GRUPPEN = { 'Runden und Werte': ['results', 'results_unlock', 'correction_add', 'correction_delete', 'round_status', 'round_label', 'round_tdr_manual', 'deadline', 'nachtrag', 'kicker_import'], 'Aufstellungen und Gebote': ['lineup', 'lineup_paste', 'bid', 'bid_withdraw', 'bid_paste', 'bids_applied', 'bids_undone', 'sealed_bids_view'], 'Kader und Geld': ['club_change', 'player_edit', 'position_add', 'position_remove', 'contract', 'jugend', 'manual_buy', 'release', 'abgang', 'ledger', 'paid', 'trade_done', 'trade_revert', 'squads_sync', 'squads_json', 'squads_upload', 'pool_paste'], 'Konten': ['login', 'user_create', 'user_delete', 'pw_reset', 'pw_change', 'pw_reset_request', 'pw_reset_mail'] };

export default async function Protokoll({ searchParams }) {
  const u = await getUser(); if (!u || u.role !== 'admin') return <div className="card"><h2>Kein Zugriff</h2><p className="mini">Dieser Bereich ist der Administration vorbehalten.</p></div>;
  const gruppe = GRUPPEN[searchParams?.g] ? searchParams.g : null; const ohneLogin = !gruppe;
  const rows = await q(`select a.id, a.created_at, a.action, a.detail, u.name as user_name from audit a left join users u on u.id=a.user_id where ${gruppe ? 'a.action = any($1)' : "a.action <> 'login' and $1::text[] is not null"} order by a.id desc limit 300`, [gruppe ? GRUPPEN[gruppe] : []]);
  const b = await D.base(); const rounds = await D.rounds(); const rl = id => (rounds.find(r => r.id === Number(id)) || {}).label;
  // Einzelheiten kurz und lesbar: Runde, Manager, Spieler, vorher/nachher, Texte
  const kurz = d => { if (!d || typeof d !== 'object') return ''; const t = [];
    if (d.roundId) t.push(rl(d.roundId) || `Runde ${d.roundId}`); if (d.managerId || d.m) t.push(b.managerName[d.managerId || d.m] || ''); if (d.pid) t.push((b.players[d.pid] || {}).name || d.pid);
    if (d.final === true) t.push('abgeschlossen'); if (d.final === false) t.push('wieder geöffnet'); if (d.grund) t.push(`Grund: ${d.grund}`); if (d.text) t.push(`«${d.text}»`);
    if (d.von !== undefined || d.nach !== undefined) t.push(`${JSON.stringify(d.von)} → ${JSON.stringify(d.nach)}`); if (d.pos) t.push(d.pos); if (d.name && !d.pid) t.push(d.name); if (d.price != null) t.push(`CHF ${d.price}`); if (d.amount != null) t.push(`${d.type || ''} CHF ${d.amount}`);
    if (Array.isArray(d.log) && d.log.length) t.push(d.log.slice(0, 4).join(' · ') + (d.log.length > 4 ? ' …' : '')); if (Array.isArray(d.gebote) && d.gebote.length) t.push(d.gebote.map(g => `${g.player_name} ${Number(g.price)}`).join(', '));
    if (Array.isArray(d.groups)) t.push(d.groups.map(g => `höchstens ${g.maxWins}: ${(g.bids || []).join(', ')}`).join(' | ')); if (d.games != null) t.push(`${d.games} Spiele${d.auto ? ' (automatisch)' : ''}`); if (d.tradeId) t.push(`Trade #${d.tradeId}`); if (d.userId) t.push(`Konto ${d.userId}`);
    return t.filter(Boolean).join(' · '); };
  return (<div className="card"><div className="eyebrow"><Link href="/admin">Admin</Link> · Protokoll</div><h2>Wer hat was geändert</h2>
    <p className="mini">Die letzten 300 Einträge{ohneLogin ? ' ohne Anmeldungen' : ''}. Die App schreibt bei jeder Änderung an Aufstellungen, Werten, Korrekturen, Geboten, Runden, Kadern, Buchungen und Konten mit.</p>
    <div className="row" style={{ gap: 4, marginBottom: 8 }}><Link className={`btn sm ${gruppe ? 'sec' : ''}`} href="/admin/protokoll">Alles</Link>{Object.keys(GRUPPEN).map(g => <Link key={g} className={`btn sm ${gruppe === g ? '' : 'sec'}`} href={`/admin/protokoll?g=${encodeURIComponent(g)}`}>{g}</Link>)}</div>
    <div className="tbl wrap"><table><thead><tr><th className="l">Wann</th><th className="l">Wer</th><th className="l">Was</th><th className="l">Einzelheiten</th></tr></thead>
      <tbody>{rows.map(r => <tr key={r.id}><td className="l small" style={{ whiteSpace: 'nowrap' }}>{fmtDt(r.created_at)}</td><td className="l small">{r.user_name || 'App'}</td><td className="l small"><b>{ART[r.action] || r.action}</b></td><td className="l small" style={{ whiteSpace: 'normal' }}>{kurz(r.detail)}</td></tr>)}</tbody></table></div>
    {rows.length === 0 && <p className="mini">Noch keine Einträge.</p>}
  </div>);
}
