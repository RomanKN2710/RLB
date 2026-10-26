import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseLineupText, findPlayer } from '../src/lib/aufstellungstext.js';
import fs from 'node:fs';
import { managers, kader, kaderOf, mid, posts, postsBetween, blogger, post } from './helpers/blog-fixture.mjs';

const names = x => x.found.map(f => f.name).sort();
const pos = (x, n) => x.found.find(f => f.name === n)?.pos;
const parse = (text, opts = {}) => parseLineupText(text, managers, kaderOf, opts);
const block = (res, name) => res.blocks.find(b => b.name === name);
// Vorrunden-Aufstellungen aus den echten Posts der Runde 3 bzw. 4
const baseFrom = (from, to, rn) => { const b = {}; for (const x of parse(blogger(postsBetween(from, to)), { roundNumbers: [rn * 10, rn] }).blocks) b[x.managerId] = { entries: x.entries }; return id => b[id]; };
const base2 = baseFrom('2026-08-28T19:00', '2026-09-05', 2), base3 = baseFrom('2026-09-04T19:00', '2026-09-12', 3), base4 = baseFrom('2026-09-11T19:00', '2026-09-19', 4);

describe('echte Blog-Posts', () => {
  // Arbi und Dani haben in Runde 4 tatsächlich vier Stürmer gemeldet (Lemperle und Fabio Silva sind nur Stürmer); das muss die Prüfung melden
  for (const [rn, from, to, expectOk, baseOf] of [[2, '2026-08-28T19:00', '2026-09-05', 9, undefined], [3, '2026-09-04T19:00', '2026-09-12', 9, base2], [4, '2026-09-11T19:00', '2026-09-19', 7, base3]]) {
    test(`Runde ${rn}: alle Aufstellungs-Posts erkannt, mindestens ${expectOk} zulässig`, () => {
      const res = parse(blogger(postsBetween(from, to)), { roundNumbers: [rn * 10, rn], roundLabel: `Spieltag ${rn}`, baseOf, notBefore: from.replace('T19:00', 'T17:00:00Z') });
      for (const x of res.blocks) assert.equal(x.found.length, 11, `${x.name}: ${x.found.length} Spieler (${x.problems.join('; ')})`);
      assert.ok(res.blocks.filter(x => x.ok).length >= expectOk, res.blocks.filter(x => !x.ok).map(x => `${x.name}: ${x.problems.join('; ')}`).join(' | '));
      assert.deepEqual(res.unclear, []);
    });
  }
  test('Runde 4: Wechsel aus den Posts richtig gelesen', () => {
    const res = parse(blogger(postsBetween('2026-09-11T19:00', '2026-09-19')), { roundNumbers: [40, 4] });
    assert.ok(names(block(res, 'Mark')).includes('El Ouahdi') && !names(block(res, 'Mark')).includes('Veerman'), 'Mark: El Ouadih f Veermann');
    assert.ok(names(block(res, 'Roman')).includes('Avdullahu') && !names(block(res, 'Roman')).includes('Kleindienst'), 'Roman: Tabellenspalte «für Kleindiesnt»');
    assert.ok(names(block(res, 'Arbi')).includes('Hlozek') && !names(block(res, 'Arbi')).includes('Scally'), 'Arbi: Einwechslung oben, Tabelle unten');
    assert.equal(block(res, 'Mark').title, 'Mark 4 + Mark 4 NEU', 'beide Posts gelesen, der neuere gilt');
    assert.ok(res.skipped.some(s => /Gebot/.test(s)), 'Gebots-Posts übersprungen');
    assert.deepEqual(res.missing, ['Lazar']);
  });
  test('Runde 3: Pädis Post mit altem Titel «Runde 2» zählt, weil er in dieser Runde erschien', () => {
    const res = parse(blogger(postsBetween('2026-09-04T19:00', '2026-09-12')), { roundNumbers: [30, 3], roundLabel: 'Spieltag 3', baseOf: base2, notBefore: '2026-09-04T17:00:00Z' });
    const x = block(res, 'Pädi'); assert.ok(x && x.ok); assert.ok(x.notes.some(n => /Titel nennt Runde 2/.test(n))); assert.ok(names(x).includes('Posch') && !names(x).includes('Itakura'));
  });
  test('Update-Post gilt, auch ohne Datumszeilen (Blog zeigt den neuesten oben)', () => {
    const r3 = posts.filter(p => /Mike Runde 3/.test(p.title));
    for (const dates of [true, false]) { const x = block(parse(blogger(r3, { dates }), { roundNumbers: [30, 3] }), 'Mike'); assert.ok(x.ok); assert.ok(names(x).includes('Diaby') && !names(x).includes('El Mala'), 'Update: Diaby anstatt El Mala'); }
  });
});

