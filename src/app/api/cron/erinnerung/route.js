import { NextResponse } from 'next/server';
import { q, getSetting, setSetting } from '@/lib/db';
import * as D from '@/lib/data';
import { sendMail, recipients, mailReady, appUrl } from '@/lib/mail';
import { healthReport } from '@/lib/health';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const fmt = d => new Date(d).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', weekday: 'long', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/* Täglicher Lauf am Morgen (Vercel Cron oder /api/cron/erinnerung?key=CRON_SECRET):
   1) Manager ohne gespeicherte Aufstellung erinnern, wenn die Deadline in den nächsten 30 Stunden liegt.
   2) Den Admins melden, wenn etwas Aufmerksamkeit braucht (Sync steht, Runde nicht abgeschlossen, Abgänge offen …). */
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key'); const auth = req.headers.get('authorization') || '';
  if (!process.env.CRON_SECRET || (key !== process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const out = { mail: mailReady(), erinnert: [], admins: [] };
  try {
    const open = await D.openRound(); const h = open ? (new Date(open.deadline).getTime() - Date.now()) / 36e5 : null;
    if (open && h > 0 && h <= 30) {
      const hat = new Set((await q('select manager_id from lineups where round_id=$1', [open.id])).map(r => r.manager_id));
      const gebot = new Set((await q("select distinct manager_id from bids where round_id=$1 and status='sealed'", [open.id])).map(r => r.manager_id));
      for (const u of await recipients()) { if (hat.has(u.manager_id)) continue;
        const r = await sendMail({ to: u.email, userId: u.id, roundId: open.id, kind: 'erinnerung', once: true, subject: `RLB: ${open.label} – Deadline ${fmt(open.deadline)}`,
          text: `Hallo ${u.name}\n\nFür ${open.label} hast du noch keine Aufstellung gespeichert. Deadline ist ${fmt(open.deadline)}.\nOhne Änderung gilt deine Elf der Vorrunde.\n\nAufstellung: ${appUrl()}/aufstellung\nTransfermarkt${gebot.has(u.manager_id) ? ' (dein Gebot ist gespeichert)' : ''}: ${appUrl()}/markt` });
        out.erinnert.push({ user: u.id, ok: r.ok, hinweis: r.skipped || r.error || null }); }
    } else out.hinweis = open ? `Deadline in ${Math.round(h)} h – keine Erinnerung` : 'keine offene Runde';
    // Meldung an die Admins: höchstens einmal am Tag, nur wenn es etwas zu melden gibt
    const hr = await healthReport();
    const stand = JSON.stringify(hr.warnungen); const letzter = await getSetting('admin_meldung_stand');
    const neu = !letzter || letzter.stand !== stand || Date.now() - new Date(letzter.at).getTime() > 7 * 24 * 3600e3;   // gleiche Liste nicht täglich wiederholen
    if (hr.warnungen.length && neu) { const heute = new Date().toISOString().slice(0, 10);
      for (const a of await recipients({ adminsOnly: true })) { const schon = await q("select 1 from mail_log where kind='admin_meldung' and user_id=$1 and ok and at::date = $2::date limit 1", [a.id, heute]); if (schon.length) continue;
        const r = await sendMail({ to: a.email, userId: a.id, kind: 'admin_meldung', subject: `RLB: ${hr.warnungen.length} Punkt${hr.warnungen.length === 1 ? '' : 'e'} für die Admins`,
          text: `Hallo ${a.name}\n\n${hr.warnungen.map(w => '• ' + w).join('\n')}\n\nÜbersicht: ${appUrl()}/admin` });
        out.admins.push({ user: a.id, ok: r.ok, hinweis: r.skipped || r.error || null }); }
      if (out.admins.some(x => x.ok)) await setSetting('admin_meldung_stand', { stand, at: new Date().toISOString() }); }
    out.warnungen = hr.warnungen;
    return NextResponse.json({ ok: true, ...out });
  } catch (e) { return NextResponse.json({ ok: false, error: e.message, ...out }, { status: 500 }); }
}
