import { q, one } from './db';
import * as R from './rules';

/** Stammdaten: Manager, Vereine, Spieler. */
export async function base() {
  const managers = await q('select * from managers where active order by sort, id');
  const clubs = await q('select * from clubs order by id');
  const playersArr = await q('select * from players');
  const players = {}; playersArr.forEach(p => players[p.id] = p);
  const teamToClub = {}; clubs.forEach(c => { if (c.oldb_team_id) teamToClub[c.oldb_team_id] = c.id; });
  const managerName = {}; managers.forEach(m => managerName[m.id] = m.name);
  return { managers, managerIds: managers.map(m => m.id), managerName, clubs, players, playersArr, teamToClub };
}

export async function rounds() { return q('select * from rounds order by number'); }
export async function roundById(id) { return one('select * from rounds where id=$1', [id]); }

/** Die nächste offene Runde: kleinste Nummer mit Deadline in der Zukunft (Ziff. 5.1: nur diese Aufstellung ist offen). */
export async function openRound() { return one("select * from rounds where status='open' and deadline is not null and deadline > now() order by number limit 1"); }
/** Runden, deren Deadline vorbei ist und die noch nicht final sind (Resultate erfassen). */
export async function pendingRounds() { return q("select * from rounds where status='open' and deadline is not null and deadline <= now() order by number"); }
export async function lastFinalRound() { return one("select * from rounds where status='final' order by number desc limit 1"); }

/** Fehlende Aufstellungen einer Runde aus der Vorrunde übernehmen (Ziff. 5.1: ohne Wechsel gilt die bisherige Aufstellung). Persistiert erst nach der Deadline. */
export async function ensureLineups(round, b) {
  if (!round.deadline || new Date(round.deadline) > new Date()) return;
  for (const m of b.managerIds) {
    const cur = await one('select 1 from lineups where round_id=$1 and manager_id=$2', [round.id, m]); if (cur) continue;
    const prev = await prevLineup(round, m); if (!prev) continue;
    const entries = {}; for (const [pid, e] of Object.entries(prev.entries)) { const p = b.players[pid]; if (p && p.manager_id === m && p.status === 'active' && R.playerValid(p, round.number)) entries[pid] = e; }
    await q('insert into lineups(round_id,manager_id,entries,free_in,updated_at) values($1,$2,$3,$4,now()) on conflict do nothing', [round.id, m, JSON.stringify(entries), []]);
  }
}

/** Alle Daten einer Runde für die Wertung. */
export async function roundData(round, b) {
  await ensureLineups(round, b);
  const matches = await q('select * from matches where round_id=$1', [round.id]);
  const clubRes = R.clubResults(matches, b.teamToClub);
  const lus = await q('select * from lineups where round_id=$1', [round.id]);
  const lineups = {}; lus.forEach(l => lineups[l.manager_id] = l);
  const rs = await q('select * from results where round_id=$1', [round.id]);
  const results = {}; rs.forEach(r => results[r.player_id] = r);
  const corrections = await q('select * from corrections where round_id=$1', [round.id]);
  return { round, matches, clubRes, lineups, results, corrections, totals: R.roundTotals(b.managerIds, { players: b.players, lineups, results, clubRes, corrections }) };
}

/** Rangliste nach Runde (inklusive) und alle Rundendaten bis dahin. */
export async function season(uptoNumber, b) {
  b = b || await base();
  const all = await rounds();
  const upto = all.filter(r => uptoNumber == null || r.number <= uptoNumber);
  const datas = []; for (const r of upto) datas.push(await roundData(r, b));
  const table = R.standings(b.managerIds, datas.map(d => d.totals));
  const history = upto.map((r, i) => ({ round: r, table: R.standings(b.managerIds, datas.slice(0, i + 1).map(d => d.totals)) }));
  return { base: b, rounds: all, upto, datas, table, history };
}

/** Wechselkosten aller Runden pro Manager (abgeleitet aus den Aufstellungen, Ziff. 5.1). */
export function swapCostsAll(seasonData) {
  const out = {}; seasonData.base.managerIds.forEach(m => out[m] = []);
  seasonData.upto.forEach((r, i) => {
    for (const m of seasonData.base.managerIds) {
      const lu = seasonData.datas[i].lineups[m]; if (!lu) continue;
      let prev = null; for (let j = i - 1; j >= 0; j--) { if (seasonData.datas[j].lineups[m]) { prev = seasonData.datas[j].lineups[m].entries; break; } }
      const sc = R.swapCosts(lu.entries, prev, lu.free_in, seasonData.base.players, i === 0);
      if (sc.total) out[m].push({ round: r, ...sc });
    }
  });
  return out;
}

export async function ledgerAll() { return q('select l.*, m.name as manager_name, r.label as round_label from ledger l join managers m on m.id=l.manager_id left join rounds r on r.id=l.round_id order by l.created_at desc'); }
export async function transfersAll() { return q('select t.*, m.name as manager_name, r.label as round_label from transfers t join managers m on m.id=t.manager_id left join rounds r on r.id=t.round_id order by t.created_at desc'); }

