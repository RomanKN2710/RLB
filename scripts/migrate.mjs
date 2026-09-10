import fs from 'node:fs'; import pg from 'pg';
const url = process.env.DATABASE_URL; if (!url) { console.error('DATABASE_URL fehlt'); process.exit(1); }
const ssl = /sslmode=require|neon\.tech|supabase\.co|vercel-storage/.test(url) ? { rejectUnauthorized: false } : undefined;
const c = new pg.Client({ connectionString: url, ssl }); await c.connect();
await c.query(fs.readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8'));
console.log('Schema angelegt/aktualisiert'); await c.end();
