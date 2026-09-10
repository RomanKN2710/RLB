import { NextResponse } from 'next/server';
import { syncTeams, syncSchedule } from '@/lib/oldb';
import { syncSquads } from '@/lib/squads';
import { base } from '@/lib/data';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // 18 kicker-Kaderseiten nacheinander brauchen mehr als die 10 s Vercel-Standard
/** Täglicher Sync (Vercel Cron oder manuell): /api/sync?key=CRON_SECRET */
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key'); const auth = req.headers.get('authorization') || '';
  if (process.env.CRON_SECRET && key !== process.env.CRON_SECRET && auth !== `Bearer ${process.env.CRON_SECRET}`) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const out = {};
  try { await syncTeams(); out.matches = await syncSchedule(); } catch (e) { out.oldb_error = e.message; }
  try { const r = await syncSquads(await base()); out.squads = { players: r.players, clubs: r.clubs, changes: r.log.length, errors: r.errors }; } catch (e) { out.squads_error = e.message; }
  if (out.oldb_error && out.squads_error) return NextResponse.json({ ok: false, ...out }, { status: 500 });
  return NextResponse.json({ ok: true, ...out });
}
