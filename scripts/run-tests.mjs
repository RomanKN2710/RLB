// Alle Tests ausführen, unabhängig von der Node-Version (das Dateimuster von «node --test» gibt es erst ab Node 21).
// Wird auch beim Veröffentlichen ausgeführt (vercel.json): schlägt ein Test fehl, geht die neue Version nicht live.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve(new URL('../tests', import.meta.url).pathname);
const files = fs.readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort().map(f => path.join(dir, f));
if (!files.length) { console.error('Keine Tests gefunden in', dir); process.exit(1); }
const r = spawnSync(process.execPath, ['--no-warnings', '--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
