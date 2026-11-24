import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseElfDesTages, classify } from '../src/lib/kicker-parse.js';
import { matchStats, parseSquadPage } from '../src/lib/kicker-parse.js';

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
    const r = parseElfDesTages(html); assert.equal(r.elf.length, 11); assert.equal(r.elf[2].name, 'Schlotterbeck'); assert.equal(r.sdt.slug, 'harry-kane'); assert.equal(r.sdt.name, 'Kane', 'Kurzname wie auf der Karte');
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

import fs from 'node:fs';
describe('parseElfDesTages auf echten kicker-Seiten (Quelltexte aus dem Eingang)', () => {
  const page = n => fs.readFileSync(new URL(`./fixtures/kicker-elf-des-tages-st${n}.html`, import.meta.url), 'utf8');
  test('Spieltag 3: Elf und Spieler des Tages Matanovic (nicht der erste Spieler auf dem Feld)', () => {
    const r = parseElfDesTages(page(3)); assert.equal(r.elf.length, 11); assert.equal(r.diag.how, 'feld'); assert.ok(r.elf.some(p => p.name === 'Matanovic'));
    assert.equal(r.sdt.slug, 'igor-matanovic-2'); assert.equal(r.sdt.team, 'sc-freiburg'); assert.equal(r.sdt.name, 'Matanovic');
  });
  test('Spieltag 5: Spieler des Tages Nkunku', () => {
    const r = parseElfDesTages(page(5)); assert.equal(r.elf.length, 11); assert.deepEqual(r.elf.map(p => p.name), ['Schick', 'Diaby', 'Stiller', 'Svensson', 'Caci', 'van den Bosch', 'Vandevoordt', 'Lukeba', 'Banzuzi', 'Nusa', 'Nkunku']);
    assert.equal(r.sdt.slug, 'christopher-nkunku'); assert.equal(r.sdt.name, 'Nkunku');
  });
  test('Spieltag 4, Seite vor der Veröffentlichung: keine Elf, keine Rangliste als Elf', () => {
    const r = parseElfDesTages(page(4)); assert.equal(r.elf.length, 0); assert.equal(r.sdt, null); assert.equal(r.diag.how, 'unveroeffentlicht');
  });
});

describe('Elf des Tages Spieltag 6 (echte Handy-Seite kicker.ch, og:url ohne Spieltag, Links auf alle Spieltage)', () => {
  const html = fs.readFileSync(new URL('./fixtures/kicker-elf-des-tages-st6.html', import.meta.url), 'utf8');
  test('Spieltag aus dem Titel, nicht aus den Links im Text', () => { const c = classify(html, ''); assert.equal(c.kind, 'elf'); assert.equal(c.matchday, 6); assert.equal(c.matchdaySource, 'title'); });
  test('Adresse vom Sender geht vor', () => { assert.equal(classify(html, 'https://www.kicker.ch/bundesliga/elf-des-tages/2026-27/6').matchday, 6); });
  test('11 Spieler, Spieler des Tages Luis Diaz', () => { const e = parseElfDesTages(html); assert.equal(e.elf.length, 11); assert.equal(e.sdt?.name, 'Luis Diaz'); assert.ok(e.elf.some(p => p.name === 'Kane') && e.elf.some(p => p.name === 'Karius')); });
});

describe('Assist bei Eigentor (Entscheid 26.10.2026)', () => {
  const bischof = { slug: 'tom-bischof', name: 'Bischof', team: 'fc-bayern-muenchen' }, makengo = { slug: 'jordy-makengo', name: 'Makengo', team: 'sc-freiburg' };
  const parsed = { starters: [{ ...bischof, pos: 'M' }, { ...makengo, pos: 'V' }], bench: [], events: [{ type: 'goal', minute: '82', scorer: bischof, assist: makengo, ownGoal: true, penalty: false }] };
  test('Vorlage zum Eigentor zählt als Assist, das Eigentor nicht als Tor', () => { const s = matchStats(parsed); assert.equal(s['jordy-makengo'].assist, 1); assert.equal(s['tom-bischof'].tore, 0); assert.match(s['jordy-makengo'].notes[0], /als Assist gezählt/); });
  test('abschaltbar', () => { assert.equal(matchStats(parsed, { assistOnOwnGoal: false })['jordy-makengo'].assist, 0); });
});

describe('parseSquadPage', () => {
  const row = (href, last, first) => `<tr><td>1</td><td><a href="${href}"><strong>${last}</strong><span>${first}</span></a></td></tr>`;
  const section = (title, rows) => `<div><h2 class="kick__section-headline kick__section-headline--tableheadline">${title}</h2><table class="kick__table"><tbody>${rows.join('')}</tbody></table></div>`;
  test('im Browser gespeicherte Seite (volle Adressen) und live geladene (relative Links)', () => {
    const html = `<h2 class="kick__site-headline">Aktueller Kader</h2>`
      + section('Tor', [row('https://www.kicker.ch/manuel-neuer/spieler/bundesliga/2026-27/fc-bayern-muenchen', 'Neuer', 'Manuel')])
      + section('Abwehr', [row('/alphonso-davies/spieler/bundesliga/2026-27/fc-bayern-muenchen', 'Davies', 'Alphonso')])
      + section('Sturm', [row('https://www.kicker.de/harry-kane/spieler/bundesliga/2026-27/fc-bayern-muenchen', 'Kane', 'Harry')])
      + section('Trainer', [row('https://www.kicker.ch/vincent-kompany/trainer/fc-bayern-muenchen', 'Kompany', 'Vincent')]);
    assert.deepEqual(parseSquadPage(html), [
      { pos: 'T', last: 'Neuer', first: 'Manuel', slug: 'manuel-neuer' },
      { pos: 'V', last: 'Davies', first: 'Alphonso', slug: 'alphonso-davies' },
      { pos: 'S', last: 'Kane', first: 'Harry', slug: 'harry-kane' },
    ]);
  });
});