describe('nur Wechsel (auf die Vorrunde angewendet)', () => {
  const cases = [
    ['«X für Y»', 'Arbi R5', 'Wechsel: Kramaric für Lemperle', 'Arbi', ['Kramaric'], ['Lemperle']],
    ['kurze Wechselzeile mit Position', 'Mike Runde 5', 'Wechsel:\nV Esteve, Leipzig für V Katic, Schalke\nM Stiller für M El Mala', 'Mike', ['Esteve', 'Stiller'], ['Katic', 'El Mala']],
    ['«Raus: / Rein:»', 'Roman Runde 5', 'Raus: Rieder\nRein: Karl', 'Roman', ['Karl'], ['Rieder']],
    ['«X rein, Y raus»', 'René R5', 'Juranovic rein, Rots raus', 'René', ['Juranovic'], ['Rots']],
    ['«X f Y, Z f W»', 'Mark 5', 'Schick f Kofane', 'Mark', ['Schick'], ['Kofane']],
    ['Mail mit Gruss', 'David Runde 5', 'Hi Sabine,\n\nWechsel: Rothe (V, Union) für Baum (V, Frankfurt)\n\nVielen Dank und VG\nDavid', 'David', ['Rothe'], ['Baum']],
    ['Einwechslung / Auswechslung getrennt', 'Mike Runde 5', 'Einwechslung\nStiller, Stuttgart, M\nAuswechslung\nEl Mala, Köln', 'Mike', ['Stiller'], ['El Mala']],
    ['Pfeil in falscher Richtung', 'Aufstellung Runde 5 - Pädi', 'Grüll -> Prömel', 'Pädi', ['Prömel'], ['Grüll']],
    ['Bindestrich', 'Roman Runde 5', 'Wechsel: Karl - Rieder', 'Roman', ['Karl'], ['Rieder']],
    ['«IN: X OUT: Y»', 'Roman Runde 5', 'IN: Karl OUT: Rieder', 'Roman', ['Karl'], ['Rieder']],
    ['englisch', 'Roman Runde 5', 'Karl for Rieder', 'Roman', ['Karl'], ['Rieder']],
    ['«Y wird durch X ersetzt»', 'Roman Runde 5', 'Rieder wird durch Karl ersetzt', 'Roman', ['Karl'], ['Rieder']],
  ];
  for (const [label, title, body, mgr, ins, outs] of cases) test(label, () => {
    const x = block(parse(blogger([post(title, body)]), { roundNumbers: [50, 5], baseOf: base4 }), mgr);
    assert.ok(x, 'Manager erkannt'); assert.ok(x.ok, x.problems.join('; '));
    for (const n of ins) assert.ok(names(x).includes(n), n + ' rein'); for (const n of outs) assert.ok(!names(x).includes(n), n + ' raus');
    assert.equal(x.art, 'wechsel');
  });
  test('«Keine Wechsel» und Update-Post ergänzen den früheren', () => {
    const res = parse(blogger([post('Röfe R5', 'Keine Wechsel', { time: '09:00' }), post('Arbi R5', 'Wechsel: Kramaric für Lemperle', { time: '10:00' }), post('Arbi R5 Update', 'Update: Bensebaini statt Mensah', { time: '11:00' }), post('Mark 5 unverändert', '', { time: '11:30' })]), { roundNumbers: [50, 5], baseOf: base4 });
    assert.equal(block(res, 'Röfe').art, 'vorrunde'); assert.ok(block(res, 'Röfe').ok);
    const a = block(res, 'Arbi'); assert.ok(names(a).includes('Kramaric') && names(a).includes('Bensebaini') && !names(a).includes('Lemperle') && !names(a).includes('Mensah'));
    assert.equal(block(res, 'Mark').art, 'vorrunde', 'Titel «unverändert»');
  });
});

