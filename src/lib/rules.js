/* Spiellogik gemäss Regelwerk RLB V4 (2022). Reine Funktionen ohne Datenbankzugriff. */

export const CATS = [['punkte', 'Punkte'], ['shutout', 'Shutouts'], ['assist', 'Assists'], ['tore', 'Tore'], ['karten', 'Karten'], ['tdr', 'Team d. R.'], ['start', 'Starts']];
export const POSRULE = { T: [1, 1], V: [3, 5], M: [3, 6], S: [1, 3] };   // Ziff. 4.3.1 / 5.1
export const SEASON_BUDGET = 50;        // Ziff. 7.4
export const CONTRACT_MIN = 20;         // Ziff. 4.3.3 / 7.4
export const TRADE_FEE = 5;             // Ziff. 6
export const SWAP_PCT = 0.5;            // Ziff. 5.1
export const MIN_BID = 2;               // Ziff. 4.3.1 / 7.1
export const DEADLINE_MIN = 90;         // Ziff. 5.1 / 7.1
export const KADER_SIZE = 22;           // Ziff. 7.1
export const BBQ_PER_MANAGER = 20;      // Ziff. 9
export const PAYOUT = [[1, 40], [2, 25], [3, 15], [4, 10]];

export const positionsOf = p => [p.base_pos, ...(p.extra_pos || [])];
export const isDef = pos => pos === 'T' || pos === 'V';
export const playerValid = (p, roundNumber) => (p.valid_from ?? 1) <= roundNumber && (p.valid_to == null || roundNumber <= p.valid_to);
export const value = p => Number(p.price) || 0;
// Umlaute: "Füllkrug" (OpenLigaDB, Blog) und "Fuellkrug" (Kader) muessen gleich werden - Akzente weg, dann ae/oe/ue zusammenziehen
export const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z]/g, '').replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');

/** Vereinsergebnis-Karte {clubId: {pts, cs}} aus den Spielen einer Runde (nur beendete Spiele). */
export function clubResults(matches, teamToClub) {
  const res = {};
  for (const m of matches) {
    if (!m.finished || m.goals1 == null || m.goals2 == null) continue;
    const c1 = teamToClub[m.team1], c2 = teamToClub[m.team2]; if (!c1 || !c2) continue;
    res[c1] = { pts: m.goals1 > m.goals2 ? 3 : m.goals1 === m.goals2 ? 1 : 0, cs: m.goals2 === 0 };
    res[c2] = { pts: m.goals2 > m.goals1 ? 3 : m.goals1 === m.goals2 ? 1 : 0, cs: m.goals1 === 0 };
  }
  return res;
}

/** Wertung eines Spielers in einer Runde (Ziff. 8). */
export function entryValues(player, pos, result, clubRes) {
  const st = Number(result?.start) || 0, cr = clubRes[player.club], played = st === 1 || st === 2;
  return {
    punkte: played && cr ? cr.pts : 0,
    shutout: played && cr && cr.cs && isDef(pos) ? 1 : 0,   // wie Excel-Formel: auch eingewechselte V/T (Ziff. 8.3 nennt keine Startelf-Bedingung)
    assist: Number(result?.assist) || 0, tore: Number(result?.tore) || 0, karten: Number(result?.karten) || 0, tdr: Number(result?.tdr) || 0,
    start: st === 1 ? 1 : 0,
  };
}

/** Spieler mit mehreren Positionen (Ziff. 5.2) so einsetzen, dass die Positionsregel stimmt. Liefert null, wenn die
    Aufstellung schon passt oder keine Umstellung hilft, sonst {changes: {pid: pos}} mit möglichst wenigen Änderungen.
    fixed: Spieler, deren Position ausdrücklich gewählt wurde (werden nur umgestellt, wenn es nicht anders geht). */
