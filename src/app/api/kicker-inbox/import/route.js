import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { q, one, audit } from '@/lib/db';
import * as D from '@/lib/data';
import * as Inbox from '@/lib/kicker-inbox';
import { importPages } from '@/lib/kicker';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Eingang eines Spieltags importieren: POST /api/kicker-inbox/import?matchday=N[&unlock=1] (Admin oder ?key=CRON_SECRET). Liefert den Bericht als JSON. */
export async function POST(req) {
  const u = await getUser(); const sp = new URL(req.url).searchParams; const key = sp.get('key');
  if (!(u && u.role === 'admin') && !(process.env.CRON_SECRET && key === process.env.CRON_SECRET)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const md = Number(sp.get('matchday')); if (!md) return NextResponse.json({ error: '?matchday=N' }, { status: 400 });
  const round = await one("select * from rounds where type='regulaer' and matchday=$1", [md]); if (!round) return NextResponse.json({ error: 'Runde fehlt' }, { status: 404 });
  const pg = await Inbox.pages(md); if (!pg.matches.length && !pg.elf) return NextResponse.json({ error: 'Eingang leer' }, { status: 400 });
  const b = await D.base(); await D.ensureLineups(round, b);
  if (sp.get('unlock')) await q('update results set locked=false where round_id=$1', [round.id]);
  try { const r = await importPages(round, b, { matches: pg.matches, elf: pg.elf || null }); await audit(u ? u.id : null, 'kicker_import', { roundId: round.id, games: r.games, counts: r.counts }); return NextResponse.json(r); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
