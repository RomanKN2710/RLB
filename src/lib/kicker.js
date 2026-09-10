/* kicker-Import (Regelwerk Ziff. 8: Basis für die Kategorienbewertung ist die Publikation des kicker).
   Pro Spiel wird die Seite ".../aufstellung" gelesen: Startelf beider Teams, Spielerwechsel, Tore mit Vorbereitung, Karten.
   Pro Spieltag die Seite "Elf des Tages": Team der Runde und Spieler des Tages. */
import * as cheerio from 'cheerio';
import { q, one, setSetting } from './db';

const BASE = () => (process.env.KICKER_BASE || 'https://www.kicker.de').replace(/\/$/, '');
const SEASON = () => process.env.KICKER_SEASON || '2026-27';

export async function fetchHtml(url) {
  const r = await fetch(url, { headers: { 'user-agent': process.env.KICKER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', accept: 'text/html,application/xhtml+xml', 'accept-language': 'de-CH,de;q=0.9' }, cache: 'no-store', redirect: 'follow' });
  if (!r.ok) {
    // 403/429 heisst bei kicker so gut wie immer: Abrufe aus Rechenzentren sind gesperrt.
    // Der Kennsatz oben ist bereits der eines Browsers, daran liegt es also nicht.
    const hint = [403, 429, 503].includes(r.status)
      ? ' – kicker lässt Abrufe von Servern nicht zu. Die App läuft bei Vercel im Rechenzentrum, deshalb greift die Sperre. Nimm den Rückfall im Admin: Seite im eigenen Browser öffnen und die Daten von dort übernehmen.'
      : '';
    throw new Error(`kicker ${url}: HTTP ${r.status}${hint}`);
  }
  return r.text();
}

/* ---------- Namens- und Vereinsabgleich ---------- */
export const slugify = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const tokens = s => slugify(s).split('-').filter(t => t && !/^\d+$/.test(t));
const stripInitials = ts => ts.filter(t => t.length > 1);
/** Passt der kicker-Spieler (Slug wie "dayot-upamecano", Anzeigename "Upamecano") zu unserem Spielernamen ("Upamecano", "Luis Diaz", "Schlotterbeck N.", "L. Vazquez")? */
export function playerMatches(kSlug, kName, ourName) {
  const a = stripInitials(tokens(kSlug)), b = stripInitials(tokens(ourName)), n = stripInitials(tokens(kName));
  if (!a.length || !b.length) return false;
  if (b.join('') === a.join('') || b.join('') === n.join('')) return true;
  if (b.every(t => a.includes(t) || n.includes(t))) return true;          // alle unsere Namensteile kommen bei kicker vor
  const la = a[a.length - 1], lb = b[b.length - 1];
  if (la === lb) return true;                                             // gleicher Nachname
  if (b.length === 1 && (a.join('-').endsWith(b[0]) || n.join('-').endsWith(b[0]))) return true;  // "Fuellkrug" vs "niclas-fuellkrug"
  return false;
}
/** kicker-Vereinsslug (z. B. "fc-bayern-muenchen") zu unserem Vereinsnamen ("Bayern"). */
export function clubMatches(kTeamSlug, ourClub) {
  const c = slugify(ourClub); if (!c) return false;
  const t = String(kTeamSlug || '').toLowerCase();
  if (t.includes(c)) return true;
  const alias = { gladbach: 'moenchengladbach', hamburg: 'hamburger', koeln: 'koeln', union: 'union-berlin', hoffenheim: 'hoffenheim', frankfurt: 'frankfurt', leipzig: 'leipzig', bremen: 'bremen' };
  return alias[c] ? t.includes(alias[c]) : false;
}
const teamOfHref = href => (String(href).split('/spieler/')[1] || '').split('/').slice(1).join('/'); // "bundesliga/2026-27/fc-bayern-muenchen" -> "2026-27/fc-bayern-muenchen"
const slugOfHref = href => { const m = String(href).match(/kicker\.\w+\/([^/]+)\/spieler\//) || String(href).match(/^\/([^/]+)\/spieler\//); return m ? m[1] : ''; };

/* ---------- Parser ---------- */
/** Links der Spiele eines Spieltags von der Spieltagsseite. */
export function parseMatchdayLinks(html) {
  const set = new Set(); const re = /href="(?:https?:\/\/www\.kicker\.\w+)?(\/[a-z0-9-]+-gegen-[a-z0-9-]+-\d{4}-bundesliga-\d+)\//g; let m;
  while ((m = re.exec(html))) set.add(m[1]);
  return [...set];
}

/** Aufstellungsseite eines Spiels: Startelf, Wechsel, Tore/Vorlagen, Karten. Alle Spieler als {slug, name, team}. */
export function parseMatchPage(html) {
  const $ = cheerio.load(html);
  const player = a => ({ slug: slugOfHref($(a).attr('href')), name: $(a).text().trim(), team: teamOfHref($(a).attr('href')).split('/').pop() });
  const teams = []; const starters = [];
  $('.kick__lineup__teamrow').each((i, row) => {
    const teamName = $(row).find('.kick__lineup__teamrow__teamname').text().trim();
    // Aufstellung als Formationszeilen: "Torwart - Abwehr - Mittelfeld [- Mittelfeld] - Sturm"; daraus die kicker-Position pro Spieler (Ziff. 5.2: Spielbericht)
    const groups = [[]]; $(row).find('p').first().contents().each((_, node) => { if (node.type === 'text') { if (node.data.includes('-')) groups.push([]); } else if (node.name === 'a' && /\/spieler\//.test($(node).attr('href') || '')) groups[groups.length - 1].push(player(node)); });
    const g = groups.filter(x => x.length); const posOf = gi => g.length <= 1 ? null : gi === 0 ? 'T' : gi === g.length - 1 ? 'S' : gi === 1 ? 'V' : 'M';
    const links = []; g.forEach((grp, gi) => grp.forEach(pl => links.push({ ...pl, pos: posOf(gi) })));
    teams.push({ name: teamName, slug: links[0]?.team || '', formation: g.map(x => x.length).slice(1).join('-') }); links.forEach(p => starters.push({ ...p, teamIndex: i }));
  });
  const events = [];
  $('.kick__game-timeline .kick__ticker-event-overlay-box__content').each((_, c) => {
    const p = $(c).find('p').first(); if (!p.length) return;
    const header = $(c).prev('.kick__ticker-event-overlay-box__header').text().trim();
    const minute = (header.match(/(\d+)\.\s*(?:\+\s*(\d+))?/) || [])[1];
    const lines = p.html().split(/<br\s*\/?>/i).map(x => cheerio.load(x).text().replace(/\s+/g, ' ').trim()).filter(Boolean);
    const links = p.find('a[href*="/spieler/"]').toArray().map(player);
    const head = lines[0] || '';
    if (/^Tor annulliert/i.test(head)) return;
    if (/^Tor\b/i.test(head)) {
      const own = lines.some(l => /Eigentor/i.test(l)); const scorer = links[0] || null;
      const assistIdx = lines.findIndex(l => /^Vorbereitung/i.test(l)); const assist = assistIdx >= 0 ? links[1] || null : null;
      events.push({ type: 'goal', minute, scorer, assist, ownGoal: own, penalty: lines.some(l => /Elfmeter|Foulelfmeter|Handelfmeter/i.test(l)) });
    } else if (/^Gelb-Rote Karte/i.test(head)) events.push({ type: 'yellowred', minute, player: links[0] });
    else if (/^Gelbe Karte/i.test(head)) events.push({ type: 'yellow', minute, player: links[0] });
    else if (/^Rote Karte/i.test(head)) events.push({ type: 'red', minute, player: links[0] });
    else if (/^Spielerwechsel/i.test(head)) events.push({ type: 'sub', minute, in: links[0], out: links[1] });
  });
  return { teams, starters, events };
}

/** Elf-des-Tages-Seite: 11 Spieler {slug, name, team} und Spieler des Tages. */
export function parseElfDesTages(html) {
  const $ = cheerio.load(html);
  const elf = $('.kick__lineup-field a.kick__lineup-player-card').toArray().map(a => ({ slug: slugOfHref($(a).attr('href')), name: $(a).find('.kick__lineup-player-card__name').text().trim() || $(a).find('img').attr('alt') || '', team: teamOfHref($(a).attr('href')).split('/').pop(), fullName: $(a).find('img').attr('alt') || '' }));
  let sdt = null; const h = $('h3.kick__card-headline').filter((_, e) => /Spieler des Tages/i.test($(e).text())).first();
  if (h.length) { const card = h.closest('.kick__card'); const a = card.find('.kick__player-hero a[href*="/spieler/"]').first();
    if (a.length) sdt = { slug: slugOfHref(a.attr('href')), name: (a.find('img').attr('alt') || '').trim() || slugOfHref(a.attr('href')).replace(/-/g, ' '), team: teamOfHref(a.attr('href')).split('/').pop() }; }
  return { elf, sdt };
}

/* ---------- Bewertung pro Spieler aus den Spieldaten ---------- */
/** Liefert pro kicker-Spieler {start, assist, tore, karten} für ein Spiel (Karten: Gelb 1, Gelb-Rot 2, Rot 3, Rot nach Gelb 4). */
export function matchStats(parsed, opts = {}) {
  const stats = {}; const get = p => { if (!p || !p.slug) return null; return stats[p.slug] ||= { slug: p.slug, name: p.name, team: p.team, start: 0, assist: 0, tore: 0, karten: 0, kpos: null, notes: [] }; };
  parsed.starters.forEach(p => { const s = get(p); s.start = 1; s.kpos = p.pos || null; });
  for (const e of parsed.events) {
    if (e.type === 'sub') { const s = get(e.in); if (s && s.start === 0) s.start = 2; }
    else if (e.type === 'goal') {
      if (!e.ownGoal && e.scorer) get(e.scorer).tore++;
      if (e.assist) { const s = get(e.assist); if (e.ownGoal) { if (opts.assistOnOwnGoal) s.assist++; s.notes.push(`Vorbereitung bei Eigentor (${e.minute}')${opts.assistOnOwnGoal ? '' : ', nicht gezählt'}`); } else s.assist++; }
    }
    else if (e.type === 'yellow') { const s = get(e.player); if (s) s.karten += 1; }
    else if (e.type === 'yellowred') { const s = get(e.player); if (s) { s.karten = 2; s.notes.push('Gelb-Rot'); } }
    else if (e.type === 'red') { const s = get(e.player); if (s) { s.karten = s.karten >= 1 ? 4 : 3; s.notes.push(s.karten === 4 ? 'Rot nach Gelb' : 'Rot'); } }
  }
  return stats;
}

/* ---------- Import in die Datenbank ---------- */
/**
 * Importiert eine Runde: holt Spieltagsseite, alle Spiele und Elf des Tages, schreibt results (start, assist, tore, karten, tdr), rounds.tdr/sdt.
 * fetcher(url) kann für Tests ersetzt werden. Gesperrte Zeilen (locked) werden nicht überschrieben.
 */
export async function importRound(round, b, fetcher = fetchHtml, opts = {}) {
  const log = []; const base = BASE(); const season = SEASON();
  const lus = await q('select * from lineups where round_id=$1', [round.id]);
  const lineupPlayers = []; lus.forEach(l => Object.keys(l.entries || {}).forEach(pid => { const p = b.players[pid]; if (p) lineupPlayers.push({ ...p, manager_id: l.manager_id }); }));
  // 1) Spiele finden
  let paths = opts.paths;
  if (!paths) { const md = round.matchday; const html = await fetcher(`${base}/bundesliga/spieltag/${season}/${md}`); paths = parseMatchdayLinks(html); if (!paths.length) throw new Error('Spieltagsseite ohne Spiel-Links (Bot-Schutz oder Layout geändert); Rückfall: HTML einfügen'); }
  if (round.type === 'nachtrag' && round.match_ids?.length && paths.length > 1 && opts.filterNachtrag !== false) log.push('Nachtragsrunde: bitte nur das betroffene Spiel importieren (Pfad manuell angeben)');
  log.push(`${paths.length} Spiele gefunden`);
  // 2) Spiele lesen
  const perPlayer = {}; // pid -> stats
  const allStarters = [];
  const importedTeamSlugs = [];
  const resolve = (kp) => { const hits = lineupPlayers.filter(p => clubMatches(kp.team, p.club) && playerMatches(kp.slug, kp.name, p.name)); if (hits.length === 1) return hits[0]; if (hits.length > 1) { log.push(`mehrdeutig: ${kp.name} (${kp.team}) → ${hits.map(h => h.name).join(', ')}`); } return null; };
  for (const path of paths) {
    let parsed; try { parsed = parseMatchPage(await fetcher(`${base}${path}/aufstellung`)); if (!parsed.starters.length) throw new Error('keine Aufstellung im HTML (Bot-Schutz oder Layout geändert)'); } catch (e) { log.push(`Fehler ${path}: ${e.message}`); continue; }
    const stats = matchStats(parsed, opts); parsed.teams.forEach(t => importedTeamSlugs.push(t.slug));
    await upsertPool(Object.values(stats), b, round.matchday);
    allStarters.push(...Object.values(stats).filter(s => s.start === 1 && s.kpos).map(s => ({ ...s, formation: (parsed.teams.find(t => t.slug === s.team) || {}).formation })));
    let n = 0; for (const s of Object.values(stats)) { const p = resolve(s); if (!p) continue; n++; perPlayer[p.id] = { start: s.start, assist: s.assist, tore: s.tore, karten: s.karten, kpos: s.kpos, notes: s.notes }; }
    log.push(`${parsed.teams.map(t => t.name).join(' – ')}: ${Object.keys(stats).length} Spieler, ${n} in Aufstellungen`);
  }
  // Positionserwerb (Ziff. 5.2) für alle RLB-Spieler (auch Ersatzbank), nicht nur Aufgestellte
  log.push(...await acquirePositions(allStarters, b, round));
  // Spieler in Aufstellungen, deren Verein gespielt hat, aber ohne kicker-Daten (Namensabgleich prüfen oder nicht im Kader)
  const missing = lineupPlayers.filter(p => !perPlayer[p.id] && importedTeamSlugs.some(t => clubMatches(t, p.club)));
  if (missing.length) log.push(`ohne kicker-Daten (nicht im Spiel oder Name prüfen): ${missing.map(p => p.name).join(', ')}`);
  // 3) Elf des Tages
  let elf = null; try { elf = parseElfDesTages(await fetcher(`${base}/bundesliga/elf-des-tages/${season}/${round.matchday}`)); } catch (e) { log.push('Elf des Tages: ' + e.message); }
  const tdrPids = new Set(); const tdrNames = []; let sdtPid = null;
  if (elf && elf.elf.length) { for (const kp of elf.elf) { tdrNames.push(kp.name); const p = resolve(kp); if (p) tdrPids.add(p.id); }
    if (elf.sdt) { const p = resolve(elf.sdt); if (p) sdtPid = p.id; }
    log.push(`Elf des Tages: ${elf.elf.length} Spieler, ${tdrPids.size} in Aufstellungen${elf.sdt ? ', Spieler des Tages ' + elf.sdt.name + (sdtPid ? ' (+1 TdR, wie im Excel)' : '') : ''}`); }
  // 4) Schreiben
  let written = 0, skipped = 0;
  for (const p of lineupPlayers) {
    const tdr = (tdrPids.has(p.id) ? 1 : 0) + (opts.sdtBonus !== false && sdtPid === p.id ? 1 : 0); // Spieler des Tages zählt zusätzlich (Konvention aus dem Excel, Runde 1: Suzuki 2)
    if (opts.partial && !perPlayer[p.id]) {   // Teil-Import: Spieler ohne eingefügtes Spiel bekommen nur den TdR-Wert (falls Elf des Tages eingefügt)
      if (elf && elf.elf.length) { const r = await one(`insert into results(round_id,player_id,tdr,source) values($1,$2,$3,'kicker') on conflict(round_id,player_id) do update set tdr=excluded.tdr where results.locked = false returning player_id`, [round.id, p.id, tdr]); if (r) written++; else skipped++; }
      continue; }
    const s = perPlayer[p.id] || { start: 0, assist: 0, tore: 0, karten: 0, kpos: null, notes: [] };
    const r = await one(`insert into results(round_id,player_id,start,assist,tore,karten,tdr,kpos,source) values($1,$2,$3,$4,$5,$6,$7,$8,'kicker')
      on conflict(round_id,player_id) do update set start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten, tdr=excluded.tdr, kpos=excluded.kpos, source='kicker' where results.locked = false returning player_id`, [round.id, p.id, s.start, s.assist, s.tore, s.karten, tdr, s.kpos]);
    if (r) written++; else skipped++;
    if (s.notes.length) log.push(`${p.name}: ${s.notes.join('; ')}`);
  }
  if (round.type !== 'nachtrag' && elf && elf.elf.length && tdrNames.length) await q('update rounds set tdr=$1, sdt=coalesce($2, sdt) where id=$3', [tdrNames, elf.sdt ? elf.sdt.name : null, round.id]);
  log.push(`${written} Spielerzeilen geschrieben, ${skipped} gesperrt (vom Admin geändert)`);
  await setSetting(`kicker_import_${round.id}`, { at: new Date().toISOString(), log });
  return { log, perPlayer, tdrNames, sdt: elf?.sdt?.name || null };
}

/** Spielerpool pflegen: jeder Spieler, der laut kicker im Spiel stand (Startelf oder eingewechselt), mit Verein und kicker-Position. */
export async function upsertPool(stats, b, matchday) {
  // Eine Sammelanweisung statt einer Abfrage pro Spieler. Innerhalb einer Anweisung
  // darf ein slug nur einmal vorkommen, sonst bricht Postgres den ON-CONFLICT-Teil ab.
  const seen = new Set(); const rows = [];
  for (const s of stats) {
    if (!s.slug || seen.has(s.slug)) continue; seen.add(s.slug);
    const club = (b.clubs || []).map(c => c.id).find(id => clubMatches(s.team, id)) || null;
    const played = s.start === 1 && s.kpos ? [s.kpos] : [];
    rows.push([s.slug, s.name, club, s.kpos || null, matchday || null, played]);
  }
  const cols = ['slug', 'name', 'club', 'pos', 'last_matchday', 'played_pos'];
  for (let i = 0; i < rows.length; i += 150) {
    const part = rows.slice(i, i + 150); const params = [];
    const vals = part.map((r, ri) => { for (const v of r) params.push(v); const b0 = ri * cols.length;
      return `($${b0 + 1},$${b0 + 2},$${b0 + 3},$${b0 + 4},$${b0 + 5},1,$${b0 + 6})`; }).join(',');
    await q(`insert into bl_players(slug,name,club,pos,last_matchday,games,played_pos) values ${vals}
      on conflict(slug) do update set name=excluded.name, club=coalesce(excluded.club, bl_players.club), pos=coalesce(excluded.pos, bl_players.pos), last_matchday=greatest(bl_players.last_matchday, excluded.last_matchday), games=case when bl_players.last_matchday is distinct from excluded.last_matchday then bl_players.games+1 else bl_players.games end, played_pos=(select array_agg(distinct x) from unnest(bl_players.played_pos || excluded.played_pos) x), updated_at=now()`, params);
  }
}

/**
 * Positionserwerb (Ziff. 5.2): jeder RLB-Spieler (Stamm oder Ersatzbank), der laut kicker-Spielbericht in der Startaufstellung
 * auf einer anderen Position stand als seiner Grundposition, ist ab der Folgerunde auf BEIDEN Positionen einsetzbar.
 * starters: [{slug, name, team, kpos}], round: Runde des Spiels. Liefert Protokollzeilen.
 */
export async function acquirePositions(starters, b, round) {
  const log = []; const active = (b.playersArr || []).filter(p => p.status === 'active');
  for (const s of starters) {
    if (!s.kpos || s.kpos === 'T') continue;
    const hits = active.filter(p => clubMatches(s.team, p.club) && playerMatches(s.slug, s.name, p.name));
    if (hits.length !== 1) continue; const p = hits[0];
    if (s.kpos === p.base_pos || (p.extra_pos || []).includes(s.kpos)) continue;
    await q('update players set extra_pos = array_append(extra_pos, $1) where id=$2 and not ($1 = any(extra_pos))', [s.kpos, p.id]); p.extra_pos = [...(p.extra_pos || []), s.kpos];
    const ex = await q("select 1 from transfers where type='position' and manager_id=$1 and player_name=$2 and note like $3", [p.manager_id, p.name, `Zusatzposition ${s.kpos}%`]);
    if (!ex.length) await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'position',$3,0,$4)", [round.id, p.manager_id, p.name, `Zusatzposition ${s.kpos} erworben (kicker-Startelf ${round.label}, Ziff. 5.2) – ab Folgerunde ${p.base_pos}/${[...new Set(p.extra_pos)].join('/')}`]);
    const doubt = s.formation && /^3-/.test(s.formation) && p.base_pos === 'V' && s.kpos === 'M' ? ' – Formation ' + s.formation + ': Aussenverteidiger als M gezählt, im Zweifel −Pos (5.2)' : '';
    log.push(`${p.name}: Zusatzposition ${s.kpos} (Startelf laut kicker, ${round.label})${doubt}`);
  }
  return log;
}

/** Startaufstellungen aus einer gespeicherten Liste (db/seed/kicker-startelf.json) anwenden: Pool-Positionen und Positionserwerb je Runde. */
export async function applyStartelfSeed(seed, b) {
  const log = [];
  for (const [md, matches] of Object.entries(seed.matchdays || {})) {
    const round = await one("select * from rounds where type='regulaer' and matchday=$1", [Number(md)]); if (!round) continue;
    const starters = [];
    for (const m of matches) for (const t of m.teams) for (const [slug, name, team, kpos] of t.starters) starters.push({ slug, name, team, kpos, formation: t.formation, start: 1, assist: 0, tore: 0, karten: 0, notes: [] });
    await upsertPool(starters, b, Number(md));
    log.push(...await acquirePositions(starters, b, round));
  }
  return log;
}
