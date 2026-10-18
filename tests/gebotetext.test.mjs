import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseBidText, playerSpec } from '../src/lib/gebotetext.js';
import { managers, kader, postsBetween, blogger, post } from './helpers/blog-fixture.mjs';

const kaderOf = id => kader[id];
const parse = (text, opts = {}) => parseBidText(text, managers, kaderOf, opts);
const block = (res, name) => res.blocks.find(b => b.name === name);
const bid = (x, i) => { const b = x.bids[i]; return `${b.pos || '?'} ${b.player_name} (${b.club || '?'}) ${b.price}${b.release ? ' -' + b.release.name : ''}${b.swapOut ? ' >' + b.swapOut.name : ''}`; };

describe('playerSpec', () => {
  test('Schreibweisen', () => {
    assert.deepEqual(playerSpec('M Nwaneri (Dortmund)'), { name: 'Nwaneri', club: 'Dortmund', pos: 'M' });
    assert.deepEqual(playerSpec('Nwaneri (M, BVB)'), { name: 'Nwaneri', club: 'Dortmund', pos: 'M' });
    assert.deepEqual(playerSpec('V Doué Guena, Leverkusen'), { name: 'Doué Guena', club: 'Leverkusen', pos: 'V' });
    assert.deepEqual(playerSpec('Brackelmann (V, Augsburg)'), { name: 'Brackelmann', club: 'Augsburg', pos: 'V' });
    assert.deepEqual(playerSpec('M Fabio Viera HSV'), { name: 'Fabio Viera', club: 'Hamburg', pos: 'M' });
    assert.deepEqual(playerSpec('Mensah, Köln, V'), { name: 'Mensah', club: 'Köln', pos: 'V' });
    assert.deepEqual(playerSpec('T Karius Schalke'), { name: 'Karius', club: 'Schalke', pos: 'T' });
    assert.deepEqual(playerSpec('Doué'), { name: 'Doué', club: null, pos: null });
  });
});

describe('Gebots-Posts Runde 2 (Archiv)', () => {
  const res = parse(blogger(postsBetween('2026-08-28T19:00', '2026-09-06')), { roundNumbers: [20, 2] });
  test('alle sieben Gebots-Posts erkannt, keine Aufstellungen dabei', () => { assert.deepEqual(res.blocks.map(b => b.name).sort(), ['Arbi', 'Dani', 'David', 'Mark', 'Pädi', 'Roman', 'Röfe']); assert.deepEqual(res.unclear, []); });
  test('Pädi: max. 3, neun Gebote in Reihenfolge, drei Entlassungen', () => { const x = block(res, 'Pädi'); assert.equal(x.maxWins, 3); assert.equal(x.bids.length, 9); assert.equal(bid(x, 0), 'M Nwaneri (Dortmund) 12'); assert.equal(bid(x, 8), 'V Bah (Augsburg) 2'); assert.deepEqual(x.releases.map(p => p.name), ['L. Vazquez', 'Bahoya', 'Konstantelias']); assert.ok(x.ok); });
  test('Röfe: kaufe max. 2, Entlassungen in Reihenfolge (Klammer mit Preis ist kein Gebot)', () => { const x = block(res, 'Röfe'); assert.equal(x.maxWins, 2); assert.equal(x.bids.length, 6); assert.equal(bid(x, 0), 'V Doué Guena (Leverkusen) 5'); assert.deepEqual(x.releases.map(p => p.name), ['Mbangula', 'Kaua Santos']); });
  test('Mark: «19.- für Doué», insgesamt drei Spieler, Entlassungen als Liste', () => { const x = block(res, 'Mark'); assert.equal(x.maxWins, 3); assert.equal(x.bids.length, 7); assert.equal(bid(x, 0), '? Doué (?) 19'); assert.equal(bid(x, 6), '? Moore (?) 2'); assert.deepEqual(x.releases.map(p => p.name), ['Woltemade', 'Tapé', 'Arthur']); });
  test('David: «- 12 CHF für Nwaneri (M, BVB)», Entlassungen in Reihenfolge', () => { const x = block(res, 'David'); assert.equal(x.bids.length, 5); assert.equal(bid(x, 0), 'M Nwaneri (Dortmund) 12'); assert.equal(bid(x, 1), 'V Doue (Leverkusen) 14'); assert.deepEqual(x.releases.map(p => p.name), ['Fort', 'Waldschmidt', 'Koné', 'Seimen', 'Hack']); });
  test('Roman: «1. Biete CHF 12 für M Nwaneri (Dortmund)»', () => { const x = block(res, 'Roman'); assert.equal(x.bids.length, 4); assert.equal(bid(x, 3), 'V Doué (Leverkusen) 4'); assert.deepEqual(x.releases.map(p => p.name), ['Njinmah', 'Gouweleeuw', 'Burke', 'Gosens']); });
  test('Arbi: Gebot, Entlassung und Eventualauftrag je Zeile', () => { const x = block(res, 'Arbi'); assert.equal(x.maxWins, 3); assert.equal(bid(x, 0), 'V Mensah (Köln) 3 -Lerma >Bensebaini'); assert.equal(bid(x, 1), 'S Mokwa (Elversberg) 4 -Harder >Tella'); assert.equal(bid(x, 2), 'S Dallinga (Köln) 5 -Itten'); assert.ok(x.notes.some(n => /Bedingte/.test(n)), 'Lemperle-für-Tella-Bedingung als Notiz'); });
  test('Dani: Gebot und Entlassung in einem Satz, bedingter Eventualauftrag', () => { const x = block(res, 'Dani'); assert.equal(x.maxWins, 2); assert.equal(bid(x, 0), 'M Fabio Viera (Hamburg) 12 -Doan >Doan'); assert.equal(bid(x, 1), 'V Doué (Leverkusen) 19 -Vogt'); });
});

