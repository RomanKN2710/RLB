import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { importInbox } from '@/lib/kicker';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Eingang eines Spieltags importieren: POST /api/kicker-inbox/import?matchday=N[&unlock=1] (Admin oder ?key=CRON_SECRET). Liefert den Bericht als JSON. */
export async function POST(req) {
  const u = await getUser(); const sp = new URL(req.url).searchParams; const key = sp.get('key');
  if (!(u && u.role === 'admin') && !(process.env.CRON_SECRET && key === process.env.CRON_SECRET)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const md = Number(sp.get('matchday')); if (!md) return NextResponse.json({ error: '?matchday=N' }, { status: 400 });
  try { const r = await importInbox(md, { unlock: !!sp.get('unlock'), userId: u ? u.id : null }); return NextResponse.json({ ...r, round: undefined }); }
  catch (e) { return NextResponse.json({ error: e.message }, { status: /Keine Runde/.test(e.message) ? 404 : /leer/.test(e.message) ? 400 : 500 }); }
}
