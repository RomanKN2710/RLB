/* Auszeichnungen pro Spieltag: aus rund 16 Kandidaten werden mindestens fünf gewählt, zuerst die, die wirklich herausstechen.
   Massstab ist der Abstand des Besten zum Feld (z-Wert über alle Manager); dazu Mindestwerte, damit z. B. 2 Tore
   in einer torarmen Runde nicht schon als «Torfabrik» gelten. */
import * as R from './rules';

const score = v => v.punkte + v.shutout + v.assist + v.tore - v.karten + v.tdr + v.start;
const fmt = n => Number.isInteger(n) ? String(n) : n.toFixed(1);

const AWARDS = [
  { key: 'koenig', title: 'Spieltagskönig', icon: '👑', min: 12, zmin: 1.2, value: x => x.total, detail: x => `Kategoriensumme ${fmt(x.total)}, mehr als jeder andere` },
  { key: 'rohrkrepierer', title: 'Rohrkrepierer', icon: '🧨', min: -1e9, zmin: 1.4, value: x => -x.total, detail: x => `Kategoriensumme nur ${fmt(x.total)}, schlechtester Wert der Runde` },
  { key: 'torfabrik', title: 'Torfabrik', icon: '⚽', min: 4, zmin: 1.3, value: x => x.t.tore, detail: x => `${x.t.tore} Tore: ${x.top('tore')}` },
  { key: 'vorlagen', title: 'Vorlagengeber', icon: '🎯', min: 4, zmin: 1.3, value: x => x.t.assist, detail: x => `${x.t.assist} Assists: ${x.top('assist')}` },
  { key: 'beton', title: 'Betonmischer', icon: '🧱', min: 4, zmin: 1.3, value: x => x.t.shutout, detail: x => `${x.t.shutout} Zu-null-Wertungen in der Defensive` },
  { key: 'karten', title: 'Kartensammler', icon: '🟨', min: 4, zmin: 1.3, value: x => x.t.karten, detail: x => `${x.t.karten} Kartenpunkte: ${x.top('karten')}` },
  { key: 'kicker', title: 'kicker-Liebling', icon: '📰', min: 2, zmin: 1.3, value: x => x.t.tdr, detail: x => `${x.t.tdr} Nennungen in der Elf des Tages: ${x.top('tdr')}` },
  { key: 'bank', title: 'Bankdrücker', icon: '🪑', min: 5, zmin: 1.3, value: x => x.bench ? x.bench.s : 0, detail: x => `${x.bench.name} (${x.bench.club}) holte ${fmt(x.bench.s)} auf der Ersatzbank` },
  { key: 'geister', title: 'Geisterelf', icon: '👻', min: 3, zmin: 1.2, value: x => x.ghosts.length, detail: x => `${x.ghosts.length} Aufgestellte ohne Einsatz: ${x.ghosts.join(', ')}` },
  { key: 'prophet', title: 'Prophet', icon: '🔮', min: 5, zmin: 1.3, value: x => x.prophet.s, detail: x => `Eventualauftrag ${x.prophet.names.join(', ')} brachte sofort ${fmt(x.prophet.s)}` },
  { key: 'einzel', title: 'Einzelkämpfer', icon: '🦸', min: 0.45, zmin: 1.3, value: x => x.total >= 8 ? x.solo.share : 0, detail: x => `${x.solo.name} lieferte ${Math.round(x.solo.share * 100)} % der Kategoriensumme` },
  { key: 'goldhand', title: 'Goldene Hand', icon: '🧤', min: 4, zmin: 1.3, value: x => x.keeper ? x.keeper.s : 0, detail: x => `Torwart ${x.keeper.name} (${x.keeper.club}) mit ${fmt(x.keeper.s)}` },
  { key: 'punkte', title: 'Punktesammler', icon: '🏅', min: 15, zmin: 1.2, value: x => x.t.punkte, detail: x => `${x.t.punkte} Vereinspunkte, die Elf stand fast nur bei Siegern` },
  { key: 'kapelle', title: 'Volle Kapelle', icon: '🎺', min: 11, zmin: 1.0, value: x => x.t.start, detail: x => `Alle elf Aufgestellten in der Startelf` },
  { key: 'wackel', title: 'Wackelkandidat', icon: '🎲', min: -8, zmin: 1.2, value: x => -x.t.start, detail: x => `Nur ${x.t.start} Aufgestellte in der Startelf` },
  { key: 'aufsteiger', title: 'Rakete', icon: '🚀', min: 2, zmin: 1.2, value: x => x.rankDelta, detail: x => `Von Platz ${x.prevRank} auf ${x.curRank}, grösster Sprung der Runde` },
  { key: 'absteiger', title: 'Absturz', icon: '🪂', min: 2, zmin: 1.2, value: x => -x.rankDelta, detail: x => `Von Platz ${x.prevRank} auf ${x.curRank}, tiefster Fall der Runde` },
];
const MIN_AWARDS = 5, MAX_AWARDS = 7;

