/* Sicherungen: ein Abbild der Spieldaten als gzip-JSON in der Tabelle backups. Täglich über den Cron (/api/sync),
   vor einmaligen Datenschritten und auf Knopfdruck. Schützt vor Fehlbedienung und fehlerhaften Schritten; gegen den
   Verlust der ganzen Datenbank hilft nur der heruntergeladene Datenabzug oder die Sicherung des Datenbank-Anbieters. */
import { gzipSync, gunzipSync } from 'node:zlib';
import { q, one, ensureSchema } from './db';

// ohne kicker_pages (gross, lässt sich neu senden) und ohne Passwort-Hashes
const TABLES = ['managers', 'clubs', 'players', 'rounds', 'matches', 'lineups', 'results', 'corrections', 'bids', 'trades', 'ledger', 'transfers', 'finance', 'settings', 'squad_log', 'blog_posts', 'hall_of_fame', 'reports', 'bl_players', 'audit'];
const KEEP = 30;

export async function createBackup(art = 'auto') {
  await ensureSchema();
  const out = { at: new Date().toISOString(), art, tabellen: {} }; const zahl = {};
  for (const t of TABLES) { try { out.tabellen[t] = await q(`select * from ${t}`); zahl[t] = out.tabellen[t].length; } catch (e) { zahl[t] = 'fehlt'; } }
  out.tabellen.users = await q('select id, email, name, role, manager_id, must_change_pw, created_at from users'); zahl.users = out.tabellen.users.length;
  const buf = gzipSync(Buffer.from(JSON.stringify(out)));
  const r = await one('insert into backups(art, bytes, tabellen, data) values($1,$2,$3,$4) returning id, at', [art, buf.length, JSON.stringify(zahl), buf]);
  // nur die letzten KEEP behalten
  await q('delete from backups where id not in (select id from backups order by at desc limit $1)', [KEEP]);
  return { id: r.id, at: r.at, bytes: buf.length, zeilen: Object.values(zahl).filter(n => typeof n === 'number').reduce((a, n) => a + n, 0) };
}
/** Höchstens eine automatische Sicherung je Tag (der Cron kann mehrfach laufen). */
export async function dailyBackup() {
  await ensureSchema(); const last = await one("select at from backups where art='auto' order by at desc limit 1");
  if (last && Date.now() - new Date(last.at).getTime() < 20 * 3600e3) return { skipped: true, at: last.at };
  return createBackup('auto');
}
export async function listBackups() { await ensureSchema(); return q('select id, at, art, bytes, tabellen from backups order by at desc limit 40'); }
export async function readBackup(id) { await ensureSchema(); const r = await one('select at, art, data from backups where id=$1', [id]); return r ? { at: r.at, art: r.art, json: gunzipSync(r.data).toString('utf8') } : null; }
