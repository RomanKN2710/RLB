/* kicker-Kader: täglicher Abgleich aller 18 Vereinskader (Spieler, Position laut kicker, Zu- und Abgänge). */
import * as cheerio from 'cheerio';
import { q, one, getSetting, setSetting } from './db';
import { fetchHtml, clubMatches, playerMatches } from './kicker';
import clubSlugs from '../../db/seed/kicker-clubs.json';

const POS = { Tor: 'T', Abwehr: 'V', Mittelfeld: 'M', Sturm: 'S' };
const BASE = () => process.env.KICKER_BASE || 'https://www.kicker.de';
const SEASON = () => process.env.KICKER_SEASON || '2026-27';

/** Kader-Seite eines Vereins parsen → [{pos, last, first, slug}] */
export function parseSquadPage(html) {
  const $ = cheerio.load(html); const out = [];
  $('h2.kick__section-headline--tableheadline').each((_, h) => {
    const pos = POS[$(h).text().trim()]; if (!pos) return;
    let t = $(h).next(); if (!t.is('table')) t = t.find('table').first(); if (!t.length) return;
    t.find('a[href*="/spieler/"]').each((_, a) => {
      const href = $(a).attr('href') || ''; const slug = href.split('/').filter(Boolean)[0]; if (!slug) return;
      const last = $(a).find('strong').text().trim() || $(a).text().trim(); const first = $(a).find('span').text().trim();
      out.push({ pos, last, first, slug });
    });
  });
  return out;
}

/** Liste {kickerClubSlug: [[pos,last,first,slug],…]} in die Datenbank übernehmen; liefert Protokoll. */
export async function applySquads(squads, b, source = 'kicker') {
  const clubOf = {}; for (const [id, slug] of Object.entries(clubSlugs)) clubOf[slug] = id;
  const before = await q('select slug, name, club, squad_pos, in_squad from bl_players');
  const prev = {}; before.forEach(p => prev[p.slug] = p);
  const seen = new Set(); const log = []; const now = new Date(); const rows = [];
  for (const [cslug, list] of Object.entries(squads)) {
    const club = clubOf[cslug] || cslug;
    for (const row of list) {
      const [pos, last, first, slug] = Array.isArray(row) ? row : [row.pos, row.last, row.first, row.slug];
      if (!slug || seen.has(slug)) continue; seen.add(slug);
      const name = last || first; const p = prev[slug];
      rows.push([slug, name, first || null, club, pos, pos, true, now, null]);
      if (!p || !p.in_squad) { if (before.length) log.push({ type: 'zugang', slug, name, club_to: club, pos_to: pos }); }
      else if (p.club !== club) log.push({ type: 'wechsel', slug, name, club_from: p.club, club_to: club, pos_to: pos });
      else if (p.squad_pos && p.squad_pos !== pos) log.push({ type: 'position', slug, name, club_to: club, pos_from: p.squad_pos, pos_to: pos });
    }
  }
  // Alle Kaderzeilen in wenigen Sammelanweisungen statt einer pro Spieler: ueber 500
  // Einzelabfragen sprengen sonst die Zeitgrenze der Serverless-Funktion.
  const cols = ['slug', 'name', 'first_name', 'club', 'pos', 'squad_pos', 'in_squad', 'seen_at', 'left_at'];
  for (let i = 0; i < rows.length; i += 150) {
    const part = rows.slice(i, i + 150); const params = [];
    const vals = part.map((r, ri) => { for (const v of r) params.push(v); return '(' + cols.map((_, ci) => '$' + (ri * cols.length + ci + 1)).join(',') + ')'; }).join(',');
    await q(`insert into bl_players(${cols.join(',')}) values ${vals}
      on conflict(slug) do update set name=excluded.name, first_name=excluded.first_name, club=excluded.club, squad_pos=excluded.squad_pos, pos=coalesce(bl_players.pos, excluded.pos), in_squad=true, seen_at=excluded.seen_at, left_at=null, updated_at=now()`, params);
  }
  // Abgänge: vorher im Kader, jetzt in keinem
  if (Object.keys(squads).length >= 18) {
    for (const p of before) if (p.in_squad && !seen.has(p.slug)) { await q('update bl_players set in_squad=false, left_at=$2 where slug=$1', [p.slug, now]); log.push({ type: 'abgang', slug: p.slug, name: p.name, club_from: p.club }); }
  }
  // Betroffene RLB-Spieler markieren
  const active = (b?.playersArr || []).filter(p => p.status === 'active');
  for (const l of log) {
    const hit = active.find(o => clubMatches(l.club_from ? clubSlugs[l.club_from] || l.club_from : clubSlugs[l.club_to] || l.club_to, o.club) && playerMatches(l.slug, l.name, o.name));
    l.rlb_player_id = hit ? hit.id : null;
    await q('insert into squad_log(type,slug,name,club_from,club_to,pos_from,pos_to,rlb_player_id) values($1,$2,$3,$4,$5,$6,$7,$8)', [l.type, l.slug, l.name, l.club_from || null, l.club_to || null, l.pos_from || null, l.pos_to || null, l.rlb_player_id]);
  }
  await setSetting('squads_sync', { at: now.toISOString(), source, clubs: Object.keys(squads).length, players: seen.size, changes: log.length });
  return { players: seen.size, clubs: Object.keys(squads).length, log };
}

/** Alle 18 Kader live von kicker laden (täglich per Cron oder Admin-Knopf). */
export async function syncSquads(b, fetcher = fetchHtml) {
  const squads = {}; const errors = [];
  for (const [club, slug] of Object.entries(clubSlugs)) {
    try { const list = parseSquadPage(await fetcher(`${BASE()}/${slug}/kader/bundesliga/${SEASON()}`)); if (!list.length) throw new Error('keine Spieler im HTML'); squads[slug] = list; }
    catch (e) { errors.push(`${club}: ${e.message}`); }
  }
  if (!Object.keys(squads).length) throw new Error('kicker-Kader nicht abrufbar: ' + errors[0]);
  const r = await applySquads(squads, b, 'kicker live');
  return { ...r, errors };
}

/** Offene Abgänge: RLB-Spieler (aktiv), die laut kicker in keinem Bundesliga-Kader mehr stehen. */
export async function rlbLeavers(b) {
  const gone = await q('select * from bl_players where in_squad=false and left_at is not null');
  const active = b.playersArr.filter(p => p.status === 'active'); const out = [];
  for (const g of gone) { const hit = active.find(o => clubMatches(clubSlugs[g.club] || g.club || '', o.club) && playerMatches(g.slug, g.name, o.name)); if (hit) out.push({ player: hit, since: g.left_at }); }
  return out;
}

/** Position laut kicker-Kader für einen RLB-Spieler (Grundposition zum Vergleich). */
export async function kickerPosOf(player) {
  const rows = await q('select slug,name,squad_pos from bl_players where in_squad and club=$1', [player.club]);
  const hit = rows.find(r => playerMatches(r.slug, r.name, player.name)); return hit ? hit.squad_pos : null;
}
