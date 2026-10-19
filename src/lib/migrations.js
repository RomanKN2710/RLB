/* Einmalige Datenkorrekturen und Nachträge laufen automatisch: beim Aufruf der Admin-Seite werden alle Schritte
   eingespielt, die laut settings noch fehlen. Jeder Schritt ist idempotent und protokolliert sich selbst. */
import { q, one, getSetting, setSetting, audit } from './db';
import { base } from './data';
import { applyKorrektur20260915 } from './korrektur-20260915';
import { applyKorrektur20260920, applyAufstellungenST4 } from './korrektur-20260920';
import { applyStatsSeed } from './kicker';
import { applyGeboteST4 } from './korrektur-st4-gebote';
import { applyKariusRevert } from './korrektur-karius';
import { applyArbiST4 } from './korrektur-arbi-st4';
import statsSeed from '../../db/seed/kicker-stats-st1-3.json';
import ewigeSeed from '../../db/seed/ewige-rangliste.json';
import * as HOF from './halloffame';
import * as Blog from './blog-import';
import fs from 'node:fs';
import path from 'node:path';

export const STEPS = [
  { key: 'korrektur_20260915', title: 'Datenkorrektur 15.09.2026 (Excel/kicker-Abgleich Spieltag 1–3)', run: applyKorrektur20260915 },
  { key: 'korrektur_20260920', title: 'Datenkorrektur 20.09.2026, Teil 1 (Blog/kicker/Excel, Positionen, Verträge, Blog-Archiv)', run: applyKorrektur20260920 },
  { key: 'korrektur_20260920_st4', title: 'Datenkorrektur 20.09.2026, Teil 2 (Aufstellungen Spieltag 4 laut Blog, Spieltag 3 abgeschlossen)', run: applyAufstellungenST4 },
  { key: 'gebote_st4', title: 'Gebote Spieltag 4 laut Blog (Karius → Pädi, Fellhauer → René, Konstantelias → Mike) und Mikes Aufstellung Spieltag 4', run: applyGeboteST4 },
  { key: 'karius_rene_revert', title: 'Karius Spieltag 4: Zuschlag an Pädi, Renés Kauf zurückgenommen, kicker-Werte neu eingelesen', run: applyKariusRevert },
  { key: 'arbi_st4_scally', title: 'Arbi Spieltag 4: Wechsel Scally → Hlozek ungültig, Scally spielt, Lemperle im Sturm (Entscheid Admins 21.09.2026)', run: applyArbiST4 },
  { key: 'beier_m_st5', title: 'Roman Spieltag 5: Beier im Mittelfeld (M) statt im Sturm – im Blog fehlte die Positionsangabe', run: async userId => {
    const log = []; const roman = await one("select * from managers where name='Roman'"); const r5 = await one("select * from rounds where type='regulaer' and matchday=5");
    const beier = roman && await one("select * from players where manager_id=$1 and name='Beier' and status='active'", [roman.id]);
    if (!roman || !r5 || !beier) throw new Error('Roman, Spieltag 5 oder Beier fehlt');
    if (!(beier.extra_pos || []).includes('M')) { await q("update players set extra_pos=array(select distinct unnest(coalesce(extra_pos,'{}'::text[]) || '{M}'::text[])) where id=$1", [beier.id]); log.push('Beier: Zusatzposition M eingetragen'); }
    const lu = await one('select * from lineups where round_id=$1 and manager_id=$2', [r5.id, roman.id]);
    if (!lu) log.push('Spieltag 5: noch keine Aufstellung von Roman gespeichert – beim nächsten Blog-Import wird Beier automatisch auf M gesetzt');
    else if (!lu.entries[beier.id]) log.push('Spieltag 5: Beier steht nicht in Romans Aufstellung – nichts geändert');
    else if (lu.entries[beier.id].pos === 'M') log.push('Spieltag 5: Beier stand schon auf M');
    else { const e = { ...lu.entries, [beier.id]: { pos: 'M' } }; await q('update lineups set entries=$3, updated_at=now() where round_id=$1 and manager_id=$2', [r5.id, roman.id, JSON.stringify(e)]); log.push(`Spieltag 5: Beier von ${lu.entries[beier.id].pos} auf M gesetzt`); }
    await setSetting('beier_m_st5', { at: new Date().toISOString(), log }); await audit(userId, 'beier_m_st5', { log }); return { log }; } },
  { key: 'blog_st6_20261018', title: 'Spieltag 6: Aufstellungen und Gebote aus dem Blog vom 16.10.2026 übernommen (Posts bis 21:54)', run: async userId => {
    const r6 = await one("select * from rounds where type='regulaer' and matchday=6"); if (!r6) throw new Error('Spieltag 6 fehlt');
    const text = fs.readFileSync(path.join(process.cwd(), 'db', 'seed', 'blog-2026-10-16.txt'), 'utf8');
    const r = await Blog.applyBlog({ id: userId, name: 'Admin', email: 'admin' }, r6.id, text);
    const log = [`Archiv: ${r.archiv.neu} neue Posts`, ...r.bids.log, ...r.lineups.log];
    await setSetting('blog_st6_20261018', { at: new Date().toISOString(), log }); return { log }; } },
  { key: 'st6_brackelmann_david', title: 'Spieltag 6: Gleichstand Brackelmann – Zuschlag an David (schlechterer Tabellenplatz, Ziff. 7.1), Eventualaufträge ausgeführt', run: async userId => {
    // Nur noetig, wenn die Runde schon mit dem alten Stand aufgeloest wurde und Arbi den Zuschlag bekam; sonst passiert
    // beim normalen «Zuteilen» das Richtige. Zuruecksetzen und neu aufloesen laeuft ueber denselben Code wie die Knoepfe.
    const r6 = await one("select * from rounds where type='regulaer' and matchday=6"); if (!r6) throw new Error('Spieltag 6 fehlt');
    const arbi = await one("select * from managers where name='Arbi'"); const log = [];
    const wrong = r6.bids_resolved && arbi && await one("select * from bids where round_id=$1 and manager_id=$2 and status='won' and lower(player_name) like 'brackelmann%'", [r6.id, arbi.id]);
    if (!wrong) { log.push(r6.bids_resolved ? 'Spieltag 6 war schon richtig aufgelöst – nichts zu tun' : 'Spieltag 6 noch nicht aufgelöst – nichts zu tun, «Zuteilen» entscheidet richtig'); }
    else if (r6.status === 'final') { log.push('Spieltag 6 ist abgeschlossen – bitte von Hand prüfen'); }
    else { const u = await Blog.undoBids(userId, r6.id); log.push('Zurückgesetzt: ' + u.log.join(' · ')); const a = await Blog.applyBids(userId, r6.id); log.push('Neu aufgelöst: ' + a.log.join(' · ')); }
    await setSetting('st6_brackelmann_david', { at: new Date().toISOString(), log }); return { log }; } },
  { key: 'blog_dubletten_20261019', title: 'Blog-Archiv: Dubletten entfernt (gleicher Post, unterschiedlich langer Mail-Text), Kennung auf Titel/Zeit/Autor umgestellt', run: async () => {
    const Archiv = await import('./blog-archiv'); const r = await Archiv.rehashAndDedupe(); const log = [`${r.removed} Dublette(n) entfernt`, ...r.log];
    await setSetting('blog_dubletten_20261019', { at: new Date().toISOString(), log }); return { log }; } },
  { key: 'ewige_rangliste', title: 'Hall of Fame: ewige Rangliste 1999/00 – 2025/26 (27 Saisons aus dem Excel)', run: async userId => { const log = []; for (const s of ewigeSeed) { const n = await HOF.importSeason(s.season, s.rows, 'Ewige Rangliste (Excel)'); log.push(`${s.season}: ${n} Plätze, Meister ${s.rows.filter(r => r.rank === 1).map(r => r.manager).join(' & ')}`); } await setSetting('ewige_rangliste', { at: new Date().toISOString(), log }); return { log }; } },
  { key: 'qa_20261009', title: 'Bereinigung 09.10.2026: doppelte Korrektur-Notizen entfernt, Positionserwerbe der Korrektur 20.09. datiert', run: async userId => {
    const log = [];
    const d = await q(`delete from corrections c using corrections c2 where c.id > c2.id and c.round_id=c2.round_id and c.manager_id is not distinct from c2.manager_id and c.text is not distinct from c2.text and c.delta::text = c2.delta::text returning c.id`);
    log.push(`${d.length} doppelte Korrektur-Notizen entfernt`);
    // «→ M ab Spieltag N» heisst: erworben in Spieltag N−1 (gilt ab der Folgerunde, Ziff. 5.2)
    const fix = [['Daghim', 'M', 1], ['Conté', 'S', 1], ['Grüll', 'M', 1], ['El Ouahdi', 'M', 2], ['Bülter', 'M', 3]];
    for (const [name, pos, md] of fix) {
      const r = await q(`update transfers t set round_id=(select id from rounds where type='regulaer' and matchday=$3), note='Zusatzposition ' || $2 || ' erworben (Korrektur 20.09.2026, Startelf Spieltag ' || $3 || ') – ' || note
        where t.type='position' and t.round_id is null and t.player_name=$1 returning t.id`, [name, pos, md]);
      if (r.length) log.push(`${name}: Zusatzposition ${pos} datiert auf Spieltag ${md}`);
    }
    await setSetting('qa_20261009', { at: new Date().toISOString(), log }); return { log };
  } },
  { key: 'jugend_20261009', title: 'Jugendstatus: Spieler in gewerteten Aufstellungen verlieren ihn (Ziff. 4.3.4)', run: async () => {
    const j = await q("update players set jugend=false where jugend and id in (select jsonb_object_keys(l.entries) from lineups l join rounds r on r.id=l.round_id where r.status='final') returning name");
    const log = [j.length ? `Jugendstatus entfernt: ${j.map(x => x.name).join(', ')}` : 'nichts zu korrigieren'];
    await setSetting('jugend_20261009', { at: new Date().toISOString(), log }); return { log };
  } },
  { key: 'bankwerte_st1_3', title: 'kicker-Werte aller Kaderspieler Spieltag 1–3 (Grundlage der Potential-Tabelle)', run: async userId => { const log = await applyStatsSeed(statsSeed, await base()); await setSetting('bankwerte_st1_3', { at: new Date().toISOString(), log }); return { log }; } },
];

/** Fehlende Schritte einspielen. Liefert [{key, title, log|error}] der jetzt gelaufenen Schritte. */
export async function runPending(userId = null) {
  const out = [];
  for (const s of STEPS) {
    if (await getSetting(s.key)) continue;
    try { const r = await s.run(userId); out.push({ key: s.key, title: s.title, log: r.log || [] }); }
    catch (e) { out.push({ key: s.key, title: s.title, error: e.message }); await setSetting(s.key + '_fehler', { at: new Date().toISOString(), error: e.message }); }
  }
  return out;
}

/** Stand aller Schritte für die Anzeige. */
export async function status() {
  const out = [];
  for (const s of STEPS) { const d = await getSetting(s.key); const err = await getSetting(s.key + '_fehler'); out.push({ key: s.key, title: s.title, at: d?.at || null, log: d?.log || [], error: !d && err ? err.error : null }); }
  return out;
}
