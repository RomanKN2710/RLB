import { NextResponse } from 'next/server';
import { applyKorrektur20260915 } from '@/lib/korrektur-20260915';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
/** Einmalige Datenkorrektur vom 15.09.2026: /api/korrektur?key=CRON_SECRET (alternativ Knopf im Admin) */
export async function GET(req) {
  const key = new URL(req.url).searchParams.get('key');
  if (!process.env.CRON_SECRET || key !== process.env.CRON_SECRET) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  try { return NextResponse.json(await applyKorrektur20260915(null)); } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }); }
}
