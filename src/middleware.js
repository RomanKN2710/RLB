import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { authSecret } from '@/lib/auth-secret';

// Ohne Sitzung erreichbar (die API-Routen prüfen selbst Schlüssel oder Admin-Sitzung). Genaue Pfade oder Unterpfade, keine blossen Wortanfänge.
const PUBLIC = ['/login', '/api/sync', '/api/setup', '/api/status', '/api/export', '/api/kicker-inbox', '/api/bericht', '/api/cron', '/setup', '/manifest.webmanifest'];
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname === p || pathname.startsWith(p + '/')) || /^\/(icon|apple-icon|rlb-logo)[^/]*\.(png|svg|ico)$/.test(pathname) || pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next();
  const token = req.cookies.get('rlb_session')?.value;
  if (token) { try { const { payload } = await jwtVerify(token, authSecret());
      // Startpasswort noch nicht ersetzt: nur die Konto-Seite ist erreichbar, bis ein eigenes Passwort gesetzt ist
      if (payload.mcp && !pathname.startsWith('/konto') && !pathname.startsWith('/api/')) { const k = req.nextUrl.clone(); k.pathname = '/konto'; k.search = '?first=1'; return NextResponse.redirect(k); }
      return NextResponse.next(); } catch {} }
  // Nach dem Anmelden zurück zur gewünschten Seite
  const url = req.nextUrl.clone(); const ziel = pathname + (req.nextUrl.search || ''); url.pathname = '/login'; url.search = pathname !== '/' && req.method === 'GET' ? '?next=' + encodeURIComponent(ziel) : ''; return NextResponse.redirect(url);
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
