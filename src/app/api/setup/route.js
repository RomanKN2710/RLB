import { NextResponse } from 'next/server';
import fs from 'node:fs'; import path from 'node:path';
import { q } from '@/lib/db';
import { applySquads } from '@/lib/squads';
import { applyStartelfSeed } from '@/lib/kicker';
import { base } from '@/lib/data';
import { runSeed } from '../../../../db/seed/seed-core.mjs';
export const dynamic = 'force-dynamic';
/** Ersteinrichtung ohne lokales Node: /api/setup?key=CRON_SECRET legt das Schema an, importiert Runde 1 und den Admin (ADMIN_EMAIL/ADMIN_PASSWORD). Idempotent. */
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return NextResponse.json({ error: 'forbidden: CRON_SECRET setzen und als ?key= übergeben' }, { status: 403 });
  const logs = [];
  try {
    await q(fs.readFileSync(path.join(process.cwd(), 'db', 'schema.sql'), 'utf8'));
    const seedData = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db', 'seed', 'runde1.json'), 'utf8'));
    await runSeed(q, process.env, seedData, m => logs.push(m));
    // Spielerpool: kicker-Kader-Momentaufnahme aller 18 Vereine, falls noch leer
    const n = await q('select count(*)::int as n from bl_players where in_squad');
    if (n[0].n === 0) { const kader = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db', 'seed', 'kicker-kader.json'), 'utf8')); const r = await applySquads(kader.squads, null, 'seed ' + kader.date); logs.push(`Spielerpool: ${r.players} Spieler aus ${r.clubs} kicker-Kadern (Stand ${kader.date})`); }
    const done = await q("select 1 from settings where key='startelf_seed'");
    if (!done.length) { const se = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'db', 'seed', 'kicker-startelf.json'), 'utf8')); const l = await applyStartelfSeed(se, await base()); await q("insert into settings(key,value) values('startelf_seed',$1) on conflict(key) do update set value=excluded.value", [JSON.stringify({ at: new Date().toISOString(), n: l.length })]); logs.push(`Startaufstellungen Spieltag 1–2 (kicker): ${l.length} Positionserwerbe: ${l.join('; ')}`); }
    return NextResponse.json({ ok: true, logs });
  } catch (e) { return NextResponse.json({ ok: false, error: e.message, logs }, { status: 500 }); }
}
