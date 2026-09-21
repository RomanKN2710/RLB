/* Potential-Tabelle: Wie stünden die Manager, hätten sie jede Runde im Nachhinein die beste zulässige Elf aus ihrem Kader gestellt?
   «Beste» = grösste Kategoriensumme (Punkte + Zu-null + Assists + Tore − Karten + Team der Runde + Starts). Wechselkosten bleiben
   unberücksichtigt. Grundlage sind die gespeicherten kicker-Werte aller Kaderspieler (Aufgestellte und Ersatzbank). */
import { q } from './db';
import * as R from './rules';

const LIMITS = { T: [1, 1], V: [3, 5], M: [3, 6], S: [1, 3] };
const score = v => v.punkte + v.shutout + v.assist + v.tore - v.karten + v.tdr + v.start;

/** Positionen eines Spielers in einer Runde: Grundposition plus Zusatzpositionen, die vor dieser Runde erworben wurden. */
function positionsAt(p, roundNumber, acq) {
  const extra = (p.extra_pos || []).filter(x => { const from = acq[p.id]?.[x]; return from == null || from < roundNumber; });
  return [...new Set([p.base_pos, ...extra])];
}

/** Beste Elf: dynamische Optimierung über die Kaderspieler mit Zustand (T,V,M,S). options: [{pid, pos, score, values}]. */
export function bestEleven(cands) {
  const key = (t, v, m, s) => `${t},${v},${m},${s}`;
  let states = new Map([[key(0, 0, 0, 0), { sum: 0, picks: [] }]]);
  for (const c of cands) {
    const next = new Map(states);
    for (const [k, st] of states) {
      const [t, v, m, s] = k.split(',').map(Number);
      for (const o of c.options) {
        const n = { T: t, V: v, M: m, S: s }; n[o.pos]++;
        if (n.T > LIMITS.T[1] || n.V > LIMITS.V[1] || n.M > LIMITS.M[1] || n.S > LIMITS.S[1] || n.T + n.V + n.M + n.S > 11) continue;
        const nk = key(n.T, n.V, n.M, n.S); const cur = next.get(nk); const sum = st.sum + o.score;
        if (!cur || sum > cur.sum) next.set(nk, { sum, picks: [...st.picks, { pid: c.pid, pos: o.pos, values: o.values }] });
      }
    }
    states = next;
  }
  let best = null;
  for (const [k, st] of states) { const [t, v, m, s] = k.split(',').map(Number); if (t + v + m + s !== 11 || t < 1 || v < LIMITS.V[0] || m < LIMITS.M[0] || s < LIMITS.S[0]) continue; if (!best || st.sum > best.sum) best = st; }
  return best;
}

/** Rechnet für alle gewerteten Runden je Manager die optimale Elf und liefert Potential-Tabelle, Vergleichstabelle und Details. */
export async function potential(sd) {
  const b = sd.base; const ids = b.managerIds;
  const acq = {}; (await q("select manager_id, player_name, round_id, note from transfers where type='position'")).forEach(t => {
    const r = sd.rounds.find(x => x.id === t.round_id); const m = (t.note || '').match(/Zusatzposition (\w)/); if (!m) return;
    const p = b.playersArr.find(x => x.manager_id === t.manager_id && x.name === t.player_name); if (!p) return;
    (acq[p.id] ||= {})[m[1]] = r ? r.number : null; });
  const rounds = sd.upto.filter((r, i) => r.status === 'final' || sd.datas[i].matches.some(m => m.finished));
  const optTotals = []; const details = [];
  for (const r of rounds) {
    const i = sd.upto.indexOf(r); const d = sd.datas[i]; const tot = {}; const det = {};
    for (const m of ids) {
      const kader = b.playersArr.filter(p => p.manager_id === m && (p.valid_from ?? 0) <= r.number && (p.valid_to == null || p.valid_to >= r.number) && (p.status === 'active' || p.valid_to != null));
      const cands = kader.map(p => ({ pid: p.id, options: positionsAt(p, r.number, acq).map(pos => { const values = R.entryValues(p, pos, d.results[p.id], d.clubRes); return { pos, score: score(values), values }; }) }));
      const best = bestEleven(cands);
      const sums = R.zero(); (best?.picks || []).forEach(x => R.CATS.forEach(([c]) => sums[c] += x.values[c]));
      tot[m] = sums; det[m] = { picks: best?.picks || [], actual: d.totals[m], optimal: sums, delta: score(sums) - score(d.totals[m]) };
    }
    optTotals.push(tot); details.push({ round: r, det });
  }
  const actualTotals = rounds.map(r => sd.datas[sd.upto.indexOf(r)].totals);
  const actual = R.standings(ids, actualTotals);
  const potentialTable = R.standings(ids, optTotals);
  // Allein optimal: nur dieser Manager mit bester Elf, alle anderen wie gespielt
  const alone = {};
  for (const m of ids) { const mixed = actualTotals.map((t, i) => ({ ...t, [m]: optTotals[i][m] })); const st = R.standings(ids, mixed).find(x => x.manager_id === m); const act = actual.find(x => x.manager_id === m); alone[m] = { rp: st.total, rank: st.rank, actualRp: act.total, actualRank: act.rank, gain: st.total - act.total }; }
  return { rounds, actual, potentialTable, alone, details };
}