export function fitPositions(entries, players, fixed = new Set()) {
  const ids = Object.keys(entries); if (!ids.length) return null;
  if (!posCheck(entries, players).bad.length) return null;
  const posOf = pid => entries[pid].pos || players[pid]?.base_pos;
  const flex = ids.filter(pid => players[pid] && positionsOf(players[pid]).length > 1).slice(0, 8); if (!flex.length) return null;
  let best = null;
  const go = (k, cost, changes) => {
    if (best && cost >= best.cost) return;
    if (k === flex.length) { const cnt = { T: 0, V: 0, M: 0, S: 0 }; ids.forEach(pid => { const pos = changes[pid] || posOf(pid); if (cnt[pos] !== undefined) cnt[pos]++; });
      if (Object.entries(POSRULE).every(([p, [lo, hi]]) => cnt[p] >= lo && cnt[p] <= hi)) best = { cost, changes: { ...changes } }; return; }
    const pid = flex[k];
    for (const pos of positionsOf(players[pid])) { const same = pos === posOf(pid); if (!same) changes[pid] = pos; go(k + 1, cost + (same ? 0 : fixed.has(pid) ? 3 : 1), changes); delete changes[pid]; }
  };
  go(0, 0, {});
  return best && Object.keys(best.changes).length ? { changes: best.changes } : null;
}

/** Einwechslung als Ersatz (Ziff. 7.1 Eventualauftrag, Ziff. 6 Trade): np ersetzt outId auf dessen Aufstellungsstelle.
    Passt die Position nicht zu np, kommt er auf seine Grundposition und andere Spieler mit Zusatzposition werden
    umgestellt, bis die Positionsregel stimmt. Geht es nicht auf, bleibt er trotzdem drin (der Auftrag ist verbindlich,
    der Rundencheck meldet die Aufstellung). Liefert null, wenn outId nicht aufgestellt ist oder np schon drinsteht. */
export function swapIn(entries, outId, np, players) {
  if (!entries[outId] || entries[np.id]) return null;
  const pos = entries[outId].pos; const allowed = positionsOf(np);
  const e = { ...entries }; delete e[outId]; e[np.id] = { pos: allowed.includes(pos) ? pos : np.base_pos };
  const P = { ...players, [np.id]: np }; const fit = fitPositions(e, P); const changes = fit ? fit.changes : {};
  for (const [pid, p2] of Object.entries(changes)) e[pid] = { pos: p2 };
  return { entries: e, ok: !posCheck(e, P).bad.length, changes };
}

/** Positionsregel prüfen. entries: {pid: {pos}} */
export function posCheck(entries, players) {
  const cnt = { T: 0, V: 0, M: 0, S: 0 };
  for (const [pid, e] of Object.entries(entries)) { const pos = e.pos || (players[pid] && players[pid].base_pos); if (cnt[pos] !== undefined) cnt[pos]++; }
  const bad = Object.entries(POSRULE).filter(([k, [lo, hi]]) => cnt[k] < lo || cnt[k] > hi).map(([k]) => k);
  const n = Object.keys(entries).length;
  return { cnt, bad, n, ok: n === 11 && bad.length === 0 };
}

export const POSNAME = { T: 'Torwart', V: 'Verteidiger', M: 'Mittelfeld', S: 'Sturm' };
/** Verstösse gegen Ziff. 5.1 als lesbare Sätze (leer = zulässig). Für Editor und Server gleich. */
export function posProblems(entries, players) {
  const { cnt, bad, n } = posCheck(entries, players); const out = [];
  if (n < 11) out.push(`Zu wenige Spieler: ${n} statt 11 (${11 - n === 1 ? 'es fehlt 1' : `es fehlen ${11 - n}`})`);
  if (n > 11) out.push(`Zu viele Spieler: ${n} statt 11 (${n - 11} zu viel)`);
  for (const k of bad) { const [lo, hi] = POSRULE[k]; out.push(`${POSNAME[k]}: ${cnt[k]} aufgestellt, erlaubt ${lo === hi ? `genau ${lo}` : `${lo} bis ${hi}`}`); }
  // Positionsfähigkeit (Ziff. 5.2): nur Grundposition oder erworbene Zusatzpositionen
  for (const [pid, e] of Object.entries(entries)) { const p = players[pid]; if (p && p.base_pos && !positionsOf(p).includes(e.pos)) out.push(`${p.name}: als ${e.pos} aufgestellt, hat nur ${positionsOf(p).join('/')}`); }
  return out;
}

