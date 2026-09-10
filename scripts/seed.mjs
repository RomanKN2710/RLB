import fs from 'node:fs'; import pg from 'pg';
import { runSeed } from '../db/seed/seed-core.mjs';
const url = process.env.DATABASE_URL; if (!url) { console.error('DATABASE_URL fehlt'); process.exit(1); }
const ssl = /sslmode=require|neon\.tech|supabase\.co|vercel-storage/.test(url) ? { rejectUnauthorized: false } : undefined;
const c = new pg.Client({ connectionString: url, ssl }); await c.connect();
await runSeed(async (t, p = []) => (await c.query(t, p)).rows, process.env, JSON.parse(fs.readFileSync(new URL('../db/seed/runde1.json', import.meta.url), 'utf8')));
// Spielerpool aus kicker-Kader-Momentaufnahme (nur wenn leer)
const kader = JSON.parse(fs.readFileSync(new URL('../db/seed/kicker-kader.json', import.meta.url), 'utf8'));
const clubs = JSON.parse(fs.readFileSync(new URL('../db/seed/kicker-clubs.json', import.meta.url), 'utf8')); const clubOf = Object.fromEntries(Object.entries(clubs).map(([k, v]) => [v, k]));
if ((await c.query('select count(*)::int as n from bl_players where in_squad')).rows[0].n === 0) {
  let n = 0; for (const [cs, list] of Object.entries(kader.squads)) for (const [pos, last, first, slug] of list) { await c.query("insert into bl_players(slug,name,first_name,club,pos,squad_pos,in_squad,seen_at) values($1,$2,$3,$4,$5,$5,true,now()) on conflict(slug) do update set club=excluded.club, squad_pos=excluded.squad_pos, in_squad=true, seen_at=now()", [slug, last || first, first || null, clubOf[cs] || cs, pos]); n++; }
  console.log('Spielerpool:', n, 'Spieler (kicker, Stand', kader.date + ')');
}
await c.end();