describe('Elf-Liste zählt', () => {
  const OLD11 = 'T Flekken\nV Svensson\nV Chabot\nV Davies\nV Anton\nV Medina\nM Karl\nM Eggestein\nM Ibrahimovic\nS Fuellkrug\nS Kleindienst';
  const NEW11 = 'T Flekken\nV Svensson\nV Chabot\nV Davies\nV Anton\nV Medina\nM Avdullahu\nM Eggestein\nM Ibrahimovic\nM Rieder\nS Fuellkrug';
  const OLD = ['Flekken', 'Svensson', 'Chabot', 'Davies', 'Anton', 'Medina', 'Karl', 'Eggestein', 'Ibrahimovic', 'Fuellkrug', 'Kleindienst'].sort();
  const NEW = ['Flekken', 'Svensson', 'Chabot', 'Davies', 'Anton', 'Medina', 'Avdullahu', 'Eggestein', 'Ibrahimovic', 'Rieder', 'Fuellkrug'].sort();
  const roman = body => block(parse(blogger([post('Roman Runde 4', body, { day: '2026-09-18' })]), { roundNumbers: [40, 4], baseOf: base3 }), 'Roman');
  test('11 gelistet + Wechselzeilen, die abweichen: Liste gilt, Hinweis in den Notizen', () => { const x = roman(OLD11 + '\n\nWechsel:\nAvdullahu für Kleindienst\nRieder für Karl'); assert.ok(x.ok); assert.deepEqual(names(x), OLD); assert.ok(x.notes.some(n => /nicht angewendet/.test(n))); });
  test('11 gelistet + erklärende Wechsel (Mark-Fall): Liste gilt', () => { const x = roman(NEW11 + '\n\nWechsel: Rieder f Avdullahu, Karl f Eggestein, Avdullahu für Kleindienst'); assert.ok(x.ok); assert.deepEqual(names(x), NEW); });
  test('Tabelle mit Spalte Wechsel', () => { const x = roman('Pos | Team | Roman | Wechsel\nT | Flekken | Leverkusen\nV | Svensson | Dortmund\nV | Chabot | Stuttgart\nV | Davies | Bayern\nV | Anton | Dortmund\nV | Medina | Leverkusen\nM | Avdullahu | Hoffenheim | Kleindienst, Gladbach\nM | Eggestein | Freiburg\nM | Ibrahimovic | Bayern\nM | Rieder | Augsburg | Karl, Bayern\nS | Fuellkrug | Bremen'); assert.ok(x.ok); assert.deepEqual(names(x), NEW); });
  test('Elf + Bank: Bank zählt nicht', () => { const x = roman(NEW11 + '\n\nBank: Beier, Karetsas, Gosens'); assert.ok(x.ok); assert.deepEqual(names(x), NEW); });
  test('12 gelistet + «für»: Wechsel wird angewendet', () => { const x = roman(OLD11 + '\nM Avdullahu\n\nAvdullahu für Kleindienst'); assert.ok(x.ok); assert.ok(names(x).includes('Avdullahu') && !names(x).includes('Kleindienst')); });
  test('zu viele Spieler: Hinweis, wer neu ist', () => { const x = roman(OLD11 + '\nM Avdullahu'); assert.ok(!x.ok); assert.ok(x.problems.some(p => /neu gegenüber der Vorrunde: Avdullahu/.test(p))); });
  test('Schreibweisen: Nummern, «T:», Tabellenzeilen, Tippfehler, Verein dahinter, alles in einer Zeile', () => {
    for (const body of ['1. T Flekken Leverkusen\n2. V Svensson Dortmund\n3. V Chabot\n4. V Davies\n5. V Anton\n6. V Medina\n7. M Avdullahu\n8. M Eggestein\n9. M Ibrahimovic\n10. M Rieder\n11. S Füllkrug',
      'T: Flekken\nV: Svensson, Chabot, Davies, Anton, Medina\nM: Avdullahu, Eggestein, Ibrahimovic, Rieder\nS: Fuellkrug',
      'Torwart\nFlekken\nVerteidigung\nSvensson, Chabot, Davies, Anton, Medina\nMittelfeld\nAvdulahu, Egestein, Ibrahimovic, Rieder\nSturm\nFuellkrug',
      'Flekken, Svensson, Chabot, Davies, Anton, Medina, Avdullahu, Eggestein, Ibrahimovic, Rieder, Fuellkrug']) {
      const x = roman(body); assert.ok(x.ok, body.slice(0, 30) + ': ' + x.problems.join('; ')); assert.deepEqual(names(x), NEW, body.slice(0, 30)); }
  });
});

