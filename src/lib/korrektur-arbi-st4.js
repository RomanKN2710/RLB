/* Arbi, Spieltag 4 (Entscheid der Administration, 21.09.2026): Der Wechsel Scally → Hlozek ist ungültig, weil die
   gemeldete Elf mit Lemperle im Mittelfeld nicht regelkonform war (Lemperle ist nur Stürmer). Scally bleibt in der
   Verteidigung, Hlozek spielt nicht, Lemperle rückt in den Sturm. Ergebnis: 4-3-3, regelkonform, ein Wechsel weniger. */
import { q, one, setSetting, audit } from './db';

export async function applyArbiST4(userId = null) {
  const log = []; const arbi = await one("select * from managers where name='Arbi'"); const r4 = await one("select * from rounds where type='regulaer' and matchday=4");
  if (!arbi || !r4) throw new Error('Arbi/Runde 4 fehlt');
  const lu = await one('select * from lineups where round_id=$1 and manager_id=$2', [r4.id, arbi.id]);
  if (!lu) throw new Error('Aufstellung Arbi Spieltag 4 fehlt');
  const e = { ...lu.entries };
  if (e['arbi-hlozek']) { delete e['arbi-hlozek']; log.push('Hlozek aus der Elf genommen (Wechsel Scally → Hlozek ungültig)'); }
  if (!e['arbi-scally']) { e['arbi-scally'] = { pos: 'V' }; log.push('Scally bleibt in der Verteidigung'); }
  if (e['arbi-lemperle'] && e['arbi-lemperle'].pos !== 'S') { e['arbi-lemperle'] = { pos: 'S' }; log.push('Lemperle im Sturm statt im Mittelfeld'); }
  if (Object.keys(e).length !== 11) throw new Error(`Arbi Spieltag 4: ${Object.keys(e).length} Spieler statt 11`);
  await q('update lineups set entries=$3, updated_at=now() where round_id=$1 and manager_id=$2', [r4.id, arbi.id, JSON.stringify(e)]);
  if (!log.length) log.push('Aufstellung war schon korrekt');
  await setSetting('arbi_st4_scally', { at: new Date().toISOString(), log }); await audit(userId, 'arbi_st4_scally', { n: log.length });
  return { log };
}
