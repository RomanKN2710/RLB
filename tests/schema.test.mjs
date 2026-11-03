/* Das Schema muss vollstaendig sein: jede Tabelle und Spalte, die der Code zur Laufzeit mit «create table if not exists» /
   «add column if not exists» anlegt, steht auch in db/schema.sql. Sonst fehlen sie in Kopien und Testdatenbanken. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const schema = fs.readFileSync(path.join(ROOT, 'db/schema.sql'), 'utf8').toLowerCase();
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const code = walk(path.join(ROOT, 'src')).filter(f => f.endsWith('.js')).map(f => fs.readFileSync(f, 'utf8')).join('\n');

describe('db/schema.sql ist vollständig', () => {
  test('jede zur Laufzeit angelegte Tabelle steht im Schema', () => {
    const tables = [...new Set([...code.matchAll(/create table if not exists\s+([a-z_]+)/gi)].map(m => m[1].toLowerCase()))];
    assert.ok(tables.length >= 4, 'Laufzeit-Tabellen gefunden: ' + tables.join(', '));
    const fehlt = tables.filter(t => !new RegExp(`create table if not exists\\s+${t}\\b`).test(schema));
    assert.deepEqual(fehlt, [], 'in db/schema.sql ergänzen: ' + fehlt.join(', '));
  });
  test('jede zur Laufzeit ergänzte Spalte steht im Schema', () => {
    const cols = [...new Set([...code.matchAll(/alter table\s+([a-z_]+)\s+add column if not exists\s+([a-z_]+)/gi)].map(m => `${m[1]}.${m[2]}`.toLowerCase()))];
    assert.ok(cols.length >= 5, 'Laufzeit-Spalten gefunden: ' + cols.join(', '));
    const fehlt = cols.filter(c => { const [t, col] = c.split('.'); const def = schema.slice(schema.indexOf(`create table if not exists ${t}`)); const body = def.slice(0, def.indexOf(');'));
      return !new RegExp(`(^|\\n)\\s*${col}\\s`).test(body) && !new RegExp(`alter table ${t} add column if not exists ${col}\\b`).test(schema); });
    assert.deepEqual(fehlt, [], 'in db/schema.sql ergänzen: ' + fehlt.join(', '));
  });
});