describe('Positionen', () => {
  const ELF = 'T Flekken\nV Svensson\nV Chabot\nV Davies\nV Anton\nV Medina\nM Eggestein\nM Ibrahimovic\n%B\nS Fuellkrug\nS Kleindienst';
  const roman = body => block(parse(blogger([post('Roman Runde 4', body, { day: '2026-09-18' })]), { roundNumbers: [40, 4], baseOf: base3 }), 'Roman');
  test('Spieler mit Zusatzposition ohne Angabe landet dort, wo die Elf aufgeht', () => { const x = roman(ELF.replace('%B', 'Beier')); assert.ok(x.ok, x.problems.join('; ')); assert.equal(pos(x, 'Beier'), 'M'); });
  test('auch mit falscher Angabe', () => { const x = roman(ELF.replace('%B', 'S Beier')); assert.ok(x.ok); assert.equal(pos(x, 'Beier'), 'M'); });
  test('V/M in der Tabelle wird so gewählt, dass es aufgeht', () => { const x = block(parse(blogger(posts.filter(p => p.title === 'Aufstellung Runde 4 - Pädi')), { roundNumbers: [40, 4] }), 'Pädi'); assert.ok(x.ok); assert.equal(x.found.filter(f => f.pos === 'V').length, 4); });
});

