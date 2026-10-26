import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { getUser } from '@/lib/auth';
export const dynamic = 'force-dynamic';

/* Admin-Handbuch (PDF) zum Herunterladen, nur fuer Admins. Quelle: docs/handbuch, gebaut mit «npm run handbuch». */
export async function GET() {
  const u = await getUser(); if (!u || u.role !== 'admin') return new NextResponse('Bitte als Admin anmelden.', { status: 403 });
  const file = path.join(process.cwd(), 'docs', 'handbuch', 'rlb-admin-handbuch.pdf');
  if (!fs.existsSync(file)) return new NextResponse('Handbuch fehlt – «npm run handbuch» ausführen und committen.', { status: 404 });
  return new NextResponse(fs.readFileSync(file), { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="RLB-Admin-Handbuch.pdf"', 'cache-control': 'no-store' } });
}
