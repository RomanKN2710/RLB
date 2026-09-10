import { NextResponse } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC = ['/login', '/api/sync', '/api/setup', '/api/status', '/setup'];
export async function middleware(req) {
  const { pathname } = req.nextUrl;
  if (PUBLIC.some(p => pathname.startsWith(p)) || pathname.startsWith('/_next') || pathname === '/favicon.ico') return NextResponse.next();
  const token = req.cookies.get('rlb_session')?.value;
  if (token) { try { await jwtVerify(token, new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-change-me')); return NextResponse.next(); } catch {} }
  const url = req.nextUrl.clone(); url.pathname = '/login'; url.search = ''; return NextResponse.redirect(url);
}
export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'] };
