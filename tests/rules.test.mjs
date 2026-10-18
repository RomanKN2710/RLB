import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { fitPositions, posProblems, posCheck } from '../src/lib/rules.js';

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