/** Kaufbudget (Ziff. 7.4): 50 minus Käufe plus Gutschriften. */
export async function budgetLeft(managerId) {
  const k = await one("select coalesce(sum(price),0)::float as s from transfers where manager_id=$1 and type='kauf'", [managerId]);
  const g = await one("select coalesce(sum(amount),0)::float as s from ledger where manager_id=$1 and type='gutschrift'", [managerId]);
  return R.SEASON_BUDGET - k.s + g.s;
}

/** Auslagen pro Manager (in den Pott, Ziff. 4.3.1, 5.1, 6, 7.4). */
export async function auslagen(seasonData) {
  const b = seasonData.base; const swaps = swapCostsAll(seasonData);
  const ledger = await q('select manager_id, type, sum(amount)::float as s from ledger group by manager_id, type');
  const kauf = await q("select manager_id, sum(price)::float as s from transfers where type='kauf' group by manager_id");
  const fin = await q('select * from finance');
  const out = {};
  for (const m of b.managerIds) {
    const led = t => (ledger.find(l => l.manager_id === m && l.type === t) || {}).s || 0;
    // Draft-Kosten: fest gebucht (ledger type 'draft', Phase-1-Summe aus dem Draft-Blatt); Rückfall: Summe der Stamm-Preise
    const draft = ledger.some(l => l.manager_id === m && l.type === 'draft') ? led('draft') : b.playersArr.filter(p => p.manager_id === m && p.source === 'draft' && p.slot === 'stamm').reduce((a, p) => a + R.value(p), 0);
    const kaeufe = (kauf.find(k => k.manager_id === m) || {}).s || 0;
    const wechsel = swaps[m].reduce((a, x) => a + x.total, 0);
    const other = ledger.filter(l => l.manager_id === m && !['gutschrift', 'draft'].includes(l.type)).reduce((a, l) => a + l.s, 0);
    const gutschrift = led('gutschrift');   // Abgang aus der Bundesliga (7.4): wie im Excel auch von den Auslagen abgezogen (Entscheid Roman 10.09.2026)
    const total = draft + kaeufe + wechsel + other - gutschrift;
    const paid = Number((fin.find(f => f.manager_id === m) || {}).paid) || 0;
    out[m] = { draft, kaeufe, wechsel, vertrag: led('vertragsaufloesung'), trade: led('trade'), sonst: other - led('vertragsaufloesung') - led('trade'), gutschrift, total, paid, open: total - paid };
  }
  return out;
}

/** Gleichstands-Reihenfolge für Gebote (Ziff. 7.1): schlechtester Tabellenplatz zuerst. Vor der ersten gewerteten Runde: Vorsaison-Reihenfolge aus settings. */
export async function tiebreakOrder(round, b) {
  const prev = await q('select number from rounds where number < $1 order by number desc limit 1', [round.number]);
  if (!prev.length) { const s = await one("select value from settings where key='vorsaison_reihenfolge'"); return s ? s.value.map(n => b.managers.find(m => m.name === n)?.id).filter(Boolean) : b.managerIds; }
  const sd = await season(prev[0].number, b);
  return sd.table.map(r => r.manager_id).reverse();
}

export async function kader(managerId, roundNumber) {
  return q("select * from players where manager_id=$1 and status='active' and ($2::int is null or (valid_from <= $2 and (valid_to is null or valid_to >= $2))) order by slot, array_position(array['T','V','M','S'], base_pos::text), name", [managerId, roundNumber ?? null]);
}
export async function prevLineup(round, managerId) {
  return one('select l.* from lineups l join rounds r on r.id=l.round_id where l.manager_id=$1 and r.number < $2 order by r.number desc limit 1', [managerId, round.number]);
}

/** Freie Spieler (Ziff. 7.1): Spielerpool aus kicker minus Spieler, die aktuell in einem RLB-Kader stehen. */
export async function freeAgents(b) {
  const anySquad = await one('select 1 from bl_players where in_squad limit 1');
  const pool = await q(anySquad ? 'select * from bl_players where in_squad order by club, squad_pos, name' : 'select * from bl_players order by club, pos, name');
  const { playerMatches } = await import('./kicker');
  const active = b.playersArr.filter(p => p.status === 'active');
  const isTaken = p => active.some(o => (!p.club || !o.club || R.norm(o.club) === R.norm(p.club)) && (playerMatches(p.slug, p.name, o.name) || R.norm(o.name) === R.norm(p.name)));
  return pool.map(p => { const base = p.squad_pos || p.pos; const all = [...new Set([base, ...(p.played_pos || [])].filter(Boolean))]; return { slug: p.slug, name: p.name, first: p.first_name, club: p.club, pos: base, positions: all.join('/'), games: p.games, last: p.last_matchday, taken: isTaken(p) }; });
}
