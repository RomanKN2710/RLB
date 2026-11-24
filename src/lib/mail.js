/* E-Mails der App (Erinnerung vor der Deadline, Hinweis nach der Auswertung, Passwort zurücksetzen, Meldungen an die Admins).
   Versand über den Dienst Resend (https://resend.com), sobald in Vercel RESEND_API_KEY und MAIL_FROM gesetzt sind.
   Ohne diese beiden Werte verschickt die App nichts und sagt das an den betreffenden Stellen. */
import { q, one, ensureSchema } from './db';

export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.MAIL_FROM);
export const appUrl = () => (process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://127.0.0.1:' + (process.env.PORT || 3000))).replace(/\/$/, '');

/** Eine Mail senden. kind/roundId/userId dienen dem Protokoll und dem Schutz vor Doppelversand (einmal je Art, Runde und Empfänger). */
export async function sendMail({ to, subject, text, kind = 'sonstiges', roundId = null, userId = null, once = false }) {
  await ensureSchema();
  if (once && userId) { const schon = await one('select 1 from mail_log where kind=$1 and user_id=$2 and round_id is not distinct from $3 and ok limit 1', [kind, userId, roundId]); if (schon) return { ok: true, skipped: 'schon gesendet' }; }
  if (!mailReady()) return { ok: false, skipped: 'Mailversand nicht eingerichtet (RESEND_API_KEY und MAIL_FROM fehlen)' };
  let ok = false, error = null;
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject, text: text + `\n\n–\nRLB Managerspiel · ${appUrl()}\nKeine Mails mehr: ${appUrl()}/konto` }) });
    ok = r.ok; if (!ok) error = `HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`;
  } catch (e) { error = e.message; }
  try { await q('insert into mail_log(kind, round_id, user_id, ok, error) values($1,$2,$3,$4,$5)', [kind, roundId, userId, ok, error]); } catch { /* Protokoll ist Beigabe */ }
  return { ok, error };
}

/** Empfänger: Konten mit Manager-Team, die Mails nicht abgestellt haben (optional nur Admins). */
export async function recipients({ adminsOnly = false } = {}) {
  await ensureSchema();
  return q(`select u.id, u.email, u.name, u.role, u.manager_id from users u where coalesce(u.mail_off, false) = false ${adminsOnly ? "and u.role='admin'" : 'and u.manager_id is not null'} order by u.id`);
}