describe('Manager erkennen', () => {
  test('Spitzname, Verfasser-Rückfall, Titel ohne Namen', () => {
    const res = parse(blogger([post('Aufstellung Runde 5', 'Wechsel: Karaman für Leweling', { author: 'RÖFE' }), post('Team Roefe Runde 5', 'Keine Wechsel', { time: '13:00' }), post('Aufstellung Runde 5', 'Keine Wechsel', { author: 'Rolf Stauffer', time: '14:00' })]), { roundNumbers: [50, 5], baseOf: base4 });
    assert.equal(res.blocks.length, 1); assert.equal(res.blocks[0].name, 'Röfe'); assert.equal(res.blocks[0].title, 'Aufstellung Runde 5 + Team Roefe Runde 5 + Aufstellung Runde 5');
  });
  test('MARKADONA ist das Sammelkonto: Manager aus Betreff, Absender oder Unterschrift, nicht aus dem Verfasser', () => {
    const res = parse(blogger([
      post('Aufstellung Runde 5', 'Hi Sabine, Mark,\n\nhier meine Aufstellung für Runde 5.\n\nWechsel: Rothe (V, Union) für Baum (V, Frankfurt)\n\nVielen Dank und VG\nDavid', { time: '09:00' }),
      post('Fw: Aufstellung', 'Gesendet: Freitag, 16. Oktober 2026 um 10:00\nVon: rene.peter@sem.admin.ch\nAn: gebot@gmx.ch\nBetreff: Aufstellung Runde 5\n\nJuranovic rein, Rots raus', { time: '10:00' }),
      post('Fw: Aufstellung Runde 5', 'Von: "Patrick Duss" <patrick.duss@gmx.ch>\nAn: gebot@gmx.ch\nBetreff: Runde 5\n\nGrüll -> Prömel', { time: '11:00' }),
      post('Fw: Runde 5', 'Von: mike_buehler@gmx.ch\nAn: Mark Fehlmann\nBetreff: Runde 5\n\nWechsel: Stiller für El Mala', { time: '11:30' }),
      post('Runde 5', 'Wechsel: Schick für Kofane', { time: '12:00', author: 'MARKADONA' }),
    ]), { roundNumbers: [50, 5], baseOf: base4 });
    assert.deepEqual(res.blocks.map(b => b.name + ':' + b.ok).sort(), ['David:true', 'Mike:true', 'Pädi:true', 'René:true']);
    assert.ok(!res.blocks.some(b => b.name === 'Mark'), 'MARKADONA-Post ohne Namen wird nicht Mark zugeordnet');
    assert.equal(res.unclear.length, 1, 'Post ohne erkennbaren Manager wird gemeldet');
    assert.deepEqual(block(res, 'René').unmatched, [], 'Mail-Kopfzeilen erzeugen keine «nicht zugeordnet»-Einträge');
  });
  test('letzter Post ohne Fusszeile (Text endet mitten im Post) zählt', () => {
    const res = parse(blogger([post('Mike Runde 5', 'Wechsel: Stiller für El Mala')]) + '\nMark 5\nFührich f Veerman\n', { roundNumbers: [50, 5], baseOf: base4 });
    assert.deepEqual(res.blocks.map(b => b.name).sort(), ['Mark', 'Mike']); assert.ok(block(res, 'Mark').ok);
  });
  test('Chat-Text ohne Blog-Fusszeilen', () => {
    const res = parse('Arbi:\nKramaric für Lemperle\n\nMike\nkeine Änderungen\n\nRoman\nRieder raus, Karl rein', { roundNumbers: [50, 5], baseOf: base4 });
    assert.deepEqual(res.blocks.map(b => b.name + ':' + b.ok), ['Arbi:true', 'Mike:true', 'Roman:true']);
    assert.equal(block(res, 'Mike').art, 'vorrunde');
  });
  test('Posts für andere Runden und vor der Vorrunden-Deadline werden übersprungen', () => {
    const res = parse(blogger([post('Roman Runde 4', 'Wechsel: Karl für Rieder', { day: '2026-09-18' }), post('Roman Runde 5', 'Wechsel: Karl für Rieder', { day: '2026-09-10' })]), { roundNumbers: [50, 5], baseOf: base4, notBefore: '2026-09-18T17:00:00Z' });
    assert.equal(res.blocks.length, 0); assert.equal(res.skipped.length, 2);
  });
  test('Eventualauftrag und entlassener Spieler', () => {
    const rene = mid('René'); const heuer = kader[rene].find(p => p.name === 'Heuer Fernandes'); const karius = { id: 'rene-karius', name: 'Karius', base_pos: 'T', extra_pos: [], alias: [] };
    const kR = id => id === rene ? [...kader[rene].filter(p => p !== heuer), karius] : kader[id];
    const res = parseLineupText(blogger([post('René R5', 'V Juranovic für V Rots')]), managers, kR, { roundNumbers: [50, 5], baseOf: base4, goneOf: id => id === rene ? [heuer] : [], eventualOf: id => id === rene ? [{ inId: karius.id, outId: heuer.id }] : [] });
    const x = block(res, 'René'); assert.ok(x.ok, x.problems.join('; ')); assert.ok(names(x).includes('Karius') && !names(x).includes('Heuer Fernandes'));
  });
  test('Eventualauftrag mit anderer Position: Brackelmann (V) ersetzt El Aynaoui (M), Blog-Elf wird 4-4-2', () => {
    const david = mid('David'); const brack = { id: 'david-brackelmann-60', name: 'Brackelmann', base_pos: 'V', extra_pos: [], club: 'Augsburg', alias: [] }; const ayn = kader[david].find(p => p.name === 'El Aynaoui');
    const kD = id => id === david ? [...kader[david], brack] : kader[id];
    const text = blogger([post('David Runde 6', '3-5-2\n\nT Seimen, Stuttgart\n\nV Tah, Bayern\nV Laimer, Bayern\nV Upamecano, Bayern\n\nM El Aynaoui, Leipzig\nM Pavlovic, Bayern\nM Sano, Mainz\nM Gruda, Leipzig\nM Grifo, Freiburg\n\nS Gomis, Leipzig\nS Gnabry, Bayern', { day: '2026-10-16' })]);
    const res = parseLineupText(text, managers, kD, { roundNumbers: [60, 6], eventualOf: id => id === david ? [{ inId: brack.id, outId: ayn.id }] : [] });
    const x = block(res, 'David'); assert.ok(x.ok, x.problems.join('; ')); assert.ok(names(x).includes('Brackelmann') && !names(x).includes('El Aynaoui')); assert.equal(pos(x, 'Brackelmann'), 'V'); assert.equal(x.found.filter(f => f.pos === 'V').length, 4);
  });
});