/** Wechselkosten (Ziff. 5.1): 50 % des Werts jedes neu aufgestellten Spielers; Grundaufstellung und Eventualaufträge gratis. */
export function swapCosts(entries, prevEntries, freeIn, players, isFirstRound) {
  if (isFirstRound || !prevEntries) return { items: [], total: 0 };
  const free = new Set(freeIn || []);
  const items = Object.keys(entries).filter(pid => !(pid in prevEntries) && !free.has(pid)).map(pid => ({ pid, name: players[pid]?.name || pid, cost: value(players[pid] || {}) * SWAP_PCT }));
  return { items, total: items.reduce((a, x) => a + x.cost, 0) };
}

/** Rangpunkte mit Teilrangpunkten (Ziff. 8); Karten: weniger ist besser. */
export function rankPoints(totals, managerIds) {
  const n = managerIds.length, out = {}; managerIds.forEach(m => out[m] = {});
  for (const [c] of CATS) {
    const asc = c === 'karten';
    for (const v of new Set(managerIds.map(m => totals[m][c]))) {
      const ms = managerIds.filter(m => totals[m][c] === v);
      const better = managerIds.filter(m => asc ? totals[m][c] < v : totals[m][c] > v).length;
      let sum = 0; for (let i = 0; i < ms.length; i++) sum += n - better - i;
      ms.forEach(m => out[m][c] = sum / ms.length);
    }
  }
  managerIds.forEach(m => out[m].total = CATS.reduce((a, [c]) => a + out[m][c], 0));
  return out;
}

/**
 * Tageswerte pro Manager für eine Runde.
 * data: {players, lineups: {managerId: {entries, free_in}}, results: {pid: result}, clubRes, corrections: [{manager_id, delta}]}
 */
export function roundTotals(managerIds, data) {
  const res = {}; managerIds.forEach(m => res[m] = zero());
  for (const m of managerIds) {
    const lu = data.lineups[m]; if (!lu) continue;
    for (const [pid, e] of Object.entries(lu.entries || {})) {
      const p = data.players[pid]; if (!p) continue;
      const v = entryValues(p, e.pos || p.base_pos, data.results[pid], data.clubRes);
      CATS.forEach(([c]) => res[m][c] += v[c]);
    }
  }
  for (const k of data.corrections || []) { if (res[k.manager_id] && k.delta) CATS.forEach(([c]) => res[k.manager_id][c] += Number(k.delta[c]) || 0); }
  return res;
}
export const zero = () => ({ punkte: 0, shutout: 0, assist: 0, tore: 0, karten: 0, tdr: 0, start: 0 });

/** Rangliste aus kumulierten Tageswerten. roundsData: Array von roundTotals-Ergebnissen. */
export function standings(managerIds, roundsData) {
  const tot = {}; managerIds.forEach(m => tot[m] = zero());
  for (const r of roundsData) managerIds.forEach(m => CATS.forEach(([c]) => tot[m][c] += r[m][c]));
  const rp = rankPoints(tot, managerIds);
  const rows = managerIds.map(m => ({ manager_id: m, tot: tot[m], rp: rp[m], total: rp[m].total })).sort((a, b) => b.total - a.total);
  let rank = 0; rows.forEach((r, i) => { if (i === 0 || r.total !== rows[i - 1].total) rank = i + 1; r.rank = rank; });
  return rows;
}

/**
 * Gebote auflösen (Ziff. 7.1, 7.3, 7.4).
 * bids: [{manager_id, player_name, price, release_player_id, ...}], ctx: {players, budgetLeft(m), tiebreak: [managerId worst..best], prevReleases: [{manager_id, player_name, price}], kaderCount(m)}
 */
