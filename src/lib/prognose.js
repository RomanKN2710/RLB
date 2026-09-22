/* Saisonprognose per Monte-Carlo: Für jede noch ausstehende Runde wird je Manager eine seiner bisherigen Runden zufällig
   gezogen (Bootstrap) und aufaddiert; daraus Rangpunkte und Endtabelle. Viele Wiederholungen ergeben Wahrscheinlichkeiten
   für Titel, Preisgeld-Ränge (1–4) und den letzten Platz. Früh in der Saison ist das naturgemäss sehr unsicher. */
import * as R from './rules';

function rng(seed) { let a = seed >>> 0; return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

export function prognose(sd, { sims = 3000, totalRounds = 34 } = {}) {
  const ids = sd.base.managerIds;
  const played = sd.upto.map((r, i) => i).filter(i => sd.upto[i].status === 'final' || sd.datas[i].matches.some(m => m.finished));
  if (played.length < 2) return null;
  const per = {}; ids.forEach(m => per[m] = played.map(i => sd.datas[i].totals[m]));
  const now = {}; ids.forEach(m => { now[m] = R.zero(); per[m].forEach(t => R.CATS.forEach(([c]) => now[m][c] += t[c])); });
  const remaining = Math.max(0, totalRounds - played.length);
  const rand = rng(played.length * 7919 + remaining);
  const n = ids.length; const rankCount = {}; const sumRp = {}; ids.forEach(m => { rankCount[m] = new Array(n).fill(0); sumRp[m] = 0; });
  for (let s = 0; s < sims; s++) {
    const tot = {}; ids.forEach(m => tot[m] = { ...now[m] });
    for (let k = 0; k < remaining; k++) for (const m of ids) { const t = per[m][Math.floor(rand() * per[m].length)]; R.CATS.forEach(([c]) => tot[m][c] += t[c]); }
    const rows = R.standings(ids, [tot]);
    rows.forEach(r => { rankCount[r.manager_id][r.rank - 1]++; sumRp[r.manager_id] += r.total; });
  }
  const cur = R.standings(ids, played.map(i => sd.datas[i].totals));
  const out = ids.map(m => { const dist = rankCount[m].map(c => c / sims); let acc = 0, median = n; for (let k = 0; k < n; k++) { acc += dist[k]; if (acc >= 0.5) { median = k + 1; break; } }
    return { manager_id: m, expRp: sumRp[m] / sims, dist, p1: dist[0], pTop4: dist.slice(0, 4).reduce((a, x) => a + x, 0), pLast: dist[n - 1], median, curRank: cur.find(x => x.manager_id === m).rank, curRp: cur.find(x => x.manager_id === m).total }; });
  out.sort((a, b) => b.expRp - a.expRp);
  return { rows: out, played: played.length, remaining, sims };
}
