/* Hilfe und Handbuch muessen zur App passen: jede Bezeichnung in «…», die Hilfeseite oder Handbuch-Folien nennen,
   muss im Code der App vorkommen (Knopf, Ueberschrift, Meldung). Wer einen Knopf umbenennt oder entfernt, sieht hier,
   welche Hilfetexte nachzuziehen sind. Bezeichnungen von aussen (kicker, Firefox, Beispieltexte) stehen in EXTERN. */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(new URL('..', import.meta.url).pathname);
const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const HILFE = path.join(ROOT, 'src/app/admin/hilfe/page.js');
const SLIDES = path.join(ROOT, 'docs/handbuch/slides');
const code = walk(path.join(ROOT, 'src')).filter(f => /\.(js|mjs)$/.test(f) && f !== HILFE).map(f => fs.readFileSync(f, 'utf8')).join('\n');
const norm = s => s.replace(/&amp;/g, '&').replace(/[0-9]+/g, '#').replace(/\s+/g, ' ').trim().toLowerCase();
// Code zweimal: wie er ist, und mit Platzhaltern fuer eingesetzte Werte (${x}, {x.n}) – «Name prüfen 0» passt so auf «Name prüfen ${c.nicht_gefunden || 0}»
const werte = c => c.replace(/\$\{[^{}]*\}|\{[\w.?|' ]*\}/g, '0');
const mitHilfe = code + '\n' + fs.readFileSync(HILFE, 'utf8');   // fuer die Folien zaehlt die Hilfeseite zur App (dort liegt z. B. der Download-Knopf)
const C = { ohne: [norm(code), norm(werte(code))], mit: [norm(mitHilfe), norm(werte(mitHilfe))] };
const inCode = (l, set = 'ohne') => C[set].some(c => c.includes(norm(l)));
// Bezeichnungen, die nicht aus der App stammen
const EXTERN = new Set(['Links in Apps öffnen', 'Nie', 'Tampermonkey', 'Aufstellung', 'RLB: … importiert, Eingang 5/9', 'Fabio Viera',
  'Biete Potulski, Mainz, V, 2.- und entlasse Dallinga. Ihn für Claude-Maurice einwechseln.', 'Biete Potulski, Mainz, V, 2.- und entlasse Dallinga. Ihn für Claude-Maurice einwechseln.»', 'Biete Potulski, Mainz, V, 2.- und entlasse Dallinga. ihn würde ich gleich für Claude-Maurice einwechseln. falls ich ihn nicht erhalte, dann Kramaric …',
  'Direkt einwechseln', 'falls ich ihn nicht erhalte', 'Gesendet …', 'said-el-mala', 'romankn2710/rlb', 'main', 'Schlotterbeck (Dortmund)', 'Hilfe',
  'npm test', 'entlasse X', 'für Y einwechseln',
  // aus mehreren Code-Teilen zusammengesetzt (Zahl und Text getrennt im JSX)
  'max. 2 Käufe', '9/9 + Elf', '9/9 Spiele + Elf des Tages', 'k:M', 'Name prüfen 0 · Spiel fehlt 0']);
const labels = txt => [...txt.matchAll(/«([^«»]{1,140})»/g)].map(m => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
const missing = (file, list, set = 'ohne') => list.filter(l => !EXTERN.has(l) && !inCode(l, set)).map(l => `${path.basename(file)}: «${l}»`);

describe('Hilfe und Handbuch passen zur App', () => {
  test('Hilfeseite nennt nur Bezeichnungen, die es in der App gibt', () => {
    const m = missing(HILFE, labels(fs.readFileSync(HILFE, 'utf8'))); assert.deepEqual(m, [], 'Hilfeseite anpassen: ' + m.join(' · '));
  });
  test('Handbuch-Folien nennen nur Bezeichnungen, die es in der App gibt', () => {
    const m = fs.readdirSync(SLIDES).filter(f => f.endsWith('.html')).flatMap(f => missing(f, labels(fs.readFileSync(path.join(SLIDES, f), 'utf8')), 'mit'));
    assert.deepEqual(m, [], 'Handbuch-Folien anpassen (docs/handbuch/slides) und «npm run handbuch»: ' + m.join(' · '));
  });
  test('Handbuch: jede Folie aus deck.json existiert, jedes Bild ebenso, PDF ist gebaut', () => {
    const deck = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs/handbuch/deck.json'), 'utf8'));
    for (const id of deck.order) assert.ok(fs.existsSync(path.join(SLIDES, id + '.html')), `Folie ${id} fehlt`);
    for (const f of fs.readdirSync(SLIDES)) for (const m of fs.readFileSync(path.join(SLIDES, f), 'utf8').matchAll(/src="([^"]+)"/g)) assert.ok(fs.existsSync(path.join(ROOT, 'docs/handbuch', m[1])), `${f}: Bild ${m[1]} fehlt`);
    assert.ok(fs.existsSync(path.join(ROOT, 'docs/handbuch/rlb-admin-handbuch.pdf')), 'PDF fehlt – npm run handbuch');
  });
});