import { playerMatches, resolveKickerPlayer, clubMatches } from '../src/lib/kicker-match.js';
import { competitionOf } from '../src/lib/kicker-parse.js';
import kickerClubs from '../src/lib/kicker-clubs.js';
import { entryValues } from '../src/lib/rules.js';

describe('Namensabgleich kicker ↔ RLB (Review 24.11.2026)', () => {
  test('ganze Namensteile: Ilic ist nicht Milic, Baum nicht Nussbaum', () => {
    assert.equal(playerMatches('danilho-milic', 'Milic', 'Ilic'), false); assert.equal(playerMatches('paul-nussbaum', 'Nussbaum', 'Baum'), false);
    for (const [slug, name, our] of [['nico-schlotterbeck', 'Schlotterbeck', 'Schlotterbeck N.'], ['said-el-mala', 'El Mala', 'El Mala'], ['jonas-heuer-fernandes', 'Heuer Fernandes', 'Heuer Fernandes'], ['luis-diaz', 'L. Diaz', 'Luis Diaz'], ['emmanuel-latte-lath', 'Latte Lath', 'Latte Lath'], ['florian-grillitsch', 'Grillitsch', 'Grillitsch'], ['marvin-gruell', 'Grüll', 'Grull']]) assert.equal(playerMatches(slug, name, our), true, our);
  });
  test('Vereinsliste als Modul entspricht db/seed/kicker-clubs.json', () => { assert.deepEqual(kickerClubs, JSON.parse(fs.readFileSync(new URL('../db/seed/kicker-clubs.json', import.meta.url), 'utf8'))); });
  test('kicker-Kennung gilt über Vereine hinweg: Vereinswechsel wird erkannt statt Nullwerte zu schreiben', () => {
    const p = { id: 'x', name: 'Stage', club: 'Bremen', kicker_slug: 'jens-stage', base_pos: 'M', extra_pos: [] };
    const r = resolveKickerPlayer({ slug: 'jens-stage', name: 'Stage', team: 'vfb-stuttgart' }, [p], null);
    assert.equal(r.player.id, 'x'); assert.equal(r.clubChanged, true);
    assert.equal(resolveKickerPlayer({ slug: 'jens-stage', name: 'Stage', team: 'werder-bremen' }, [p], null).clubChanged, undefined);
    assert.equal(clubMatches('vfb-stuttgart', 'Stuttgart'), true);
  });
  test('ohne Kennung bleibt der Abgleich auf den Verein beschränkt', () => {
    const p = { id: 'x', name: 'Stage', club: 'Bremen', kicker_slug: null, base_pos: 'M', extra_pos: [] };
    assert.equal(resolveKickerPlayer({ slug: 'jens-stage', name: 'Stage', team: 'vfb-stuttgart' }, [p], null), null);
  });
});
describe('Nur Bundesliga der laufenden Saison im Eingang', () => {
  const page = u => `<html><head><link rel="canonical" href="${u}"></head></html>`;
  test('Wettbewerb und Saison aus der Adresse', () => {
    assert.deepEqual(competitionOf(page('https://www.kicker.de/bremen-gegen-dortmund-2026-bundesliga-4862091/aufstellung')), { wettbewerb: 'bundesliga', jahr: 2026 });
    assert.equal(competitionOf(page('https://www.kicker.de/bayern-gegen-leverkusen-2026-dfb-pokal-4934123/aufstellung')).wettbewerb, 'dfb-pokal');
    assert.equal(competitionOf('', 'https://www.kicker.ch/a-gegen-b-2026-2-bundesliga-493412/aufstellung').wettbewerb, '2-bundesliga');
    assert.equal(competitionOf('', 'https://www.kicker.de/a-gegen-b-2025-bundesliga-493412/aufstellung').jahr, 2025);
    assert.equal(competitionOf('<html></html>'), null);
  });
});
describe('Verein der Runde (results.club)', () => {
  const clubRes = { Bremen: { pts: 3, cs: true }, Stuttgart: { pts: 0, cs: false } };
  test('nach einem Vereinswechsel zählt die frühere Runde mit dem damaligen Verein', () => {
    const player = { club: 'Stuttgart' };
    assert.equal(entryValues(player, 'V', { start: 1, club: 'Bremen' }, clubRes).punkte, 3); assert.equal(entryValues(player, 'V', { start: 1, club: 'Bremen' }, clubRes).shutout, 1);
    assert.equal(entryValues(player, 'V', { start: 1 }, clubRes).punkte, 0);
  });
});
