import { Pool } from 'pg';

/** Verbindungszeichenfolge: DATABASE_URL, sonst die von Vercel/Neon gesetzten Alternativen. */
export function dbUrl() {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '';
}

let pool = globalThis.__rlbPool;
if (!pool) {
  const url = dbUrl();
  const ssl = url && /sslmode=require|neon\.tech|supabase\.co|vercel-storage/.test(url) ? { rejectUnauthorized: false } : undefined;
  pool = new Pool({ connectionString: url, ssl, max: 5 });
  globalThis.__rlbPool = pool;
}

/** Führt eine SQL-Abfrage aus und liefert die Zeilen. */
export async function q(text, params = []) {
  const r = await pool.query(text, params);
  return r.rows;
}
export async function one(text, params = []) { const rows = await q(text, params); return rows[0] || null; }

/** Transaktion: fn erhält einen Client mit q()/one(). */
export async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('begin');
    const api = { q: async (t, p = []) => (await client.query(t, p)).rows, one: async (t, p = []) => (await client.query(t, p)).rows[0] || null };
    const res = await fn(api);
    await client.query('commit');
    return res;
  } catch (e) { await client.query('rollback'); throw e; } finally { client.release(); }
}

export async function getSetting(key, dflt = null) { const r = await one('select value from settings where key=$1', [key]); return r ? r.value : dflt; }
export async function setSetting(key, value) { await q('insert into settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)]); }
export async function audit(userId, action, detail) { try { await q('insert into audit(user_id,action,detail) values($1,$2,$3)', [userId || null, action, JSON.stringify(detail || {})]); } catch (e) { /* best effort */ } }
