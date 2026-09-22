/* Hall of Fame: Endstände aller Saisons seit 1999/2000 (ewige Rangliste aus dem Excel plus spätere Saisons), Meister,
   ewige Tabelle und Ehrungen (Rekordmeister, Podestkönig, Dynastie, Dauerbrenner, Stehaufmännchen …). */
import { q } from './db';

let ready = false;
export async function ensureTable() {
  if (ready) return;
  await q(`create table if not exists hall_of_fame (season text not null, rank int not null, manager text not null, points numeric(7,2), note text)`);
  await q('alter table hall_of_fame drop constraint if exists hall_of_fame_pkey');           // Gleichstände: mehrere Manager je Rang
  await q('create unique index if not exists hall_of_fame_season_manager on hall_of_fame(season, manager)');
  ready = true;
}

/** Zeilen wie «1 Dani 55.5», «t1 Mark» (Gleichstand), «1. Dani 55,5», «Dani 55.5» (Rang = Reihenfolge) oder «Dani». */
export function parseSeasonText(text) {
  const rows = []; let n = 0;
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim(); if (!line) continue; n++;
    const tie = line.match(/^t(\d{1,2})\s+(.+?)(?:\s+(-?\d+(?:[.,]\d+)?))?\s*$/i);
    if (tie) { rows.push({ rank: Number(tie[1]), manager: tie[2].trim(), points: tie[3] ? Number(tie[3].replace(',', '.')) : null }); continue; }
    const m = line.match(/^(\d{1,2})[.)]?\s+(.+?)(?:\s+(-?\d+(?:[.,]\d+)?))?\s*$/);
    if (m) { rows.push({ rank: Number(m[1]), manager: m[2].trim(), points: m[3] ? Number(m[3].replace(',', '.')) : null }); continue; }
    const p = line.match(/^(.+?)\s+(-?\d+(?:[.,]\d+)?)\s*$/);
    rows.push({ rank: n, manager: (p ? p[1] : line).trim(), points: p ? Number(p[2].replace(',', '.')) : null });
  }
  return rows;
}

export async function importSeason(season, text, note = '') {
  await ensureTable(); const rows = typeof text === 'string' ? parseSeasonText(text) : text; if (!rows.length) throw new Error('Keine Zeilen erkannt');
  season = String(season || '').trim(); if (!season) throw new Error('Saison fehlt (z. B. 2025/26)');
  await q('delete from hall_of_fame where season=$1', [season]);
  for (const r of rows) await q('insert into hall_of_fame(season,rank,manager,points,note) values($1,$2,$3,$4,$5) on conflict (season, manager) do nothing', [season, r.rank, r.manager, r.points ?? null, note || null]);
  return rows.length;
}
export async function deleteSeason(season) { await ensureTable(); await q('delete from hall_of_fame where season=$1', [season]); }

const F1 = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];                               // ewige Punkte je Endrang
const seasonKey = s => Number(String(s).slice(0, 4)) || 0;