/** Kennzahlen eines Managers in einer Runde (Grundlage aller Kandidaten). */
function profile(sd, i, m) {
  const b = sd.base; const d = sd.datas[i]; const r = sd.upto[i]; const lu = d.lineups[m]; const t = d.totals[m];
  const rows = Object.entries(lu?.entries || {}).map(([pid, e]) => { const p = b.players[pid]; if (!p) return null; const res = d.results[pid] || {}; const v = R.entryValues(p, e.pos, res, d.clubRes); return { pid, name: p.name, club: p.club, pos: e.pos, v, s: score(v), start: Number(res.start) || 0, played: !!d.results[pid] }; }).filter(Boolean);
  const total = score(t);
  const inLineup = new Set(rows.map(x => x.pid));
  const bench = b.playersArr.filter(p => p.manager_id === m && !inLineup.has(p.id) && d.results[p.id] && (p.valid_from ?? 0) <= r.number && (p.valid_to == null || p.valid_to >= r.number))
    .map(p => { const v = R.entryValues(p, p.base_pos, d.results[p.id], d.clubRes); return { name: p.name, club: p.club, s: score(v) }; }).sort((a, z) => z.s - a.s)[0] || null;
  const ghosts = rows.filter(x => x.start === 0 && d.matches.some(mm => mm.finished && (b.teamToClub[mm.team1] === x.club || b.teamToClub[mm.team2] === x.club))).map(x => x.name);
  const free = new Set(lu?.free_in || []); const fr = rows.filter(x => free.has(x.pid));
  const prophet = { s: fr.reduce((a, x) => a + x.s, 0), names: fr.map(x => x.name) };
  const best = [...rows].sort((a, z) => z.s - a.s)[0];
  const solo = best && total > 0 ? { name: best.name, share: best.s / total } : { name: '', share: 0 };
  const keeper = rows.filter(x => x.pos === 'T').sort((a, z) => z.s - a.s)[0] || null;
  const top = c => [...rows].filter(x => x.v[c] > 0).sort((a, z) => z.v[c] - a.v[c]).slice(0, 3).map(x => `${x.name} ${x.v[c]}`).join(', ');
  const cur = sd.history[i]?.table.find(x => x.manager_id === m); const prev = i > 0 ? sd.history[i - 1]?.table.find(x => x.manager_id === m) : null;
  const curRank = cur ? cur.rank : 0, prevRank = prev ? prev.rank : curRank; const rankDelta = prev ? prevRank - curRank : 0;
  return { m, t, total, rows, bench, ghosts, prophet, solo, keeper, top, curRank, prevRank, rankDelta };
}

/** Die drei herausragenden Auszeichnungen einer Runde (Index i in sd.upto). */
export function roundAwards(sd, i) {
  const b = sd.base; const ids = b.managerIds; const d = sd.datas[i];
  if (!d || !d.matches.some(m => m.finished)) return [];
  const prof = {}; ids.forEach(m => prof[m] = profile(sd, i, m));
  const strict = [], relaxed = [];
  for (const a of AWARDS) {
    const vals = ids.map(m => ({ m, v: a.value(prof[m]) }));
    const mean = vals.reduce((s, x) => s + x.v, 0) / vals.length; const sdv = Math.sqrt(vals.reduce((s, x) => s + (x.v - mean) ** 2, 0) / vals.length);
    const best = [...vals].sort((x, y) => y.v - x.v)[0]; const second = [...vals].sort((x, y) => y.v - x.v)[1];
    if (!sdv || best.v < a.min || (second && second.v === best.v)) continue;   // kein Alleinstellungsmerkmal
    const z = (best.v - mean) / sdv;
    const c = { key: a.key, title: a.title, icon: a.icon, manager_id: best.m, manager: b.managerName[best.m], value: best.v, z, gap: best.v - second.v, detail: a.detail(prof[best.m]) };
    (z >= a.zmin ? strict : relaxed).push(c);
  }
  strict.sort((x, y) => y.z - x.z); relaxed.sort((x, y) => y.z - x.z);
  // Erst herausragende Leistungen, möglichst verschiedene Manager; dann die restlichen herausragenden; reicht das nicht für
  // MIN_AWARDS, die besten der übrigen Kandidaten (jeder Manager höchstens zweimal).
  const out = []; const used = new Set(); const count = {};
  const take = c => { out.push(c); used.add(c.manager_id); count[c.manager_id] = (count[c.manager_id] || 0) + 1; };
  for (const c of strict) if (!used.has(c.manager_id) && out.length < MAX_AWARDS) take(c);
  for (const c of strict) if (!out.includes(c) && out.length < Math.min(MAX_AWARDS, Math.max(MIN_AWARDS, strict.length)) && (count[c.manager_id] || 0) < 2) take(c);
  for (const c of relaxed) if (out.length < MIN_AWARDS && (count[c.manager_id] || 0) < 2) take(c);
  return out;
}

/** Alle Auszeichnungen der Saison (gewertete Runden) und Zähler je Manager. */
export function seasonAwards(sd) {
  const rounds = []; const tally = {}; sd.base.managerIds.forEach(m => tally[m] = []);
  sd.upto.forEach((r, i) => { if (!(r.status === 'final' || sd.datas[i].matches.some(m => m.finished))) return; const aw = roundAwards(sd, i); rounds.push({ round: r, awards: aw }); aw.forEach(a => tally[a.manager_id].push({ round: r, ...a })); });
  return { rounds, tally };
}
