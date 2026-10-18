import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fitPositions, posProblems, posCheck, swapIn } from '../src/lib/rules.js';

const P = {}; const mk = (id, base, extra = []) => { P[id] = { id, name: id, base_pos: base, extra_pos: extra }; return id; };
const lineup = ids => Object.fromEntries(ids.map(([id, pos]) => [id, { pos }]));
describe('fitPositions', () => {
  const t = mk('t', 'T'), v1 = mk('v1', 'V'), v2 = mk('v2', 'V'), v3 = mk('v3', 'V'), v4 = mk('v4', 'V'), v5 = mk('v5', 'V'), m1 = mk('m1', 'M'), m2 = mk('m2', 'M'), s1 = mk('s1', 'S'), s2 = mk('s2', 'S'), beier = mk('beier', 'S', ['M', 'V']), caci = mk('caci', 'V', ['M']);
  test('zu wenige Mittelfeldspieler: Spieler mit Zusatzposition wechselt', () => {
    const e = lineup([[t, 'T'], [v1, 'V'], [v2, 'V'], [v3, 'V'], [v4, 'V'], [v5, 'V'], [m1, 'M'], [m2, 'M'], [beier, 'S'], [s1, 'S'], [s2, 'S']]);
    const fit = fitPositions(e, P); assert.deepEqual(fit, { changes: { beier: 'M' } });
  });
  test('nichts zu tun, wenn die Elf passt', () => { const e = lineup([[t, 'T'], [v1, 'V'], [v2, 'V'], [v3, 'V'], [m1, 'M'], [m2, 'M'], [beier, 'M'], [caci, 'M'], [s1, 'S'], [s2, 'S'], [v4, 'V']]); assert.equal(fitPositions(e, P), null); });
  test('keine Lösung ohne Zusatzpositionen', () => { const e = lineup([[t, 'T'], [v1, 'V'], [v2, 'V'], [v3, 'V'], [v4, 'V'], [v5, 'V'], [m1, 'M'], [m2, 'M'], [s1, 'S'], [s2, 'S'], [mk('s3', 'S'), 'S']]); assert.equal(fitPositions(e, P), null); });
  test('von Hand gewählte Position bleibt, wenn ein anderer umgestellt werden kann', () => {
    const e = lineup([[t, 'T'], [v1, 'V'], [v2, 'V'], [v3, 'V'], [v4, 'V'], [m1, 'M'], [m2, 'M'], [beier, 'S'], [caci, 'V'], [s1, 'S'], [s2, 'S']]);
    assert.deepEqual(fitPositions(e, P, new Set([beier])), { changes: { caci: 'M' } });
    assert.deepEqual(fitPositions(e, P, new Set([caci])), { changes: { beier: 'M' } });
  });
});
describe('posProblems', () => {
  test('meldet Anzahl und Positionsfähigkeit', () => {
    const e = lineup([['t', 'T'], ['v1', 'V'], ['v2', 'V'], ['m1', 'M'], ['m2', 'M'], ['s1', 'M'], ['s2', 'S']]);
    const out = posProblems(e, P); assert.ok(out.some(x => /Zu wenige Spieler: 7/.test(x))); assert.ok(out.some(x => /s1: als M aufgestellt/.test(x))); assert.equal(posCheck(e, P).ok, false);
  });
});

import { resolveBids } from '../src/lib/rules.js';
describe('resolveBids mit Reihenfolge und Limit', () => {
  const players = { 'r-x': { id: 'r-x', manager_id: 1, status: 'active' }, 'd-y': { id: 'd-y', manager_id: 2, status: 'active' }, 'd-z': { id: 'd-z', manager_id: 2, status: 'active' } };
  const ctx = { players, budgetLeft: () => 50, managerName: m => 'M' + m, tiebreak: [1, 2], prevReleases: [] };
  const bid = (id, manager_id, player_name, price, priority, extra = {}) => ({ id, manager_id, player_name, club: 'Bremen', pos: 'M', price, priority, max_wins: 1, release_player_id: null, release_order: manager_id === 1 ? ['r-x'] : ['d-y', 'd-z'], ...extra });
  test('Alternativen: erster Zuschlag genügt, zweites Gebot fällt weg und geht an den Nächsten', () => {
    const out = resolveBids([bid(1, 1, 'Dinkci', 2, 1), bid(2, 1, 'Maina', 2, 2), bid(3, 2, 'Maina', 2, 1)], ctx);
    assert.equal(out.find(b => b.id === 1).status, 'won'); assert.equal(out.find(b => b.id === 2).status, 'lost'); assert.match(out.find(b => b.id === 2).reason, /Limit/);
    assert.equal(out.find(b => b.id === 3).status, 'won', 'Maina geht an Manager 2, weil Manager 1 sein Limit erreicht hat');
  });
  test('überboten beim ersten Gebot: zweite Wahl zählt', () => {
    const out = resolveBids([bid(1, 1, 'Dinkci', 2, 1), bid(2, 1, 'Maina', 2, 2), bid(3, 2, 'Dinkci', 5, 1)], ctx);
    assert.equal(out.find(b => b.id === 1).status, 'lost'); assert.equal(out.find(b => b.id === 2).status, 'won'); assert.equal(out.find(b => b.id === 3).status, 'won');
  });
  test('Limit 2: zwei Zuschläge, Entlassung aus der Liste gilt als vorhanden', () => {
    const out = resolveBids([bid(1, 2, 'A', 3, 1, { max_wins: 2 }), bid(2, 2, 'B', 3, 2, { max_wins: 2 }), bid(3, 2, 'C', 3, 3, { max_wins: 2 })], ctx);
    assert.deepEqual(out.map(b => b.status), ['won', 'won', 'lost']);
  });
  test('ohne Entlassung ungültig', () => { const out = resolveBids([bid(1, 1, 'Dinkci', 2, 1, { release_order: [] })], ctx); assert.equal(out[0].status, 'invalid'); });
});

