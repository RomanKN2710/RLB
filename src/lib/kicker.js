/* kicker-Import (Regelwerk Ziff. 8: Basis für die Kategorienbewertung ist die Publikation des kicker).
   Grundlage sind ausschliesslich die Quelltexte der kicker-Seiten, die der Admin einspielt (Eingang vom Handy oder
   Einfügen im Browser): pro Spiel die Seite ".../aufstellung" (Startelf, Reservebank, Wechsel, Tore mit Vorbereitung,
   Karten), pro Spieltag die Seite "Elf des Tages" (Team der Runde, Spieler des Tages).
   Ein direkter Abruf von kicker ist von Vercel aus gesperrt und wird hier nicht mehr versucht. */
import * as cheerio from 'cheerio';
import { q, one, setSetting } from './db';
import clubSlugs from '../../db/seed/kicker-clubs.json';

/* ---------- Namens- und Vereinsabgleich ---------- */
/** Kanonische Schreibweise: Umlaute zu ae/oe/ue (wie in kicker-Slugs), Akzente weg, nur a-z0-9 und Bindestrich. */
export const slugify = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Vergleichsform eines Namensteils: ae/oe/ue zusätzlich zusammengezogen, damit "Grüll", "Gruell" und "Grull" gleich sind. */
const fold = t => t.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const tokens = s => slugify(s).split('-').filter(t => t && !/^\d+$/.test(t)).map(fold);
const stripInitials = ts => ts.filter(t => t.length > 1);
/** Passt der kicker-Spieler (Slug "dayot-upamecano", Anzeigename "Upamecano") zu unserem Namen ("Upamecano", "Luis Diaz", "Schlotterbeck N.", "L. Vazquez")? */
export function playerMatches(kSlug, kName, ourName) {
  const a = stripInitials(tokens(kSlug)), b = stripInitials(tokens(ourName)), n = stripInitials(tokens(kName));
  if (!a.length || !b.length) return false;
  if (b.join('') === a.join('') || b.join('') === n.join('')) return true;
  // Unser letzter Namensteil ist der Nachname; der muss bei kicker als Nachname vorkommen. Ein Vorname-Treffer reicht nicht.
  const la = a[a.length - 1], lb = b[b.length - 1];
  const surname = la === lb || n.includes(lb) || a.join('-').endsWith(lb) || n.join('-').endsWith(lb);
  if (!surname) return false;
  return b.every(t => a.includes(t) || n.includes(t) || t === lb);
}
/** kicker-Vereinsslug zu unserem Vereinsnamen: feste Zuordnung (db/seed/kicker-clubs.json), Rückfall Namensvergleich. */
export const clubSlugOf = ourClub => clubSlugs[ourClub] || null;
export function clubMatches(kTeamSlug, ourClub) {
  const t = String(kTeamSlug || '').toLowerCase(); if (!t || !ourClub) return false;
  const fixed = clubSlugOf(ourClub); if (fixed) return t === fixed;
  const c = fold(slugify(ourClub)); return fold(t).includes(c);
}
const teamOfHref = href => (String(href).split('/spieler/')[1] || '').split('/').slice(1).join('/');
const slugOfHref = href => { const m = String(href).match(/kicker\.\w+\/([^/]+)\/spieler\//) || String(href).match(/^\/([^/]+)\/spieler\//); return m ? m[1] : ''; };

/* ---------- Parser ---------- */
/** Aufstellungsseite eines Spiels: Startelf (mit Position aus den Formationszeilen), Reservebank, Wechsel, Tore/Vorlagen, Karten. */
export function parseMatchPage(html) {
  const $ = cheerio.load(html);
  const player = a => ({ slug: slugOfHref($(a).attr('href')), name: $(a).text().trim(), team: teamOfHref($(a).attr('href')).split('/').pop() });
  const teams = []; const starters = []; const bench = [];
  $('.kick__lineup__teamrow').each((i, row) => {
    const teamName = $(row).find('.kick__lineup__teamrow__teamname').text().trim();
    // Formationszeilen "Torwart - Abwehr - Mittelfeld [- Mittelfeld] - Sturm": daraus die kicker-Position je Spieler (Ziff. 5.2: Spielbericht)
    const groups = [[]]; $(row).find('p').first().contents().each((_, node) => { if (node.type === 'text') { if (node.data.includes('-')) groups.push([]); } else if (node.name === 'a' && /\/spieler\//.test($(node).attr('href') || '')) groups[groups.length - 1].push(player(node)); });
    const g = groups.filter(x => x.length); const posOf = gi => g.length <= 1 ? null : gi === 0 ? 'T' : gi === g.length - 1 ? 'S' : gi === 1 ? 'V' : 'M';
    const links = []; g.forEach((grp, gi) => grp.forEach(pl => links.push({ ...pl, pos: posOf(gi) })));
    teams.push({ name: teamName, slug: links[0]?.team || '', formation: g.map(x => x.length).slice(1).join('-') }); links.forEach(p => starters.push({ ...p, teamIndex: i }));
  });
  // Reservebank: "<h4>Reservebank</h4>" gefolgt von der Spielerliste (je Team)
  $('h4').each((_, h) => { if (!/Reservebank/i.test($(h).text())) return; $(h).next().find('a[href*="/spieler/"]').each((__, a) => bench.push(player(a))); });
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
  return { teams, starters, bench, events };
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
/** Pro kicker-Spieler {start, assist, tore, karten, kpos, bench}. start: 1 Startelf, 2 eingewechselt, 0 nur Bank. Karten: Gelb 1, Gelb-Rot 2, Rot 3, Rot nach Gelb 4. */
export function matchStats(parsed, opts = {}) {
  const stats = {}; const get = p => { if (!p || !p.slug) return null; return stats[p.slug] ||= { slug: p.slug, name: p.name, team: p.team, start: 0, assist: 0, tore: 0, karten: 0, kpos: null, bench: false, notes: [] }; };
  parsed.starters.forEach(p => { const s = get(p); s.start = 1; s.kpos = p.pos || null; });
  (parsed.bench || []).forEach(p => { const s = get(p); if (s.start === 0) s.bench = true; });
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

/* ---------- Zuordnung kicker-Spieler → RLB-Spieler ---------- */
let colReady = false;
export async function ensureColumns() { if (colReady) return; await q('alter table players add column if not exists kicker_slug text'); colReady = true; }

/** Ähnlichkeit für Hinweise ("meinten Sie …"): Levenshtein auf dem gefalteten Nachnamen. */
function lev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
const surnameOf = name => { const t = stripInitials(tokens(name)); return t[t.length - 1] || ''; };

/**
 * Ordnet einen kicker-Spieler einem RLB-Spieler zu. Reihenfolge: gespeicherter kicker_slug → Namensabgleich (nur im selben Verein).
 * Bei mehreren Treffern entscheidet die Position (kicker-Position muss zu Grund-/Zusatzposition passen); bleibt es mehrdeutig, wird nicht zugeordnet.
 */
export function resolveKickerPlayer(kp, candidates, log) {
  const sameClub = candidates.filter(p => clubMatches(kp.team, p.club));
  const bySlug = sameClub.filter(p => p.kicker_slug && p.kicker_slug === kp.slug); if (bySlug.length === 1) return { player: bySlug[0], via: 'slug' };
  let hits = sameClub.filter(p => !p.kicker_slug && playerMatches(kp.slug, kp.name, p.name));
  if (hits.length > 1 && kp.kpos) { const byPos = hits.filter(p => [p.base_pos, ...(p.extra_pos || [])].includes(kp.kpos)); if (byPos.length === 1) hits = byPos; }
  if (hits.length === 1) return { player: hits[0], via: 'name' };
  if (hits.length > 1 && log) log.push(`mehrdeutig: ${kp.name} (${kp.team}) passt auf ${hits.map(h => h.name).join(', ')} – nicht zugeordnet, bitte kicker-Namen im Kader festlegen`);
  return null;
}

/* ---------- Import in die Datenbank ---------- */
/**
 * Importiert einen Spieltag aus eingespielten Quelltexten. pages: {matches: [html…], elf: html|null}.
 * Schreibt results (start, assist, tore, karten, tdr, kpos), rounds.tdr/sdt, Positionserwerb, Spielerpool, kicker_slug.
 * Gesperrte Zeilen (locked) werden nicht überschrieben. Liefert Protokoll und Vollständigkeitsbericht (coverage).
 */
export async function importPages(round, b, pages, opts = {}) {
  await ensureColumns();
  const log = []; const errors = [];
  const lus = await q('select l.*, m.name as manager_name from lineups l join managers m on m.id=l.manager_id where round_id=$1', [round.id]);
  const lineupPlayers = []; lus.forEach(l => Object.keys(l.entries || {}).forEach(pid => { const p = b.players[pid]; if (p) lineupPlayers.push({ ...p, manager_id: l.manager_id, manager_name: l.manager_name, lineup_pos: l.entries[pid].pos }); }));
  const active = (b.playersArr || []).filter(p => p.status === 'active');
  const perPlayer = {}; const onPage = {}; // pid -> {status, kicker}
  const importedTeams = []; const pageNames = {}; // teamSlug -> [{slug,name}] aller auf der Seite genannten Spieler
  const allStarters = []; const matches = [];
  const fixSlug = async (p, slug, via) => { if (via === 'name' && !p.kicker_slug) { await q('update players set kicker_slug=$1 where id=$2 and kicker_slug is null', [slug, p.id]); p.kicker_slug = slug; const bp = b.players[p.id]; if (bp) bp.kicker_slug = slug; } };
  // 1) Spiele
  for (const html of pages.matches || []) {
    let parsed; try { parsed = parseMatchPage(html); if (!parsed.starters.length) throw new Error('keine Aufstellung im Quelltext'); } catch (e) { errors.push(`Seite nicht lesbar: ${e.message}`); continue; }
    const paarung = parsed.teams.map(t => t.name).join(' – ');
    if (parsed.teams.some(t => importedTeams.includes(t.slug))) { log.push(`${paarung}: doppelt eingespielt, übersprungen`); continue; }
    if (parsed.starters.length !== 22) errors.push(`${paarung}: ${parsed.starters.length} Startelf-Spieler statt 22 – Seite unvollständig?`);
    const stats = matchStats(parsed, opts); parsed.teams.forEach(t => importedTeams.push(t.slug));
    matches.push({ paarung, teams: parsed.teams.map(t => t.slug), n: Object.keys(stats).length });
    Object.values(stats).forEach(s => (pageNames[s.team] ||= []).push(s));
    await upsertPool(Object.values(stats), b, round.matchday);
    allStarters.push(...Object.values(stats).filter(s => s.start === 1 && s.kpos).map(s => ({ ...s, formation: (parsed.teams.find(t => t.slug === s.team) || {}).formation })));
    const seen = {}; let n = 0;
    for (const s of Object.values(stats)) {
      const r = resolveKickerPlayer(s, lineupPlayers, log); if (!r) continue; const p = r.player;
      if (seen[p.id]) { errors.push(`${p.name}: zwei kicker-Spieler passen (${seen[p.id]}, ${s.name}) – ${seen[p.id]} übernommen, bitte kicker-Namen im Kader festlegen`); continue; }
      seen[p.id] = s.name; await fixSlug(p, s.slug, r.via);
      if (s.start > 0) { n++; perPlayer[p.id] = { start: s.start, assist: s.assist, tore: s.tore, karten: s.karten, kpos: s.kpos, notes: s.notes }; }
      onPage[p.id] = { status: s.start === 1 ? 'startelf' : s.start === 2 ? 'eingewechselt' : 'bank', kicker: s.name };
    }
    log.push(`${paarung}: ${Object.keys(stats).length} Spieler auf der Seite, ${n} eingesetzte in RLB-Aufstellungen`);
  }
  // 2) Positionserwerb (Ziff. 5.2) für alle aktiven RLB-Spieler, auch Ersatzbank
  log.push(...await acquirePositions(allStarters, b, round));
  // 3) Elf des Tages
  let elf = null; const tdrPids = new Set(); const tdrNames = []; let sdtPid = null;
  if (pages.elf) { try { elf = parseElfDesTages(pages.elf); if (!elf.elf.length) throw new Error('keine Elf im Quelltext'); } catch (e) { errors.push('Elf des Tages: ' + e.message); elf = null; } }
  if (elf) { for (const kp of elf.elf) { tdrNames.push(kp.name); const r = resolveKickerPlayer(kp, lineupPlayers, log); if (r) { tdrPids.add(r.player.id); await fixSlug(r.player, kp.slug, r.via); } }
    if (elf.sdt) { const r = resolveKickerPlayer(elf.sdt, lineupPlayers, log); if (r) sdtPid = r.player.id; }
    log.push(`Elf des Tages: ${elf.elf.length} Spieler, ${tdrPids.size} in RLB-Aufstellungen${elf.sdt ? ', Spieler des Tages ' + elf.sdt.name + (sdtPid ? ' (+1 TdR)' : '') : ''}`); }
  // 4) Vollständigkeitsbericht: jeder aufgestellte Spieler bekommt einen Status
  const coverage = [];
  for (const p of lineupPlayers) {
    const team = clubSlugOf(p.club); const played = team && importedTeams.includes(team);
    let status, hint = '';
    if (!team) { status = 'verein_unbekannt'; hint = `Verein «${p.club}» hat keine kicker-Zuordnung`; }
    else if (!played) status = 'spiel_fehlt';
    else if (onPage[p.id]) status = onPage[p.id].status;
    else { const sn = surnameOf(p.name); const near = (pageNames[team] || []).map(s => ({ s, d: lev(sn, surnameOf(s.name)) })).filter(x => x.d <= 2).sort((a, b2) => a.d - b2.d)[0];
      if (near) { status = 'nicht_gefunden'; hint = `ähnlicher Name auf der Seite: ${near.s.name} (${near.s.slug}) – Namensabgleich prüfen, ggf. kicker-Kennung im Kader setzen`; }
      else { status = 'nicht_im_kader'; hint = 'steht weder in Startelf noch auf der Bank (nicht im Spieltagskader)'; } }
    coverage.push({ pid: p.id, name: p.name, manager: p.manager_name, club: p.club, pos: p.lineup_pos, status, hint, tdr: tdrPids.has(p.id) ? 1 : 0, kicker: onPage[p.id]?.kicker || null, ...(perPlayer[p.id] || {}) });
  }
  const counts = {}; coverage.forEach(c => counts[c.status] = (counts[c.status] || 0) + 1);
  coverage.filter(c => c.status === 'nicht_gefunden').forEach(c => errors.push(`${c.manager} ${c.name} (${c.club}): ${c.hint}`));
  // 5) Schreiben: nur Spieler, deren Spiel eingespielt ist; TdR nur, wenn die Elf des Tages dabei ist
  let written = 0, skipped = 0;
  for (const c of coverage) {
    const hasGame = ['startelf', 'eingewechselt', 'bank', 'nicht_gefunden', 'nicht_im_kader'].includes(c.status);
    const tdr = c.tdr + (opts.sdtBonus !== false && sdtPid === c.pid ? 1 : 0);
    if (!hasGame) { if (elf) { const r = await one(`insert into results(round_id,player_id,tdr,source) values($1,$2,$3,'kicker') on conflict(round_id,player_id) do update set tdr=excluded.tdr where results.locked=false returning player_id`, [round.id, c.pid, tdr]); if (r) written++; else skipped++; } continue; }
    const s = perPlayer[c.pid] || { start: 0, assist: 0, tore: 0, karten: 0, kpos: null, notes: [] };
    const r = await one(`insert into results(round_id,player_id,start,assist,tore,karten,tdr,kpos,source) values($1,$2,$3,$4,$5,$6,$7,$8,'kicker')
      on conflict(round_id,player_id) do update set start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten, tdr=case when $9 then excluded.tdr else results.tdr end, kpos=excluded.kpos, source='kicker' where results.locked=false returning player_id`, [round.id, c.pid, s.start, s.assist, s.tore, s.karten, tdr, s.kpos, !!elf]);
    if (r) written++; else skipped++;
    if (s.notes.length) log.push(`${c.name}: ${s.notes.join('; ')}`);
  }
  if (round.type !== 'nachtrag' && elf && tdrNames.length) await q('update rounds set tdr=$1, sdt=coalesce($2, sdt) where id=$3', [tdrNames, elf.sdt ? elf.sdt.name : null, round.id]);
  log.push(`${written} Spielerzeilen geschrieben${skipped ? `, ${skipped} gesperrt (vom Admin geändert)` : ''}`);
  const summary = { at: new Date().toISOString(), games: matches.length, elf: !!elf, counts, errors, log, coverage };
  await setSetting(`kicker_import_${round.id}`, summary);
  return summary;
}

/** Spielerpool pflegen: jeder Spieler, der laut kicker im Spieltagskader stand, mit Verein und kicker-Position. */
export async function upsertPool(stats, b, matchday) {
  const seen = new Set(); const rows = [];
  for (const s of stats) {
    if (!s.slug || seen.has(s.slug)) continue; seen.add(s.slug);
    const club = (b.clubs || []).map(c => c.id).find(id => clubMatches(s.team, id)) || null;
    const played = s.start === 1 && s.kpos ? [s.kpos] : [];
    rows.push([s.slug, s.name, club, s.kpos || null, s.start > 0 ? matchday || null : null, played]);
  }
  const cols = ['slug', 'name', 'club', 'pos', 'last_matchday', 'played_pos'];
  for (let i = 0; i < rows.length; i += 150) {
    const part = rows.slice(i, i + 150); const params = [];
    const vals = part.map((r, ri) => { for (const v of r) params.push(v); const b0 = ri * cols.length; return `($${b0 + 1},$${b0 + 2},$${b0 + 3},$${b0 + 4},$${b0 + 5},1,$${b0 + 6})`; }).join(',');
    await q(`insert into bl_players(slug,name,club,pos,last_matchday,games,played_pos) values ${vals}
      on conflict(slug) do update set name=excluded.name, club=coalesce(excluded.club, bl_players.club), pos=coalesce(excluded.pos, bl_players.pos), last_matchday=greatest(bl_players.last_matchday, excluded.last_matchday), games=case when excluded.last_matchday > coalesce(bl_players.last_matchday, 0) then bl_players.games+1 else bl_players.games end, played_pos=coalesce((select array_agg(distinct x) from unnest(bl_players.played_pos || excluded.played_pos) x), '{}'), updated_at=now()`, params);
  }
}

/**
 * Positionserwerb (Ziff. 5.2): jeder RLB-Spieler (Stamm oder Ersatzbank), der laut kicker-Spielbericht in der Startaufstellung
 * auf einer anderen Position stand als seiner Grundposition, ist ab der Folgerunde auf beiden Positionen einsetzbar.
 */
export async function acquirePositions(starters, b, round) {
  const log = []; const active = (b.playersArr || []).filter(p => p.status === 'active');
  for (const s of starters) {
    if (!s.kpos || s.kpos === 'T') continue;
    const r = resolveKickerPlayer(s, active, null); if (!r) continue; const p = r.player;
    if (s.kpos === p.base_pos || (p.extra_pos || []).includes(s.kpos)) continue;
    // Ziff. 5.2: "Im Zweifelsfall wird kein Positionserwerb gewaehrt." Zweifelsfall: Aussenverteidiger in einer Dreierkette als M gefuehrt.
    const doubt = s.formation && /^3-/.test(s.formation) && p.base_pos === 'V' && s.kpos === 'M';
    if (doubt) { log.push(`${p.name}: Startelf als M in Formation ${s.formation} – Zweifelsfall (Aussenverteidiger in Dreierkette), Zusatzposition M nicht automatisch gewährt (Ziff. 5.2); bei Bedarf im Kader von Hand +M`); continue; }
    await q('update players set extra_pos = array_append(extra_pos, $1) where id=$2 and not ($1 = any(extra_pos))', [s.kpos, p.id]); p.extra_pos = [...(p.extra_pos || []), s.kpos]; if (b.players[p.id]) b.players[p.id].extra_pos = p.extra_pos;
    const ex = await q("select 1 from transfers where type='position' and manager_id=$1 and player_name=$2 and note like $3", [p.manager_id, p.name, `Zusatzposition ${s.kpos}%`]);
    if (!ex.length) await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'position',$3,0,$4)", [round.id, p.manager_id, p.name, `Zusatzposition ${s.kpos} erworben (kicker-Startelf ${round.label}, Ziff. 5.2) – ab Folgerunde ${p.base_pos}/${[...new Set(p.extra_pos)].join('/')}`]);
    log.push(`${p.name}: Zusatzposition ${s.kpos} (Startelf laut kicker, ${round.label})`);
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

/** Abruf einer kicker-Seite (nur noch für den Kader-Abgleich; Spieltagsdaten kommen aus eingespielten Quelltexten). */
export async function fetchHtml(url) {
  const r = await fetch(url, { headers: { 'user-agent': process.env.KICKER_UA || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36', accept: 'text/html,application/xhtml+xml', 'accept-language': 'de-CH,de;q=0.9' }, cache: 'no-store', redirect: 'follow' });
  if (!r.ok) throw new Error(`kicker ${url}: HTTP ${r.status}${[403, 429, 503].includes(r.status) ? ' – kicker lässt Abrufe von Servern nicht zu' : ''}`);
  return r.text();
}
