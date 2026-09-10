import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { one, q } from './db';

const COOKIE = 'rlb_session';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-change-me');

export async function createSession(user) {
  const token = await new SignJWT({ uid: user.id, role: user.role, mid: user.manager_id, name: user.name })
    .setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('30d').sign(secret());
  cookies().set(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/', maxAge: 30 * 86400 });
}
export function clearSession() { cookies().set(COOKIE, '', { path: '/', maxAge: 0 }); }

export async function verifyToken(token) { try { const { payload } = await jwtVerify(token, secret()); return payload; } catch { return null; } }

/** Aktueller Benutzer (aus DB, damit Rollenänderungen sofort greifen) oder null. */
export async function getUser() {
  const c = cookies().get(COOKIE); if (!c) return null;
  const p = await verifyToken(c.value); if (!p) return null;
  // Faellt die Datenbank aus, gilt der Besucher als abgemeldet: dann bleibt wenigstens
  // /login bedienbar, statt dass jede Seite mit einer Fehlerseite antwortet.
  try {
    return await one('select u.id,u.email,u.name,u.role,u.manager_id,u.must_change_pw,m.name as manager_name from users u left join managers m on m.id=u.manager_id where u.id=$1', [p.uid]);
  } catch { return null; }
}
export async function requireUser() { const u = await getUser(); if (!u) throw new Error('Nicht angemeldet'); return u; }
export async function requireAdmin() { const u = await requireUser(); if (u.role !== 'admin') throw new Error('Nur Admin'); return u; }
export const isAdmin = u => u && u.role === 'admin';

export async function login(email, password) {
  const u = await one('select * from users where lower(email)=lower($1)', [email.trim()]);
  if (!u) return null;
  const ok = await bcrypt.compare(password, u.password_hash);
  if (!ok) return null;
  await createSession(u); return u;
}
export const hashPassword = pw => bcrypt.hash(pw, 10);
export async function anyUsers() { const r = await one('select count(*)::int as n from users'); return r.n > 0; }
