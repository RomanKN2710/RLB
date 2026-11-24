/* Zustand der App auf einen Blick: was läuft von selbst, wann zuletzt, und was braucht die Admins.
   Grundlage für die Karte oben auf der Admin-Seite und die tägliche Mail an die Admins. */
import { q, one, getSetting } from './db';
import * as D from './data';
import { integrityCheck } from './integrity';
import { authSecretMissing } from './auth-secret';
import { mailReady } from './mail';

const alterH = at => at ? (Date.now() - new Date(at).getTime()) / 36e5 : null;
const vor = h => h == null ? 'nie' : h < 1 ? 'vor weniger als einer Stunde' : h < 48 ? `vor ${Math.round(h)} h` : `vor ${Math.round(h / 24)} Tagen`;

export async function healthReport() {
  const punkte = []; const warnungen = [];
  const add = (name, ok, text) => { punkte.push({ name, ok, text }); if (!ok) warnungen.push(`${name}: ${text}`); };
  const info = (name, text) => punkte.push({ name, ok: null, text });
  const [lc, fail, sq] = [await getSetting('last_sync_current'), await getSetting('last_sync_fail'), await getSetting('squads_sync')];
  const hSync = alterH(lc?.at); const failNeu = fail && alterH(fail.at) < 6 && (!lc || new Date(fail.at) > new Date(lc.at));
  add('Spielplan und Resultate (OpenLigaDB)', hSync != null && hSync < 30 && !failNeu, failNeu ? `letzter Versuch fehlgeschlagen (${fail.error})` : `zuletzt ${vor(hSync)}`);
  const hSq = alterH(sq?.at);
  add('kicker-Kader', hSq != null && hSq < 24 * 45, `zuletzt ${vor(hSq)}${sq ? ` (${sq.source || 'kicker'})` : ''}${hSq != null && hSq >= 24 * 45 ? ' – kicker sperrt den automatischen Abgleich; Kaderseiten speichern und unter Admin › Kader & Spielerpool hochladen' : ''}`);
  const pend = await q("select label, deadline from rounds where status<>'final' and deadline is not null and deadline < now() - interval '5 days' order by number");
  add('Auswertung', pend.length === 0, pend.length ? `${pend.map(r => r.label).join(', ')}: Deadline seit über fünf Tagen vorbei, noch nicht abgeschlossen` : 'keine überfällige Runde');
  try { const vorl = await q("select p.title, p.matchday from kicker_pages p join rounds r on r.matchday=p.matchday and r.type='regulaer' where p.vorlaeufig and r.status<>'final'");
    add('kicker-Eingang', vorl.length === 0, vorl.length ? `${vorl.length} Seite(n) vor Spielende gesendet (${vorl.map(v => v.title).join(', ')}) – nach dem Abpfiff nochmals öffnen` : 'keine vorläufigen Seiten'); } catch { /* Tabelle fehlt noch */ }
  const fehler = await q("select key, value from settings where key like '%\\_fehler' escape '\\'"); const done = new Set((await q('select key from settings')).map(r => r.key));
  const offen = fehler.filter(f => !done.has(f.key.replace(/_fehler$/, '')));
  add('Einmalige Datenschritte', offen.length === 0, offen.length ? offen.map(f => `${f.key.replace(/_fehler$/, '')}: ${f.value?.error || 'Fehler'}`).join('; ') : 'alle eingespielt');
  let bk = null; try { bk = await one('select at from backups order by at desc limit 1'); } catch { /* Tabelle fehlt noch */ }
  const hBk = alterH(bk?.at); add('Sicherung', hBk != null && hBk < 40, `zuletzt ${vor(hBk)}`);
  try { const b = await D.base(); const alle = await integrityCheck(b, D); const probs = alle.filter(x => !x.startsWith('Hinweis:')); const hinw = alle.filter(x => x.startsWith('Hinweis:'));
    add('Grundregeln (Budget, Kadergrösse, doppelte Spieler)', probs.length === 0, probs.length ? probs.join('; ') : 'in Ordnung'); if (hinw.length) info('Kadergrösse', hinw.map(x => x.replace(/^Hinweis: /, '')).join('; '));
    const { rlbLeavers } = await import('./squads'); const weg = await rlbLeavers(b); add('Abgänge aus der Bundesliga', weg.length === 0, weg.length ? `${weg.map(w => w.player.name).join(', ')}: laut kicker in keinem Kader mehr – Abgang buchen` : 'keine offenen'); }
  catch (e) { add('Grundregeln', false, 'Prüfung fehlgeschlagen: ' + e.message); }
  add('Sitzungsschlüssel', !authSecretMissing(), authSecretMissing() ? 'AUTH_SECRET fehlt in Vercel – bitte eintragen' : 'gesetzt');
  info('E-Mails der App', mailReady() ? 'eingerichtet (Erinnerungen, Passwort zurücksetzen, Meldungen an die Admins)' : 'nicht eingerichtet: RESEND_API_KEY und MAIL_FROM in Vercel fehlen');
  info('Schlüssel für den kicker-Eingang', process.env.INBOX_KEY ? 'eigener Schlüssel INBOX_KEY gesetzt' : 'ohne INBOX_KEY nutzt das Handy-Skript CRON_SECRET');
  return { at: new Date().toISOString(), punkte, warnungen };
}
