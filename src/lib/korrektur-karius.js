/* Karius, Spieltag 4: Die Gebotsauflösung in der App hatte René den Zuschlag gegeben (einziges Gebot in der App), das Blog zeigt
   aber Gleichstand 2:2 mit Pädi, Zuschlag an Pädi (schlechter platziert, Ziff. 7.1). Renés Kauf wird zurückgenommen: Karius raus,
   Heuer Fernandes zurück in Kader und Tor, Gebot als verloren. Danach kicker-Werte Spieltag 4 neu einlesen, damit Pädis Karius
   eindeutig zugeordnet wird. */
import { q, one, setSetting, audit } from './db';
import { base, roundById, ensureLineups } from './data';
import * as Inbox from './kicker-inbox';
import { importPages } from './kicker';

export async function applyKariusRevert(userId = null) {
  const log = []; const managers = await q('select * from managers'); const rene = managers.find(m => m.name === 'René'); const r4 = await one("select * from rounds where type='regulaer' and matchday=4");
  if (!rene || !r4) throw new Error('René/Runde 4 fehlt');
  const kar = await one("select * from players where manager_id=$1 and name='Karius'", [rene.id]); const hf = await one("select * from players where manager_id=$1 and name='Heuer Fernandes'", [rene.id]);
  if (kar) {
    await q('delete from results where player_id=$1', [kar.id]);
    const lu = await one('select * from lineups where round_id=$1 and manager_id=$2', [r4.id, rene.id]);
    if (lu && lu.entries[kar.id]) { const e = { ...lu.entries }; delete e[kar.id]; if (hf) e[hf.id] = { pos: 'T' }; await q('update lineups set entries=$3, free_in=$4, updated_at=now() where round_id=$1 and manager_id=$2', [r4.id, rene.id, JSON.stringify(e), (lu.free_in || []).filter(x => x !== kar.id)]); log.push('René: Aufstellung Spieltag 4 – Heuer Fernandes statt Karius im Tor'); }
    await q('update bids set release_player_id=null, swap_out_player_id=null where release_player_id=$1 or swap_out_player_id=$1', [kar.id]);
    await q('delete from players where id=$1', [kar.id]); log.push('René: Karius aus dem Kader entfernt');
    await q("delete from transfers where manager_id=$1 and round_id=$2 and ((type='kauf' and player_name='Karius') or (type='entlassung' and player_name='Heuer Fernandes'))", [rene.id, r4.id]);
  } else log.push('René: Karius nicht im Kader (schon bereinigt)');
  if (hf && hf.status !== 'active') { await q("update players set status='active', valid_to=null where id=$1", [hf.id]); log.push('René: Heuer Fernandes wieder aktiv'); }
  await q("update bids set status='lost', reason='Gleichstand 2:2 mit Pädi, Zuschlag an den schlechter platzierten Manager (Ziff. 7.1)', release_player_id=$3, swap_out_player_id=$3 where round_id=$1 and manager_id=$2", [r4.id, rene.id, hf ? hf.id : null]);
  log.push('René: Gebot Karius als verloren markiert');
  // kicker-Werte Spieltag 4 neu einlesen (Pädis Karius war wegen des Doppels nicht zuordenbar)
  try { const pg = await Inbox.pages(r4.matchday); if (pg.matches.length) { const b = await base(); await ensureLineups(r4, b); const r = await importPages(r4, b, { matches: pg.matches, elf: pg.elf || null }); const c = r.counts || {}; log.push(`kicker Spieltag 4 neu eingelesen: Startelf ${c.startelf || 0}, eingewechselt ${c.eingewechselt || 0}, Bank ${c.bank || 0}, Name prüfen ${c.nicht_gefunden || 0}${r.errors.length ? ' – ' + r.errors.join(' · ') : ''}`); } else log.push('kicker Spieltag 4: Eingang leer, bitte Seiten erneut senden und importieren'); }
  catch (e) { log.push('kicker Spieltag 4 nicht neu eingelesen: ' + e.message); }
  await setSetting('karius_rene_revert', { at: new Date().toISOString(), log }); await audit(userId, 'karius_rene_revert', { n: log.length });
  return { log };
}
