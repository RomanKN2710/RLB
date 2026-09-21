import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { createReport } from '@/lib/bericht';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

/** Bericht einer abgeschlossenen Runde erstellen: POST /api/bericht?round_id=N[&force=1] (Admin oder ?key=CRON_SECRET). */
export async function POST(req) {
  const u = await getUser(); const sp = new URL(req.url).searchParams; const key = sp.get('key');
  if (!(u && u.role === 'admin') && !(process.env.CRON_SECRET && key === process.env.CRON_SECRET)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const roundId = Number(sp.get('round_id')); if (!roundId) return NextResponse.json({ error: '?round_id=N' }, { status: 400 });
  try { const log = await createReport(roundId, { force: !!sp.get('force') }); return NextResponse.json({ ok: true, log }); }
  catch (e) { return NextResponse.json({ ok: false, error: e.message }, { status: 500 }); }
}
