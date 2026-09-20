import { NextResponse } from 'next/server';
import { applyKorrektur20260915 } from '@/lib/korrektur-20260915';
import { applyKorrektur20260920 } from '@/lib/korrektur-20260920';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Einmalige Datenkorrekturen: /api/korrektur?key=CRON_SECRET[&v=20260920] (alternativ Knopf im Admin) */
export async function GET(req) {
  const u = new URL(req.url); const key = u.searchParams.get('key'); const v = u.searchParams.get('v') || '20260915';
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try { return NextResponse.json(await (v === '20260920' ? applyKorrektur20260920(null) : applyKorrektur20260915(null))); } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
