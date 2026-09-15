import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import { savePage, status } from '@/lib/kicker-inbox';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const allowed = async req => { const u = await getUser(); const key = new URL(req.url).searchParams.get('key') || (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, ''); return (u && u.role === 'admin') || (process.env.CRON_SECRET && key === process.env.CRON_SECRET); };

/** Quelltext einer kicker-Seite ablegen: POST Body = HTML (text/plain oder text/html) oder JSON {html, url}. ?matchday=N optional. */
export async function POST(req) {
  if (!await allowed(req)) return new NextResponse('forbidden', { status: 403 });
  const sp = new URL(req.url).searchParams; const ct = req.headers.get('content-type') || '';
  let html = '', url = sp.get('url') || '';
  if (ct.includes('application/json')) { const j = await req.json().catch(() => ({})); html = j.html || j.body || ''; url = j.url || url; }
  else html = await req.text();
  if (!html || html.length < 500) return new NextResponse('Kein Quelltext empfangen (Body leer)', { status: 400 });
  try {
    const r = await savePage(html, { url, matchday: Number(sp.get('matchday')) || null });
    const msg = r.kind === 'elf' ? `Elf des Tages Spieltag ${r.matchday} gespeichert` : `${r.title} gespeichert – Spieltag ${r.matchday}: ${r.status.n}/9 Spiele, Elf des Tages ${r.status.elf ? 'ja' : 'fehlt'}`;
    return new NextResponse(msg, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  } catch (e) { return new NextResponse('Fehler: ' + e.message, { status: 422 }); }
}
/** Stand des Eingangs: GET ?matchday=N */
export async function GET(req) {
  if (!await allowed(req)) return new NextResponse('forbidden', { status: 403 });
  const md = Number(new URL(req.url).searchParams.get('matchday')); if (!md) return new NextResponse('?matchday=N', { status: 400 });
  const s = await status(md); return NextResponse.json(s);
}
