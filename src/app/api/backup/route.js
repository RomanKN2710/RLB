import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { readBackup } from '@/lib/backup';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/* Eine Sicherung herunterladen (nur Admins): GET /api/backup?id=N */
export async function GET(req) {
  const u = await getUser(); if (!u || u.role !== 'admin') return new NextResponse('Bitte als Admin anmelden.', { status: 403 });
  const id = Number(new URL(req.url).searchParams.get('id')); if (!id) return new NextResponse('?id=N', { status: 400 });
  const b = await readBackup(id); if (!b) return new NextResponse('Sicherung nicht gefunden', { status: 404 });
  const stamp = new Date(b.at).toISOString().slice(0, 16).replace(/[T:]/g, '-');
  return new NextResponse(b.json, { headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="rlb-sicherung-${stamp}.json"`, 'cache-control': 'no-store' } });
}
