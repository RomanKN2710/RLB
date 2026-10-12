import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseElfDesTages, classify } from '../src/lib/kicker-parse.js';

const P = [['manuel-neuer', 'fc-bayern-muenchen', 'Neuer'], ['joshua-kimmich', 'fc-bayern-muenchen', 'Kimmich'], ['nico-schlotterbeck', 'borussia-dortmund', 'Schlotterbeck'], ['waldemar-anton', 'borussia-dortmund', 'Anton'], ['alphonso-davies', 'fc-bayern-muenchen', 'Davies'], ['angelo-stiller', 'vfb-stuttgart', 'Stiller'], ['michael-olise', 'fc-bayern-muenchen', 'Olise'], ['florian-wirtz', 'bayer-04-leverkusen', 'Wirtz'], ['jamie-gittens', 'borussia-dortmund', 'Gittens'], ['harry-kane', 'fc-bayern-muenchen', 'Kane'], ['serhou-guirassy', 'borussia-dortmund', 'Guirassy']];
const link = ([slug, team, name], inner) => `<a href="/${slug}/spieler/bundesliga/${team}" class="kick__lineup-player-card">${inner ?? `<img alt="${name} ${name}"><span class="kick__lineup-player-card__name">${name}</span>`}</a>`;
const head = (title, md = 5) => `<html><head><title>${title}</title><link rel="canonical" href="https://www.kicker.de/bundesliga/elf-des-tages/2026-27/${md}"></head><body><h1>Elf des Tages</h1>`;
const sdtCard = `<div class="kick__card"><h3 class="kick__card-headline">Spieler des Tages</h3><div class="kick__player-hero"><a href="/harry-kane/spieler/bundesliga/fc-bayern-muenchen"><img alt="Harry Kane"></a></div></div>`;

describe('parseElfDesTages', () => {
  test('Desktop: Spielfeld mit Spielerkarten', () => {
    const html = head('Elf des Tages | kicker') + `<div class="kick__lineup-field">${P.map(p => link(p)).join('')}</div>` + sdtCard + '</body></html>';
    const r = parseElfDesTages(html); assert.equal(r.elf.length, 11); assert.equal(r.elf[0].name, 'Neuer'); assert.equal(r.elf[0].team, 'fc-bayern-muenchen'); assert.equal(r.sdt.slug, 'harry-kane'); assert.equal(r.diag.how, 'feld');
  });
  test('Handy: Spielerkarten ohne Spielfeld-Container, Name nur im Bild', () => {
    const html = head('Elf des Tages') + `<section class="kick__module">${P.map(p => link(p, `<img alt="${p[2]}">`)).join('')}</section>` + sdtCard + '</body></html>';
    const r = parseElfDesTages(html); assert.equal(r.elf.length, 11); assert.equal(r.elf[2].name, 'Schlotterbeck'); assert.equal(r.sdt.name, 'Harry Kane');
  });
  test('Handy: Listenansicht nur mit Spielerlinks, doppelte Links, Spieler des Tages danach', () => {
    const plain = p => `<li><a href="/${p[0]}/spieler/bundesliga/${p[1]}">${p[2]}</a> <a href="/${p[0]}/spieler/bundesliga/${p[1]}">Profil</a></li>`;
    const html = head('kicker') + `<nav><a href="/thomas-mueller/spieler/bundesliga/fc-bayern-muenchen">Top-Spieler</a></nav><h2>Elf des Tages</h2><ul>${P.map(plain).join('')}</ul><h3>Spieler des Tages</h3><div><a href="/harry-kane/spieler/bundesliga/fc-bayern-muenchen">Harry Kane</a></div></body></html>`;
    const r = parseElfDesTages(html); assert.equal(r.elf.length, 11); assert.ok(!r.elf.some(p => p.slug === 'thomas-mueller'), 'Link vor der Überschrift zählt nicht'); assert.equal(r.elf[10].slug, 'serhou-guirassy'); assert.equal(r.sdt.slug, 'harry-kane'); assert.equal(r.diag.how, 'liste');
  });
  test('Seite ohne Elf: Diagnose statt Absturz', () => {
    const r = parseElfDesTages('<html><head><title>Elf des Tages</title></head><body><p>Die Elf des Tages liegt noch nicht vor.</p></body></html>');
    assert.equal(r.elf.length, 0); assert.equal(r.sdt, null); assert.equal(r.diag.playerLinks, 0); assert.equal(r.diag.title, 'Elf des Tages');
  });
});