/** Alle Saisons (neueste zuerst), ewige Tabelle und Ehrungen. */
export async function all() {
  await ensureTable();
  const rows = await q('select * from hall_of_fame order by season desc, rank, manager');
  const seasons = []; for (const r of rows) { let s = seasons.find(x => x.season === r.season); if (!s) { s = { season: r.season, rows: [], note: r.note }; seasons.push(s); } s.rows.push(r); }
  seasons.forEach(s => { s.n = s.rows.length; s.last = Math.max(...s.rows.map(r => r.rank)); s.champions = s.rows.filter(r => r.rank === 1).map(r => r.manager); });
  const chrono = [...seasons].sort((a, b) => seasonKey(a.season) - seasonKey(b.season));
  const M = {};
  const get = m => M[m] ||= { manager: m, seasons: 0, titles: 0, second: 0, third: 0, podium: 0, last: 0, rankSum: 0, points: 0, first: null, latest: null, titleSeasons: [], ranks: [] };
  for (const s of chrono) for (const r of s.rows) { const x = get(r.manager); x.seasons++; x.rankSum += r.rank; x.ranks.push([s.season, r.rank]);
    if (r.rank === 1) { x.titles++; x.titleSeasons.push(s.season); } if (r.rank === 2) x.second++; if (r.rank === 3) x.third++; if (r.rank <= 3) x.podium++; if (r.rank === s.last && s.n >= 6) x.last++;
    x.points += F1[r.rank - 1] || 0; x.first = x.first || s.season; x.latest = s.season; }
  const list = Object.values(M).map(x => ({ ...x, avgRank: x.rankSum / x.seasons }));
  // Dynastie: längste Serie aufeinanderfolgender Titel; Durststrecke: längste Lücke zwischen zwei Titeln
  for (const x of list) { let best = 0, run = 0, prev = null, gap = 0; for (const s of chrono) { const won = s.champions.includes(x.manager); run = won ? run + 1 : 0; best = Math.max(best, run); if (won) { if (prev != null) gap = Math.max(gap, seasonKey(s.season) - prev - 1); prev = seasonKey(s.season); } } x.streak = best; x.gap = gap; }
  const table = [...list].sort((a, b) => b.titles - a.titles || b.podium - a.podium || b.points - a.points || a.avgRank - b.avgRank);
  const top = (key, min = 1, cmp = (a, b) => b[key] - a[key]) => { const s = [...list].filter(x => x[key] >= min).sort(cmp); return s.length ? s[0] : null; };
  const regulars = list.filter(x => x.seasons >= 5);
  const honours = [];
  const add = (icon, title, x, text) => { if (x) honours.push({ icon, title, manager: x.manager, text }); };
  const rm = top('titles'); if (rm) add('👑', 'Rekordmeister', rm, `${rm.titles} Titel (${rm.titleSeasons.join(', ')})`);
  const pk = [...list].sort((a, b) => b.podium - a.podium || b.titles - a.titles)[0]; if (pk) add('🏅', 'Podestkönig', pk, `${pk.podium}× Top 3: ${pk.titles}× Gold, ${pk.second}× Silber, ${pk.third}× Bronze`);
  const cur = chrono[chrono.length - 1]; if (cur) honours.push({ icon: '🛡️', title: 'Titelverteidiger', manager: cur.champions.join(' & '), text: `Meister ${cur.season}` });
  const dy = [...list].filter(x => x.streak >= 2).sort((a, b) => b.streak - a.streak)[0]; if (dy) add('🔥', 'Dynastie', dy, `${dy.streak} Titel in Folge`);
  const db = top('seasons'); if (db) add('🏃', 'Dauerbrenner', db, `${db.seasons} von ${chrono.length} Saisons dabei, seit ${db.first}`);
  // Stehaufmännchen: grösster Sprung nach oben zwischen zwei aufeinanderfolgenden Saisons
  for (const x of list) { x.climb = 0; for (let i = 1; i < x.ranks.length; i++) { const [sa, ra] = x.ranks[i - 1], [sb, rb] = x.ranks[i]; if (seasonKey(sb) - seasonKey(sa) === 1 && ra - rb > x.climb) { x.climb = ra - rb; x.climbText = `${sa}: ${ra}. → ${sb}: ${rb}.`; } } }
  const st = [...list].filter(x => x.climb >= 3).sort((a, b) => b.climb - a.climb || b.titles - a.titles)[0]; if (st) add('🧗', 'Stehaufmännchen', st, `${st.climb} Plätze rauf in einem Jahr (${st.climbText})`);
  const ko = [...regulars].sort((a, b) => a.avgRank - b.avgRank)[0]; if (ko) add('🎯', 'Konstanz', ko, `Ø Platz ${ko.avgRank.toFixed(1)} über ${ko.seasons} Saisons`);
  const cb = [...list].filter(x => x.gap >= 5).sort((a, b) => b.gap - a.gap)[0]; if (cb) add('🔄', 'Comeback', cb, `${cb.gap} Jahre zwischen zwei Titeln`);
  const bs = list.find(x => x.titleSeasons[0] && x.titleSeasons[0] === x.first && x.first !== chrono[0]?.season) || list.find(x => x.titleSeasons[0] && x.titleSeasons[0] === x.first); if (bs) add('⚡', 'Blitzstart', bs, `Meister in der ersten Saison (${bs.first})`);
  const ewig = [...regulars].sort((a, b) => b.points - a.points)[0]; if (ewig) add('🧮', 'Ewiger Punktekönig', ewig, `${ewig.points} Punkte nach Formel-1-Wertung (25-18-15-12-10-8-6-4-2-1)`);
  return { seasons, chrono, table, honours, count: chrono.length, firstSeason: chrono[0]?.season || null };
}
