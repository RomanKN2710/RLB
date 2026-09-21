/* Einmalige Datenkorrekturen und Nachträge laufen automatisch: beim Aufruf der Admin-Seite werden alle Schritte
   eingespielt, die laut settings noch fehlen. Jeder Schritt ist idempotent und protokolliert sich selbst. */
import { getSetting, setSetting } from './db';
import { base } from './data';
import { applyKorrektur20260915 } from './korrektur-20260915';
import { applyKorrektur20260920, applyAufstellungenST4 } from './korrektur-20260920';
import { applyStatsSeed } from './kicker';
import { applyGeboteST4 } from './korrektur-st4-gebote';
import statsSeed from '../../db/seed/kicker-stats-st1-3.json';

export const STEPS = [
  { key: 'korrektur_20260915', title: 'Datenkorrektur 15.09.2026 (Excel/kicker-Abgleich Spieltag 1–3)', run: applyKorrektur20260915 },
  { key: 'korrektur_20260920', title: 'Datenkorrektur 20.09.2026, Teil 1 (Blog/kicker/Excel, Positionen, Verträge, Blog-Archiv)', run: applyKorrektur20260920 },
  { key: 'korrektur_20260920_st4', title: 'Datenkorrektur 20.09.2026, Teil 2 (Aufstellungen Spieltag 4 laut Blog, Spieltag 3 abgeschlossen)', run: applyAufstellungenST4 },
  { key: 'gebote_st4', title: 'Gebote Spieltag 4 laut Blog (Karius → Pädi, Fellhauer → René, Konstantelias → Mike) und Mikes Aufstellung Spieltag 4', run: applyGeboteST4 },
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
