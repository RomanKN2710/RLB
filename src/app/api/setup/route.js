import { NextResponse } from 'next/server';
import fs from 'node:fs'; import path from 'node:path';
import bcrypt from 'bcryptjs';
import { q, dbHint } from '@/lib/db';
import { applySquads } from '@/lib/squads';
import { applyStartelfSeed } from '@/lib/kicker';
import { applyRunde2 } from '@/lib/seed-runde2';
import { applyKorrekturen, applyAbgaenge, repariereKaderstatus } from '@/lib/korrekturen';
import { base } from '@/lib/data';
import { runSeed } from '../../../../db/seed/seed-core.mjs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Schema + Seed + 509 Spieler brauchen deutlich mehr als die 10 s Vercel-Standard
/** Ersteinrichtung ohne lokales Node: /api/setup?key=CRON_SECRET legt das Schema an, importiert Runde 1 und den Admin (ADMIN_EMAIL/ADMIN_PASSWORD). Idempotent. */
export async function GET(req) {
  const sp = new URL(req.url).searchParams; const key = sp.get('key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return NextResponse.json({ error: 'forbidden: CRON_SECRET setzen und als ?key= übergeben' }, { status: 403 });
  const logs = [];
  try {
    await q(fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8'));
    const seedData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db', 'seed', 'runde1.json'), 'utf8'));
    await runSeed(q, process.env, seedData, m => logs.push(m));
    // Spielerpool: kicker-Kader-Momentaufnahme aller 18 Vereine. Die Merkzeile wird erst
    // nach dem vollstaendigen Import geschrieben, darum holt ein zweiter Aufruf einen
    // abgebrochenen Lauf nach. Ein blosser Zeilenzaehler taugt dafuer nicht: nach einem
    // Abbruch bei 200 von 509 Spielern waere der Pool fuer immer unvollstaendig geblieben,
    // und nach einem spaeteren kicker-Abgleich wuerde er abgegangene Spieler zurueckholen.
    const poolDone = await q("select 1 from settings where key='pool_seed'");
    if (!poolDone.length) {
      const kader = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db', 'seed', 'kicker-kader.json'), 'utf8'));
      const r = await applySquads(kader.squads, null, 'seed ' + kader.date);
      await q("insert into settings(key,value) values('pool_seed',$1) on conflict(key) do update set value=excluded.value", [JSON.stringify({ at: new Date().toISOString(), players: r.players, date: kader.date })]);
      logs.push(`Spielerpool: ${r.players} Spieler aus ${r.clubs} kicker-Kadern (Stand ${kader.date})`);
    } else { logs.push('Spielerpool war schon importiert'); }
    const done = await q("select 1 from settings where key='startelf_seed'");
    if (!done.length) { const se = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db', 'seed', 'kicker-startelf.json'), 'utf8')); const l = await applyStartelfSeed(se, await base()); await q("insert into settings(key,value) values('startelf_seed',$1) on conflict(key) do update set value=excluded.value", [JSON.stringify({ at: new Date().toISOString(), n: l.length })]); logs.push(`Startaufstellungen Spieltag 1–2 (kicker): ${l.length} Positionserwerbe: ${l.join('; ')}`); }
    // Runde 2 aus dem Excel (einmalig)
    try { await applyRunde2(JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db', 'seed', 'runde2.json'), 'utf8')), m => logs.push(m)); } catch (e) { logs.push('Runde 2: ' + e.message); }
    // Datenkorrekturen an Kaderspielern zuletzt: sie betreffen auch Spieler, die erst der
    // Runde-2-Import anlegt (siehe lib/korrekturen.js).
    await applyKorrekturen(q, m => logs.push(m));
    await applyAbgaenge(q, m => logs.push(m));
    await repariereKaderstatus(q, m => logs.push(m));
    // Admin-Konto: der Seed legt es nur an, solange die users-Tabelle leer ist. Darum hier
    // Diagnose und, mit ?admin=reset, ein Zuruecksetzen auf das aktuelle ADMIN_PASSWORD.
    const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
    const pw = process.env.ADMIN_PASSWORD || '';
    const users = await q('select id, email, role from users order by id');
    const admin = users.find(u => u.email === email);
    logs.push(`Benutzer in der Datenbank: ${users.length}${users.length ? ' (' + users.map(u => u.email + '/' + u.role).join(', ') + ')' : ''}`);
    if (!email) logs.push('ACHTUNG: ADMIN_EMAIL ist im Projekt nicht gesetzt');
    if (!pw) logs.push('ACHTUNG: ADMIN_PASSWORD ist im Projekt nicht gesetzt');
    else logs.push(`ADMIN_PASSWORD ist gesetzt: ${pw.length} Zeichen${pw !== pw.trim() ? ' – ACHTUNG: mit Leerzeichen am Anfang oder Ende!' : ''}${/^["'].*["']$/.test(pw) ? ' – ACHTUNG: in Anfuehrungszeichen eingetragen!' : ''}`);
    if (email && !admin) logs.push(`Kein Konto fuer ${email} vorhanden – mit &admin=reset anlegen`);
    if (sp.get('admin') === 'reset') {
      if (!email || !pw) logs.push('admin=reset uebersprungen: ADMIN_EMAIL und ADMIN_PASSWORD muessen gesetzt sein');
      else {
        const hash = await bcrypt.hash(pw, 10);
        if (admin) { await q('update users set password_hash=$1, must_change_pw=true, role=$3 where id=$2', [hash, admin.id, 'admin']); logs.push(`Passwort fuer ${email} auf den aktuellen Wert von ADMIN_PASSWORD gesetzt`); }
        else {
          const m = process.env.ADMIN_MANAGER ? await q('select id from managers where name=$1', [process.env.ADMIN_MANAGER]) : [];
          await q("insert into users(email,name,role,manager_id,password_hash,must_change_pw) values($1,'Admin','admin',$2,$3,true)", [email, m.length ? m[0].id : null, hash]);
          logs.push(`Admin-Konto ${email} angelegt${m.length ? ' (Manager ' + process.env.ADMIN_MANAGER + ')' : ''}`);
        }
      }
    }
    return NextResponse.json({ ok: true, logs });
  } catch (e) { return NextResponse.json({ ok: false, error: dbHint(e), detail: e.message, logs }, { status: 500 }); }
}