describe('Handy-Blog Runde 7 (23.10.2026)', () => {
  const text = fs.readFileSync(new URL('./fixtures/blog-2026-10-23.txt', import.meta.url), 'utf8');
  const padi = mid('Pädi'), dani = mid('Dani'); const karius = { id: 'padi-karius', name: 'Karius', base_pos: 'T', extra_pos: [], alias: [] }; const maks = { id: 'padi-maksimovic', name: 'Maksimovic', base_pos: 'M', extra_pos: [], alias: [] };
  const kR = id => id === padi ? [...kader[padi], karius, maks] : kader[id];
  const res = parseLineupText(text, managers, kR, { roundNumbers: [70, 7], notBefore: '2026-10-16T17:00:00Z', deadline: '2026-10-23T17:00:00Z', baseOf: () => null });
  test('Blog-Kopf und Pager sind keine Posts; Gebots-Posts werden übersprungen', () => { assert.deepEqual(res.unclear, []); assert.ok(res.skipped.some(s => /Pädi: «Fw: Runde 7 Gebote Pädi».*Gebot/.test(s))); assert.ok(res.skipped.some(s => /Arbi: «Gebot Arbi».*Gebot/.test(s))); });
  test('Pädi: 4-4-2 mit «anstelle»-Wechseln, 11 Spieler', () => { const x = block(res, 'Pädi'); assert.ok(x.ok, x.problems.join('; ')); assert.equal(x.found.length, 11); assert.ok(names(x).includes('Prömel') && names(x).includes('Maksimovic') && !names(x).includes('Conté') && !names(x).includes('Nkunku')); });
  test('Dani: «Fabio Viera HSV» ist Vieira, nicht Fabio Silva – 11 Spieler', () => { const x = block(res, 'Dani'); assert.ok(x.ok, x.problems.join('; ')); assert.equal(x.found.length, 11); assert.ok(names(x).includes('Vieira') && names(x).includes('Fabio Silva')); });
  test('findPlayer: Nachname vor Vornamen', () => { assert.deepEqual(findPlayer('Fabio Viera', kader[dani]).hits.map(p => p.name), ['Vieira']); assert.deepEqual(findPlayer('Fabio Silva', kader[dani]).hits.map(p => p.name), ['Fabio Silva']); });
});
