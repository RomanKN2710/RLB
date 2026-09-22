/* Hall of Fame: Endstände vergangener Saisons (aus den alten Excel-Auswertungen), Meister und Titelzähler. */
import { q } from './db';

let ready = false;
export async function ensureTable() {
  if (ready) return;
  await q(`create table if not exists hall_of_fame (season text not null, rank int not null, manager text not null, points numeric(7,2), note text, primary key (season, rank))`);
  ready = true;
}

/** Zeilen wie «1 Dani 55.5», «1. Dani 55,5», «Dani 55.5» (Rang = Reihenfolge) oder «Dani\t55.5». */
export function parseSeasonText(text) {
  const rows = []; let auto = 0;
  for (let line of String(text || '').split(/\r?\n/)) {
    line = line.trim(); if (!line) continue;
    const m = line.match(/^(\d{1,2})[.)]?\s+(.+?)\s+(-?\d+(?:[.,]\d+)?)\s*$/) || line.match(/^(?:)(.+?)[\s\t]+(-?\d+(?:[.,]\d+)?)\s*$/);
    if (!m) { const m2 = line.match(/^(\d{1,2})[.)]?\s+(.+)$/); if (m2) { rows.push({ rank: Number(m2[1]), manager: m2[2].trim(), points: null }); continue; } rows.push({ rank: ++auto, manager: line, points: null }); continue; }
    if (m.length === 4) rows.push({ rank: Number(m[1]), manager: m[2].trim(), points: Number(m[3].replace(',', '.')) });
    else rows.push({ rank: ++auto, manager: m[1].trim(), points: Number(m[2].replace(',', '.')) });
  }
  if (rows.some(r => !r.rank)) rows.forEach((r, i) => r.rank = i + 1);
  return rows;
}

export async function importSeason(season, text, note = '') {
  await ensureTable(); const rows = parseSeasonText(text); if (!rows.length) throw new Error('Keine Zeilen erkannt');
  season = String(season || '').trim(); if (!season) throw new Error('Saison fehlt (z. B. 2025/26)');
  await q('delete from hall_of_fame where season=$1', [season]);
  for (const r of rows) await q('insert into hall_of_fame(season,rank,manager,points,note) values($1,$2,$3,$4,$5)', [season, r.rank, r.manager, r.points, note || null]);
  return rows.length;
}
export async function deleteSeason(season) { await ensureTable(); await q('delete from hall_of_fame where season=$1', [season]); }

/** Alle Saisons (neueste zuerst) mit Rangliste, Meisterliste und Titelzähler. */
export async function all() {
  await ensureTable();
  const rows = await q('select * from hall_of_fame order by season desc, rank');
  const seasons = []; for (const r of rows) { let s = seasons.find(x => x.season === r.season); if (!s) { s = { season: r.season, rows: [], note: r.note }; seasons.push(s); } s.rows.push(r); }
  const titles = {}; const podium = {}; const seasonsPlayed = {};
  for (const s of seasons) for (const r of s.rows) { seasonsPlayed[r.manager] = (seasonsPlayed[r.manager] || 0) + 1; if (r.rank === 1) titles[r.manager] = (titles[r.manager] || 0) + 1; if (r.rank <= 3) podium[r.manager] = (podium[r.manager] || 0) + 1; }
  const ehrentafel = Object.keys(seasonsPlayed).map(m => ({ manager: m, titles: titles[m] || 0, podium: podium[m] || 0, seasons: seasonsPlayed[m], avgRank: seasons.reduce((a, s) => { const r = s.rows.find(x => x.manager === m); return a + (r ? r.rank : 0); }, 0) / seasonsPlayed[m] })).sort((a, b) => b.titles - a.titles || b.podium - a.podium || a.avgRank - b.avgRank);
  return { seasons, ehrentafel };
}