describe('swapIn: Eventualauftrag und Trade ersetzen einen Spieler in der Aufstellung', () => {
  const Q = {}; const mk2 = (id, base, extra = []) => { Q[id] = { id, name: id, base_pos: base, extra_pos: extra }; return id; };
  ['t', 'v1', 'v2', 'v3'].forEach(id => mk2(id, id === 't' ? 'T' : 'V')); ['m1', 'm2', 'm3', 'm4', 'aynaoui'].forEach(id => mk2(id, 'M')); ['s1', 's2'].forEach(id => mk2(id, 'S'));
  const david = () => lineup([['t', 'T'], ['v1', 'V'], ['v2', 'V'], ['v3', 'V'], ['m1', 'M'], ['m2', 'M'], ['m3', 'M'], ['m4', 'M'], ['aynaoui', 'M'], ['s1', 'S'], ['s2', 'S']]);
  test('Verteidiger für Mittelfeldspieler (3-5-2 wird 4-4-2): kommt auf seine Grundposition', () => {
    const sw = swapIn(david(), 'aynaoui', { id: 'brackelmann', name: 'Brackelmann', base_pos: 'V', extra_pos: [] }, Q);
    assert.ok(sw.ok); assert.ok(!sw.entries.aynaoui); assert.equal(sw.entries.brackelmann.pos, 'V'); assert.deepEqual(sw.changes, {}); assert.equal(Object.keys(sw.entries).length, 11);
  });
  test('passt es nur mit Umstellung: Spieler mit Zusatzposition wechselt die Position', () => {
    const ryerson = { id: 'ryerson', name: 'Ryerson', base_pos: 'V', extra_pos: ['M'] }; const Q2 = { ...Q, ryerson, s3: { id: 's3', name: 's3', base_pos: 'S', extra_pos: [] } };
    const e = lineup([['t', 'T'], ['v1', 'V'], ['v2', 'V'], ['v3', 'V'], ['ryerson', 'V'], ['m1', 'M'], ['m2', 'M'], ['m3', 'M'], ['s1', 'S'], ['s2', 'S'], ['s3', 'S']]);
    const sw = swapIn(e, 'm3', { id: 'brackelmann', name: 'Brackelmann', base_pos: 'V', extra_pos: [] }, Q2);
    assert.ok(sw.ok, 'muss mit Ryerson als M aufgehen'); assert.deepEqual(sw.changes, { ryerson: 'M' }); assert.equal(sw.entries.ryerson.pos, 'M'); assert.equal(sw.entries.brackelmann.pos, 'V');
  });
  test('geht es nicht auf, bleibt der Neue trotzdem drin (Auftrag verbindlich, Rundencheck meldet)', () => {
    const e = lineup([['t', 'T'], ['v1', 'V'], ['v2', 'V'], ['v3', 'V'], ['m1', 'M'], ['m2', 'M'], ['m3', 'M'], ['m4', 'M'], ['aynaoui', 'M'], ['s1', 'S'], ['s2', 'S']]);
    const sw = swapIn(e, 't', { id: 'neu', name: 'Neu', base_pos: 'S', extra_pos: [] }, Q);
    assert.equal(sw.ok, false); assert.ok(sw.entries.neu && !sw.entries.t); assert.equal(sw.entries.neu.pos, 'S');
  });
  test('Ersetzter steht nicht in der Aufstellung oder der Neue schon: nichts zu tun', () => {
    assert.equal(swapIn(david(), 'kemlein', { id: 'x', base_pos: 'M', extra_pos: [] }, Q), null);
    assert.equal(swapIn(david(), 'aynaoui', { id: 'm1', base_pos: 'M', extra_pos: [] }, Q), null);
  });
});

describe('resolveBids: Gleichstand geht an den schlechteren Tabellenplatz (Ziff. 7.1)', () => {
  const players = { 'a-x': { id: 'a-x', manager_id: 2, status: 'active' }, 'd-y': { id: 'd-y', manager_id: 10, status: 'active' } };
  const mk = (id, manager_id, rel) => ({ id, manager_id, player_name: 'Brackelmann', club: 'Augsburg', pos: 'V', price: 2, priority: 1, max_wins: 1, release_player_id: rel, release_order: [] });
  const run = tiebreak => resolveBids([mk(1, 2, 'a-x'), mk(2, 10, 'd-y')], { players, budgetLeft: () => 50, managerName: m => 'M' + m, tiebreak, prevReleases: [] });
  test('Reihenfolge schlechtester zuerst: David (10.) vor Arbi (9.) gewinnt', () => { const out = run([10, 2, 8, 3]); assert.equal(out.find(b => b.manager_id === 10).status, 'won'); assert.equal(out.find(b => b.manager_id === 2).status, 'lost'); assert.match(out.find(b => b.manager_id === 2).reason, /besserer Tabellenplatz/); });
  test('umgekehrte Tabelle: Arbi gewinnt', () => { const out = run([2, 10]); assert.equal(out.find(b => b.manager_id === 2).status, 'won'); });
});
