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