export function resolveBids(bids, ctx) {
  const list = bids.map(b => ({ ...b, priority: Number(b.priority) || 1, max_wins: Number(b.max_wins) || 1 }));
  const okRelease = pid => { const rel = ctx.players[pid]; return rel && rel.status === 'active'; };
  for (const b of list) {
    if (b.price < MIN_BID) { b.status = 'invalid'; b.reason = `Mindestgebot ${MIN_BID}`; continue; }
    // Entlassung: je Gebot genannt oder als Reihenfolge-Liste des Managers (wird beim Zuteilen der Reihe nach vergeben)
    const relOk = b.release_player_id ? okRelease(b.release_player_id) && ctx.players[b.release_player_id].manager_id === b.manager_id : (b.release_order || []).some(pid => okRelease(pid) && ctx.players[pid].manager_id === b.manager_id);
    if (!relOk) { b.status = 'invalid'; b.reason = 'Entlassung fehlt oder ungültig (Kader 22)'; continue; }
    if (b.price > ctx.budgetLeft(b.manager_id)) { b.status = 'invalid'; b.reason = `Budget ${ctx.budgetLeft(b.manager_id)} reicht nicht (7.4)`; continue; }
    const own = Object.values(ctx.players).find(p => p.status === 'active' && norm(p.name) === norm(b.player_name) && (!b.club || !p.club || p.club === b.club));
    if (own) { b.status = 'invalid'; b.reason = `Spieler bereits im Kader von ${ctx.managerName(own.manager_id)}`; continue; }
    const pr = (ctx.prevReleases || []).find(t => norm(t.player_name) === norm(b.player_name));
    if (pr) {
      if (pr.manager_id === b.manager_id) { b.status = 'invalid'; b.reason = 'selbst entlassen: eine Runde warten (7.3)'; continue; }
      if (b.price < Number(pr.price)) { b.status = 'invalid'; b.reason = `Mindestgebot ${pr.price} = alter Wert (7.3)`; continue; }
    }
  }
  const order = ctx.tiebreak; const withdrawn = new Set();
  // Gleicher Spieler = gleicher Verein und gleicher Name; Teilnamen («El Mala» / «Said El Mala») gelten als derselbe Spieler.
  // Gebote eines Managers sind Alternativen in Reihenfolge: hat er sein Limit (max_wins) erreicht, fallen seine weiteren
  // Gebote weg und die Spieler werden neu vergeben – so lange, bis sich nichts mehr aendert.
  for (let iter = 0; iter < 20; iter++) {
    const groups = {}; const keyOf = b => `${b.club || ''}|${norm(b.player_name)}`;
    for (const b of list) { if (b.status === 'invalid' || withdrawn.has(b)) continue; const k = Object.keys(groups).find(g => { const [c, n] = g.split('|'); const nb = norm(b.player_name); return c === (b.club || '') && (n === nb || n.endsWith(nb) || nb.endsWith(n)); }) || keyOf(b); (groups[k] = groups[k] || []).push(b); }
    for (const g of Object.values(groups)) {
      g.sort((a, b) => b.price - a.price || order.indexOf(a.manager_id) - order.indexOf(b.manager_id));
      g[0].status = 'won'; g[0].reason = g.length > 1 && g[1].price === g[0].price ? 'Gleichstand, schlechterer Tabellenplatz' : '';
      g.slice(1).forEach(b => { b.status = 'lost'; b.reason = b.price === g[0].price ? 'Gleichstand, besserer Tabellenplatz' : 'überboten'; });
    }
    let changed = false;
    for (const m of new Set(list.map(b => b.manager_id))) {
      const mine = list.filter(b => b.manager_id === m && b.status !== 'invalid' && !withdrawn.has(b)).sort((a, b) => a.priority - b.priority); let wins = 0;
      for (const b of mine) { if (wins >= b.max_wins) { withdrawn.add(b); b.status = 'lost'; b.reason = `Limit erreicht: ${b.max_wins} Zuschlag${b.max_wins > 1 ? 'e' : ''} aus früheren Geboten`; changed = true; continue; } if (b.status === 'won') wins++; }
    }
    if (!changed) break;
  }
  return list;
}

export const chf = n => (Math.round(Number(n) * 100) / 100).toLocaleString('de-CH', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const fmtRp = n => Number.isInteger(n) ? String(n) : n.toFixed(1);
