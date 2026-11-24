/* kicker-Import (Regelwerk Ziff. 8: Basis für die Kategorienbewertung ist die Publikation des kicker).
   Grundlage sind ausschliesslich die Quelltexte der kicker-Seiten, die der Admin einspielt (Eingang vom Handy oder
   Einfügen im Browser): pro Spiel die Seite ".../aufstellung" (Startelf, Reservebank, Wechsel, Tore mit Vorbereitung,
   Karten), pro Spieltag die Seite "Elf des Tages" (Team der Runde, Spieler des Tages).
   Ein direkter Abruf von kicker ist von Vercel aus gesperrt und wird hier nicht mehr versucht. */
import { q, one, setSetting, ensureSchema, audit } from './db';
import { parseElfDesTages, parseMatchPage, matchStats } from './kicker-parse.js';
export { parseElfDesTages, parseMatchPage, matchStats };

import { slugify, playerMatches, clubSlugOf, clubMatches, resolveKickerPlayer, surnameOf, lev } from './kicker-match.js';
export { slugify, playerMatches, clubSlugOf, clubMatches, resolveKickerPlayer };

/* ---------- Zuordnung kicker-Spieler → RLB-Spieler ---------- */
let colReady = false;
export async function ensureColumns() { if (colReady) return; await q('alter table players add column if not exists kicker_slug text'); await q("alter table players add column if not exists extra_pos_from jsonb not null default '{}'"); colReady = true; }
/** Nummer der Runde nach der gegebenen (Positionserwerb gilt ab der Folgerunde, Ziff. 5.2). */
export async function nextRoundNumber(number) { const r = await one('select min(number) as n from rounds where number > $1', [number]); return (r && r.n) || number + 10; }

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
  const active = (b.playersArr || []).filter(p => (p.status === 'active' || p.valid_to != null) && (p.valid_from ?? 0) <= round.number && (p.valid_to == null || p.valid_to >= round.number));
  const perPlayer = {}; const onPage = {}; // pid -> {status, kicker}
  const importedTeams = []; const pageNames = {}; // teamSlug -> [{slug,name}] aller auf der Seite genannten Spieler
  const allStarters = []; const matches = []; const benchStats = {};
  // Vereine, die in dieser Runde spielen (regulär: alle Spiele des Spieltags ohne abgespaltene; Nachtrag: nur das eine Spiel)
  let roundClubs = null; if ((round.match_ids || []).length) { const ms = await q('select team1, team2 from matches where id = any($1)', [round.match_ids]); if (ms.length) { roundClubs = new Set(); ms.forEach(m => { const c1 = b.teamToClub?.[m.team1], c2 = b.teamToClub?.[m.team2]; if (c1) roundClubs.add(c1); if (c2) roundClubs.add(c2); }); } }
  // Vereinswechsel innerhalb der Bundesliga: die kicker-Kennung passt, der Verein nicht mehr. Frühere Runden behalten den alten Verein (results.club).
  const moved = async (p, s) => { const neu = (b.clubs || []).map(c => c.id).find(id => clubMatches(s.team, id)); if (!neu || neu === p.club) return; const alt = p.club;
    await q('update results set club=$2 where player_id=$1 and club is null', [p.id, alt]); await q('update players set club=$2 where id=$1', [p.id, neu]);
    for (const x of [p, b.players[p.id], ...lineupPlayers.filter(l => l.id === p.id)]) if (x) x.club = neu;
    log.push(`Vereinswechsel: ${p.name} ${alt} → ${neu} (laut kicker-Spielbericht); frühere Runden zählen weiter mit ${alt}`); await audit(opts.userId || null, 'club_change', { pid: p.id, von: alt, nach: neu, quelle: 'kicker' }); };
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
    await upsertPool(Object.values(stats), b, round.matchday, round.deadline || new Date());   // Spieltagskader = Bundesliga-Kader
    await upsertStats(Object.values(stats), b, round.matchday);
    allStarters.push(...Object.values(stats).filter(s => s.start === 1 && s.kpos).map(s => ({ ...s, formation: (parsed.teams.find(t => t.slug === s.team) || {}).formation })));
    const seen = {}; let n = 0;
    // Zwei kicker-Spieler, die auf denselben noch nicht zugeordneten RLB-Spieler passen (Namensvettern im selben Verein): keinen binden, melden
    const nameHits = {}; for (const s of Object.values(stats)) { const r = resolveKickerPlayer(s, active, null); if (r && r.via === 'name') (nameHits[r.player.id] ||= []).push(s); }
    const doppelt = new Set(Object.keys(nameHits).filter(pid => nameHits[pid].length > 1));
    for (const pid of doppelt) errors.push(`${b.players[pid]?.name || pid}: zwei kicker-Spieler passen (${nameHits[pid].map(s => `${s.name}, ${s.slug}`).join(' / ')}) – nicht zugeordnet, bitte die kicker-Kennung im Kader setzen`);
    // Werte der übrigen Kaderspieler (Ersatzbank der Manager): für die Potential-Tabelle; sie zählen nicht in der Wertung
    const lineupIds = new Set(lineupPlayers.map(p => p.id));
    for (const s of Object.values(stats)) { if (s.start === 0) continue; const r = resolveKickerPlayer(s, active.filter(p => !lineupIds.has(p.id)), null); if (!r || doppelt.has(r.player.id)) continue;
      if (r.clubChanged) await moved(r.player, s);
      await fixSlug(r.player, s.slug, r.via); benchStats[r.player.id] = { start: s.start, assist: s.assist, tore: s.tore, karten: s.karten, kpos: s.kpos }; }
    for (const s of Object.values(stats)) {
      const r = resolveKickerPlayer(s, lineupPlayers, log); if (!r || doppelt.has(r.player.id)) continue; const p = r.player;
      if (r.clubChanged) await moved(p, s);
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
  if (pages.elf) { try { elf = parseElfDesTages(pages.elf);
      if (!elf.elf.length) throw new Error(/liegt noch nicht vor|noch nicht ver(ö|oe)ffentlicht/i.test(pages.elf) ? 'auf kicker noch nicht veröffentlicht – Seite später erneut senden' : `keine Elf im Quelltext (${elf.diag.playerLinks} Spielerlinks auf der Seite, Titel «${elf.diag.title}») – Seite unter «Eingang» ansehen und melden`);
      if (elf.elf.length < 11) log.push(`Elf des Tages: nur ${elf.elf.length} Spieler erkannt (${elf.diag.how})`); } catch (e) { errors.push('Elf des Tages: ' + e.message); elf = null; } }
  if (elf) { for (const kp of elf.elf) { tdrNames.push(kp.name); const r = resolveKickerPlayer(kp, lineupPlayers, log); if (r) { tdrPids.add(r.player.id); if (kp.team) await fixSlug(r.player, kp.slug, r.via); } }   // Kennung nur von echten kicker-Links übernehmen
    if (elf.sdt) { const r = resolveKickerPlayer(elf.sdt, lineupPlayers, log); if (r) sdtPid = r.player.id; }
    log.push(`Elf des Tages: ${elf.elf.length} Spieler, ${tdrPids.size} in RLB-Aufstellungen${elf.sdt ? ', Spieler des Tages ' + elf.sdt.name + (sdtPid ? ' (+1 TdR)' : '') : ''}`); }
  // 4) Vollständigkeitsbericht: jeder aufgestellte Spieler bekommt einen Status
  const coverage = [];
  for (const p of lineupPlayers) {
    const team = clubSlugOf(p.club); const played = team && importedTeams.includes(team);
    let status, hint = '';
    if (!team) { status = 'verein_unbekannt'; hint = `Verein «${p.club}» hat keine kicker-Zuordnung`; }
    else if (!played && roundClubs && !roundClubs.has(p.club)) status = 'spielfrei';   // sein Verein spielt in dieser Runde nicht (verlegtes Spiel bzw. Nachtragsrunde)
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
  for (const [pid, s] of Object.entries(benchStats)) { const tdr = elf && elf.elf.some(kp => { const r = resolveKickerPlayer(kp, [b.players[pid]].filter(Boolean), null); return r && r.player.id === pid; }) ? 1 : 0;
    await q(`insert into results(round_id,player_id,start,assist,tore,karten,tdr,kpos,source) values($1,$2,$3,$4,$5,$6,$7,$8,'kicker')
      on conflict(round_id,player_id) do update set start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten, tdr=case when $9 then excluded.tdr else results.tdr end, kpos=excluded.kpos, source='kicker' where results.locked=false`, [round.id, pid, s.start, s.assist, s.tore, s.karten, tdr, s.kpos, !!elf]); }
  if (Object.keys(benchStats).length) log.push(`${Object.keys(benchStats).length} nicht aufgestellte Kaderspieler mit Werten gespeichert (für die Potential-Tabelle)`);
  if (round.type !== 'nachtrag' && elf && tdrNames.length) await q('update rounds set tdr=$1, sdt=coalesce($2, sdt) where id=$3', [tdrNames, elf.sdt ? elf.sdt.name : null, round.id]);
  // Verein der Runde festhalten (nur wo noch keiner steht)
  await q('update results r set club=p.club from players p where p.id=r.player_id and r.round_id=$1 and r.club is null', [round.id]);
  log.push(`${written} Spielerzeilen geschrieben${skipped ? `, ${skipped} gesperrt (vom Admin geändert)` : ''}`);
  const summary = { at: new Date().toISOString(), games: matches.length, soll: (round.match_ids || []).length || null, elf: !!elf, counts, errors, log, coverage };
  await setSetting(`kicker_import_${round.id}`, summary);
  return summary;
}

/** Spieltag einer Aufstellungsseite verbindlich aus der Paarung: kicker-Teams -> unsere Vereine -> Spielplan (matches).
    Zuverlaessiger als Zahlen aus dem Seitentext (Navigation nennt auch andere Spieltage). null, wenn die Paarung nicht im Spielplan steht. */
export async function matchdayOfPage(html, b) {
  let parsed; try { parsed = parseMatchPage(html); } catch (e) { return null; }
  if (!parsed.teams || parsed.teams.length !== 2) return null;
  b = b || await (await import('./data')).base();
  const clubIds = parsed.teams.map(t => (b.clubs || []).map(c => c.id).find(id => clubMatches(t.slug, id)) || null); if (clubIds.some(x => !x)) return null;
  const oldb = id => Number(Object.keys(b.teamToClub || {}).find(k => b.teamToClub[k] === id)) || null; const [t1, t2] = clubIds.map(oldb); if (!t1 || !t2) return null;
  const m = await one('select matchday, id from matches where (team1=$1 and team2=$2) or (team1=$2 and team2=$1) order by case when team1=$1 then 0 else 1 end limit 1', [t1, t2]);
  return m ? { matchday: m.matchday, matchId: m.id, paarung: parsed.teams.map(t => t.name).join(' – ') } : null;
}

/** Eingang eines Spieltags importieren (Handy-Skript, API und Admin-Knopf nehmen denselben Weg). */
export async function importInbox(matchday, opts = {}) {
  const Inbox = await import('./kicker-inbox'); const D = await import('./data'); await ensureSchema();
  const rounds = await q("select * from rounds where matchday=$1 order by (type='regulaer') desc, number", [matchday]);
  const regular = rounds.find(r => r.type === 'regulaer'); if (!regular) throw new Error(`Keine Runde für Spieltag ${matchday}`);
  const pg = await Inbox.pages(matchday); if (!pg.matches.length && !pg.elf) throw new Error(`Eingang für Spieltag ${matchday} ist leer`);
  const b = await D.base();
  // Ein als Nachtragsrunde abgespaltenes Spiel gehört in diese Runde, mit der dann gültigen Aufstellung (Ziff. 5.1 und 8), nicht in die reguläre Runde des Spieltags
  const nach = rounds.filter(r => r.type === 'nachtrag' && (r.match_ids || []).length); const per = new Map(rounds.map(r => [r.id, []]));
  for (const html of pg.matches) { let ziel = regular;
    if (nach.length) { const mp = await matchdayOfPage(html, b).catch(() => null); const n = mp && nach.find(r => (r.match_ids || []).map(Number).includes(Number(mp.matchId))); if (n) ziel = n; }
    per.get(ziel.id).push(html); }
  const want = opts.roundId ? rounds.find(r => r.id === Number(opts.roundId)) : null; let main = null;
  for (const round of rounds) { const list = per.get(round.id) || []; const reg = round.type === 'regulaer';
    if (want ? round.id !== want.id : round.status === 'final') continue;   // abgeschlossene Runden nur auf ausdrücklichen Wunsch (Rundenseite)
    if (!reg && !list.length) continue;
    await D.ensureLineups(round, b);
    if (opts.unlock) await q('update results set locked=false where round_id=$1', [round.id]);
    const r = await importPages(round, b, { matches: list, elf: reg ? (pg.elf || null) : null }, { userId: opts.userId || null });
    try { await q('insert into audit(user_id,action,detail) values($1,$2,$3)', [opts.userId || null, 'kicker_import', JSON.stringify({ roundId: round.id, games: r.games, elf: r.elf, counts: r.counts, auto: !!opts.auto })]); } catch (e) { /* best effort */ }
    if (!main || round.id === (want || regular).id) main = { ...r, round };
  }
  if (!main) throw new Error(`Spieltag ${matchday} ist abgeschlossen – nichts importiert. Falls gewollt: Runde wieder öffnen, dann «Eingang erneut importieren».`);
  return main;
}
/** Kurzfassung eines Importberichts fuer Meldungen. */
export function importSummary(r) { const c = r.counts || {}; return [`${r.games} Spiele${r.elf ? ' + Elf des Tages' : ''}`, `Startelf ${c.startelf || 0}`, `eingewechselt ${c.eingewechselt || 0}`, `Bank ${c.bank || 0}`, `nicht im Kader ${c.nicht_im_kader || 0}`, `Name prüfen ${c.nicht_gefunden || 0}`, `Spiel fehlt ${c.spiel_fehlt || 0}`]; }

/** Spielerpool pflegen: jeder Spieler, der laut kicker im Spieltagskader stand, mit Verein und kicker-Position. */
/** Spielerpool pflegen. playedAt (Zeitpunkt des Spieltags) gesetzt: jeder Spieler auf der Aufstellungsseite (Startelf oder
    Bank) steht im Bundesliga-Kader – so bleibt der Pool aktuell, auch wenn der Kader-Abgleich mit kicker ausfällt. Ein
    späterer Abgang (left_at nach dem Spieltag) bleibt bestehen, damit ein nachträglicher Import ihn nicht zurückholt. */
/** Werte aller Spieler einer Spielseite je Spieltag festhalten (auch der freien): Grundlage für die Saisonwerte im Transfermarkt. */
export async function upsertStats(stats, b, matchday) {
  if (!matchday) return 0; await ensureSchema(); const rows = []; const seen = new Set();
  for (const s of stats) { if (!s.slug || seen.has(s.slug)) continue; seen.add(s.slug);
    rows.push([s.slug, matchday, (b.clubs || []).map(c => c.id).find(id => clubMatches(s.team, id)) || null, Number(s.start) || 0, Number(s.assist) || 0, Number(s.tore) || 0, Number(s.karten) || 0]); }
  for (let i = 0; i < rows.length; i += 150) { const part = rows.slice(i, i + 150); const params = [];
    const vals = part.map((r, ri) => { for (const v of r) params.push(v); const o = ri * 7; return '($' + (o + 1) + ',$' + (o + 2) + ',$' + (o + 3) + ',$' + (o + 4) + ',$' + (o + 5) + ',$' + (o + 6) + ',$' + (o + 7) + ')'; }).join(',');
    await q('insert into bl_stats(slug,matchday,club,start,assist,tore,karten) values ' + vals + ' on conflict(slug,matchday) do update set club=excluded.club, start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten', params); }
  return rows.length;
}

export async function upsertPool(stats, b, matchday, playedAt = null) {
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
    const t = playedAt ? new Date(playedAt) : null; params.push(t); const pt = `$${params.length}::timestamptz`;
    const vals2 = part.map((r, ri) => { const b0 = ri * cols.length; return `($${b0 + 1},$${b0 + 2},$${b0 + 3},$${b0 + 4},$${b0 + 5},1,$${b0 + 6},${pt} is not null,${pt})`; }).join(',');
    await q(`insert into bl_players(slug,name,club,pos,last_matchday,games,played_pos,in_squad,seen_at) values ${vals2}
      on conflict(slug) do update set name=excluded.name, club=coalesce(excluded.club, bl_players.club), pos=coalesce(excluded.pos, bl_players.pos), last_matchday=greatest(bl_players.last_matchday, excluded.last_matchday), games=case when excluded.last_matchday > coalesce(bl_players.last_matchday, 0) then bl_players.games+1 else bl_players.games end, played_pos=coalesce((select array_agg(distinct x) from unnest(bl_players.played_pos || excluded.played_pos) x), '{}'), updated_at=now(),
        in_squad=case when ${pt} is not null and (bl_players.left_at is null or bl_players.left_at < ${pt}) then true else bl_players.in_squad end,
        seen_at=case when ${pt} is not null and (bl_players.seen_at is null or bl_players.seen_at < ${pt}) then ${pt} else bl_players.seen_at end`, params);
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
    if ((p.extra_pos_denied || []).includes(s.kpos)) { log.push(`${p.name}: Startelf als ${s.kpos} – Zusatzposition wurde von den Admins nicht gewährt (im Kader von Hand entfernt), bleibt so`); continue; }
    // Ziff. 5.2: "Im Zweifelsfall wird kein Positionserwerb gewaehrt." Zweifelsfall: Aussenverteidiger in einer Dreierkette als M gefuehrt.
    const doubt = s.formation && /^3-/.test(s.formation) && p.base_pos === 'V' && s.kpos === 'M';
    if (doubt) { log.push(`${p.name}: Startelf als M in Formation ${s.formation} – Zweifelsfall (Aussenverteidiger in Dreierkette), Zusatzposition M nicht automatisch gewährt (Ziff. 5.2); bei Bedarf im Kader von Hand +M`); continue; }
    const ab = await nextRoundNumber(round.number);
    await q('update players set extra_pos = array_append(extra_pos, $1), extra_pos_from = coalesce(extra_pos_from, \'{}\'::jsonb) || jsonb_build_object($1::text, $3::int) where id=$2 and not ($1 = any(extra_pos))', [s.kpos, p.id, ab]);
    p.extra_pos = [...(p.extra_pos || []), s.kpos]; p.extra_pos_from = { ...(p.extra_pos_from || {}), [s.kpos]: ab }; if (b.players[p.id]) { b.players[p.id].extra_pos = p.extra_pos; b.players[p.id].extra_pos_from = p.extra_pos_from; }
    const ex = await q("select 1 from transfers where type='position' and manager_id=$1 and player_name=$2 and note like $3", [p.manager_id, p.name, `Zusatzposition ${s.kpos}%`]);
    if (!ex.length) await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'position',$3,0,$4)", [round.id, p.manager_id, p.name, `Zusatzposition ${s.kpos} erworben (kicker-Startelf ${round.label}, Ziff. 5.2) – ab Folgerunde ${p.base_pos}/${[...new Set(p.extra_pos)].join('/')}`]);
    log.push(`${p.name}: Zusatzposition ${s.kpos} (Startelf laut kicker, ${round.label}) – gilt ab Runde ${ab / 10}`);
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

/** Werte aller Kaderspieler aus einer gespeicherten Auswertung (db/seed/kicker-stats-st1-3.json: {matchday: {slug: {name, team, start, assist, tore, karten, kpos}}}).
    Schreibt nur Zeilen, die noch fehlen oder nicht gesperrt sind und nicht zu aufgestellten Spielern gehören (deren Werte stehen schon). */
export async function applyStatsSeed(seed, b) {
  await ensureColumns(); const log = []; const active = (b.playersArr || []).filter(p => p.status === 'active' || p.valid_to != null);
  for (const [md, players] of Object.entries(seed)) {
    const round = await one("select * from rounds where type='regulaer' and matchday=$1", [Number(md)]); if (!round) continue;
    const lus = await q('select entries from lineups where round_id=$1', [round.id]); const inLineup = new Set(lus.flatMap(l => Object.keys(l.entries || {})));
    let n = 0;
    for (const [slug, s] of Object.entries(players)) { if (!s.start) continue; const r = resolveKickerPlayer({ ...s, slug }, active.filter(p => !inLineup.has(p.id) && (p.valid_from ?? 0) <= round.number && (p.valid_to == null || p.valid_to >= round.number)), null); if (!r) continue;
      await q(`insert into results(round_id,player_id,start,assist,tore,karten,tdr,kpos,source) values($1,$2,$3,$4,$5,$6,0,$7,'kicker') on conflict(round_id,player_id) do update set start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten, kpos=excluded.kpos, source='kicker' where results.locked=false`, [round.id, r.player.id, s.start, s.assist, s.tore, s.karten, s.kpos || null]); n++; }
    log.push(`${round.label}: ${n} Bankspieler mit Werten`);
  }
  return log;
}