describe('Gebots-Posts Runde 4 (Archiv)', () => {
  const res = parse(blogger(postsBetween('2026-09-11T19:00', '2026-09-19')), { roundNumbers: [40, 4] });
  test('René: zwei eigenständige Gebote mit eigener Entlassung und Eventualauftrag', () => { const x = block(res, 'René'); assert.equal(x.maxWins, 2); assert.equal(bid(x, 0), 'T Karius (Schalke) 2 -Heuer Fernandes >Heuer Fernandes'); assert.equal(bid(x, 1), 'M Fellhauer (Augsburg) 2 -Adeline >Honorat'); assert.ok(x.ok); });
  test('Pädi: «für 1 Torhüter, der direkt Zentner ersetzt», zwei Alternativen', () => { const x = block(res, 'Pädi'); assert.equal(x.maxWins, 1); assert.equal(bid(x, 0), 'T Karius (Schalke) 2 >Zentner'); assert.equal(bid(x, 1), 'T Schwolow (Mainz) 2 >Zentner'); assert.deepEqual(x.releases.map(p => p.name), ['Zentner']); assert.ok(x.ok); });
  test('Mike: ein Gebot, eine Entlassung', () => { const x = block(res, 'Mike'); assert.equal(x.bids.length, 1); assert.equal(x.bids[0].player_name, 'Konstantelias'); assert.deepEqual(x.releases.map(p => p.name), ['Daka']); });
  test('Aufstellungs-Posts werden nicht als Gebote gelesen', () => { assert.ok(!res.blocks.some(b => ['Mark', 'Roman', 'Arbi', 'David', 'Dani', 'Röfe'].includes(b.name))); });
});

describe('Handy-Blog (Fusszeile «Name um HH:MM», Spitzname, Mail-Kopf)', () => {
  const text = [
    'Arbi', ' ,,', '', 'Biete', 'Brackelmann, Augsburg, V, 2.- und entlasse Dallinga. Ihn gleich für Claude-Maurice einwechseln', '', 'Aristide Bancé um 21:54',
    'Fwd: Fw: Gebot René R6', '', 'Gesendet: Freitag, 16. Oktober 2026 um 15:50', 'Von: rene.peter@sem.admin.ch', 'An: gebot@gmx.ch', 'Betreff: Gebot René R6', 'Ich biete in folgender Reihenfolge für:', 'M Dinkci, Bremen       CHF 2.00', '', 'M Maina, Köln            CHF 2.00', '', 'Dafür entlasse ich:', 'M Onyedika, Frankfurt', '', 'Den Spieler wo ich erhalte, wechsle ich für M Suzuki, Freiburg ein', '', 'Markadona um 20:00',
    'Fwd: Fw: Biete Brackelmann', 'Von: "David Lenz" <david.lenz@dws.com>', 'Betreff: Biete Brackelmann', 'Hallo Sabine,', 'Biete', '- 2 CHF für Brackelmann (V, Augsburg)', 'und entlasse:', '- Kemlein (M, Union)', 'Sofern erfolgreich bitte direkt einwechseln für El Aynaoui', 'Danke dir.', 'Gruss David', 'Markadona um 20:00',
    'Mike Runde 6', 'T Nicolas, Gladbach', 'V Kabak, Hoffenheim', 'Wechsel:', 'V Matsima, Augsburg für V Mittelstädt, Stuttgart', 'Markadona um 18:52'].join('\n');
  const add = (id, list) => kaderOf(id).concat(list.filter(p => !kaderOf(id).some(q => q.name === p.name)));
  const kader6 = id => add(id, id === managers.find(m => m.name === 'Arbi').id ? [{ id: 'arbi-dallinga', name: 'Dallinga', base_pos: 'S', extra_pos: [], club: 'Köln', alias: [] }, { id: 'arbi-claude-maurice', name: 'Claude-Maurice', base_pos: 'M', extra_pos: [], club: 'Augsburg', alias: [] }] : id === managers.find(m => m.name === 'René').id ? [{ id: 'rene-onyedika', name: 'Onyedika', base_pos: 'M', extra_pos: [], club: 'Frankfurt', alias: [] }] : id === managers.find(m => m.name === 'David').id ? [{ id: 'david-kemlein', name: 'Kemlein', base_pos: 'M', extra_pos: [], club: 'Union', alias: [] }] : []);
  const res = parseBidText(text, managers, kader6, { roundNumbers: [60, 6] });
  test('drei Gebots-Posts, Aufstellung nicht dabei', () => { assert.deepEqual(res.blocks.map(b => b.name).sort(), ['Arbi', 'David', 'René']); });
  test('Arbi über Spitznamen-Fusszeile, alles in einem Satz', () => { const x = block(res, 'Arbi'); assert.equal(bid(x, 0), 'V Brackelmann (Augsburg) 2 -Dallinga >Claude-Maurice'); assert.ok(x.ok); });
  test('René: zwei Alternativen, eine Entlassung, Eventualauftrag für beide', () => { const x = block(res, 'René'); assert.equal(x.maxWins, 1); assert.equal(bid(x, 0), 'M Dinkci (Bremen) 2 >Suzuki'); assert.equal(bid(x, 1), 'M Maina (Köln) 2 >Suzuki'); assert.deepEqual(x.releases.map(p => p.name), ['Onyedika']); assert.ok(x.ok); });
  test('David: Mail mit Anrede und Unterschrift', () => { const x = block(res, 'David'); assert.equal(bid(x, 0), 'V Brackelmann (Augsburg) 2 -Kemlein >El Aynaoui'); assert.ok(x.ok); });
});
