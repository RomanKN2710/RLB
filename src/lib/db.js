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

/* Spalten und Tabellen, die seit der Ersteinrichtung dazugekommen sind. Läuft einmal je Serverinstanz (alles «if not exists»),
   damit neue Versionen ohne Handgriff an der Datenbank starten. Jede Zeile steht auch in db/schema.sql (tests/schema.test.mjs). */
const DDL = [
  "alter table trades add column if not exists lineup_snapshot jsonb",
  "alter table players add column if not exists extra_pos_denied text[] not null default '{}'",
  "alter table results add column if not exists club text",
  "alter table results add column if not exists manager_id int",
  "alter table users add column if not exists pw_changed_at timestamptz",
  "create table if not exists login_attempts (id bigserial primary key, email text, ip text, ok boolean not null default false, at timestamptz not null default now())",
  "create index if not exists login_attempts_at on login_attempts(at)",
  "alter table users add column if not exists mail_off boolean not null default false",
  "create table if not exists mail_log (id bigserial primary key, at timestamptz not null default now(), kind text not null, round_id int, user_id int, ok boolean not null default false, error text)",
  "create table if not exists password_resets (id bigserial primary key, user_id int not null, token_hash text not null, expires_at timestamptz not null, used_at timestamptz, created_at timestamptz not null default now())",
  "create table if not exists bl_stats (slug text not null, matchday int not null, club text, start int not null default 0, assist int not null default 0, tore int not null default 0, karten int not null default 0, primary key (slug, matchday))",
  "create table if not exists backups (id serial primary key, at timestamptz not null default now(), art text not null default 'auto', bytes int not null, tabellen jsonb, data bytea not null)",
];
export async function ensureSchema() {
  if (!globalThis.__rlbSchema) globalThis.__rlbSchema = (async () => { for (const s of DDL) await pool.query(s); })().catch(e => { globalThis.__rlbSchema = null; throw e; });
  return globalThis.__rlbSchema;
}

/** Uebersetzt typische Datenbankfehler in einen Satz, der sagt, was zu tun ist. */
export function dbHint(e) {
  const c = e && e.code;
  if (c === '42P01') return 'Die Datenbank ist noch leer: die Tabellen fehlen. Bitte einmal /api/setup?key=CRON_SECRET aufrufen.';
  if (c === '28P01' || c === '28000') return 'Die Datenbank weist die Zugangsdaten ab – DATABASE_URL im Projekt pruefen.';
  if (c === '3D000') return 'Die in DATABASE_URL angegebene Datenbank existiert nicht.';
  if (['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'].includes(c)) return 'Keine Verbindung zur Datenbank – DATABASE_URL im Projekt pruefen.';
  if (!dbUrl()) return 'Im Projekt ist keine DATABASE_URL gesetzt (Vercel: Storage > Neon verbinden, danach Redeploy).';
  return 'Datenbankfehler: ' + (e && e.message ? e.message : String(e));
}

/** Steht das Schema schon? */
export async function schemaReady() { try { await q('select 1 from users limit 1'); return true; } catch { return false; } }

export async function getSetting(key, dflt = null) { const r = await one('select value from settings where key=$1', [key]); return r ? r.value : dflt; }
export async function setSetting(key, value) { await q('insert into settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)]); }
export async function audit(userId, action, detail) { try { await q('insert into audit(user_id,action,detail) values($1,$2,$3)', [userId || null, action, JSON.stringify(detail || {})]); } catch (e) { /* best effort */ } }