describe('classify', () => {
  test('Elf des Tages an Adresse, Titel oder Überschrift, Spieltag aus Adresse/Titel', () => {
    assert.deepEqual(classify('<html><head><title>x</title></head></html>', 'https://www.kicker.de/bundesliga/elf-des-tages/2026-27/5'), { kind: 'elf', matchday: 5, matchdaySource: 'url', id: 'elf', title: 'x' });
    assert.equal(classify('<title>Elf des Tages - 7. Spieltag | kicker</title>').matchday, 7);
    assert.equal(classify('<title>Bundesliga</title><h1>Elf des Tages</h1><p>bundesliga_2026-27_6</p>').matchday, 6);
    assert.equal(classify('<title>Bundesliga</title><h1>Elf des Tages</h1>').matchday, null);
    // Spieltag-Auswahl auf der Seite («1. Spieltag», «2. Spieltag» …) darf den Spieltag nicht bestimmen
    assert.equal(classify('<title>Elf des Tages | kicker</title><select><option>1. Spieltag</option><option>2. Spieltag</option></select>').matchday, null);
    assert.equal(classify('<title>Elf des Tages | kicker</title><select><option>1. Spieltag</option></select>', 'https://www.kicker.de/bundesliga/elf-des-tages/2026-27/5').matchday, 5);
  });
  test('Aufstellungsseite: Kennung und Teams, auch mit Schrägstrich am Ende der Adresse', () => {
    const html = '<title>Bayern - Dortmund | kicker</title><div class="kick__lineup__teamrow"><div class="kick__lineup__teamrow__teamname">FC Bayern</div></div><div class="kick__lineup__teamrow"><div class="kick__lineup__teamrow__teamname">Dortmund</div></div><span>bundesliga_2026-27_5</span>';
    const c = classify(html, 'https://www.kicker.de/bayern-gegen-dortmund-2026-bundesliga-4932121/aufstellung/'); assert.equal(c.kind, 'match'); assert.equal(c.id, '4932121'); assert.equal(c.matchday, 5); assert.equal(c.title, 'FC Bayern – Dortmund');
  });
  test('Spielbericht statt Aufstellung: unbekannt', () => { assert.equal(classify('<title>Spielbericht</title>').kind, 'unknown'); });
});

describe('parseElfDesTages ohne Spielerlinks (Handy)', () => {
  const NAMES = ['Neuer', 'Kimmich', 'Schlotterbeck', 'Anton', 'Davies', 'Stiller', 'Olise', 'Wirtz', 'Gittens', 'Kane', 'Guirassy'];
  test('Spielerkarten als div mit Namensfeld', () => {
    const html = `<html><head><title>Elf des Tages</title></head><body><h1>Elf des Tages</h1><div class="kick__lineup">${NAMES.map(n => `<div class="kick__lineup-player-card"><img src="x.jpg"><div class="kick__lineup-player-card__name">${n}</div></div>`).join('')}</div><h3>Spieler des Tages</h3><div class="kick__player-hero"><img alt="Harry Kane"><div class="kick__player-hero__name">Harry Kane</div></div></body></html>`;
    const r = parseElfDesTages(html); assert.equal(r.elf.length, 11); assert.equal(r.elf[0].name, 'Neuer'); assert.equal(r.elf[0].slug, 'neuer'); assert.equal(r.elf[0].team, ''); assert.equal(r.sdt.name, 'Harry Kane'); assert.equal(r.diag.how, 'namen');
  });
  test('nur Bilder mit Namen nach der Überschrift', () => {
    const html = `<html><body><h2>Elf des Tages</h2><ul>${NAMES.map(n => `<li><img alt="${n}"><span>${n}</span></li>`).join('')}</ul><h3>Spieler des Tages</h3><img alt="Harry Kane"></body></html>`;
    const r = parseElfDesTages(html); assert.equal(r.elf.length, 11); assert.equal(r.elf[10].name, 'Guirassy'); assert.equal(r.sdt.name, 'Harry Kane');
  });
});
