/* OpenLigaDB-Sync: Spielplan, Anstosszeiten, Resultate der Bundesliga (api.openligadb.de). */
import { q, one, getSetting, setSetting } from './db';
import { DEADLINE_MIN } from './rules';
import { importRound } from './kicker';

const API = 'https://api.openligadb.de';
const season = () => process.env.SEASON || '2026';

async function getJson(path) {
  const r = await fetch(`${API}${path}`, { headers: { accept: 'application/json' }, cache: 'no-store' });
  if (!r.ok) throw new Error(`OpenLigaDB ${path}: HTTP ${r.status}`);
  return r.json();
}
/** Torschützen eines Spiels (ohne Eigentore); Team des Schützen = scoringTeamId (bei Eigentor der Gegner). */
const goalsOf = m => (m.goals || []).map(g => ({ name: g.goalGetterName, ownGoal: !!g.isOwnGoal, penalty: !!g.isPenalty, minute: g.matchMinute, teamId: g.scoringTeamId ?? null, scoringTeamId: g.scoringTeamId ?? null }));
const endResult = m => (m.matchResults || []).find(x => x.resultTypeID === 2) || (m.matchResults || []).slice(-1)[0] || null;

/** Vereine mit OpenLigaDB-IDs abgleichen (Kurzname-Zuordnung über settings.club_map oder Namensheuristik). */
export async function syncTeams() {
  const teams = await getJson(`/getavailableteams/bl1/${season()}`);
  const clubs = await q('select * from clubs');
  const map = (await getSetting('club_map')) || {};
  for (const t of teams) {
    let club = clubs.find(c => c.oldb_team_id === t.teamId) || clubs.find(c => map[c.id] === t.teamId);
    if (!club) { const n = s => String(s).toLowerCase().replace(/[^a-z]/g, ''); club = clubs.find(c => n(t.shortName).includes(n(c.id)) || n(t.teamName).includes(n(c.id))) || null; }
    if (club) await q('update clubs set oldb_team_id=$1, full_name=$2 where id=$3', [t.teamId, t.teamName, club.id]);
  }
  return teams;
}

/** Gesamten Spielplan laden, Runden 1..34 anlegen/aktualisieren, Deadlines setzen (90 Min. vor erstem Anpfiff). */
export async function syncSchedule() {
  const all = await getJson(`/getmatchdata/bl1/${season()}`);
  let n = 0;
  for (const m of all) {
    const md = m.group?.groupOrderID; if (!md) continue;
    const er = endResult(m);
    await q(`insert into matches(id, matchday, kickoff, team1, team2, finished, goals1, goals2, goals, updated_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,now())
      on conflict(id) do update set matchday=excluded.matchday, kickoff=excluded.kickoff, team1=excluded.team1, team2=excluded.team2, finished=excluded.finished, goals1=excluded.goals1, goals2=excluded.goals2, goals=excluded.goals, updated_at=now()`,
      [m.matchID, md, m.matchDateTimeUTC || null, m.team1?.teamId, m.team2?.teamId, !!m.matchIsFinished, er ? er.pointsTeam1 : null, er ? er.pointsTeam2 : null, JSON.stringify(goalsOf(m))]);
    n++;
  }
  // Runden für jeden Spieltag sicherstellen
  const mds = [...new Set(all.map(m => m.group?.groupOrderID).filter(Boolean))].sort((a, b) => a - b);
  for (const md of mds) {
    let r = await one("select * from rounds where type='regulaer' and matchday=$1", [md]);
    if (!r) { r = await one("insert into rounds(number, type, label, matchday) values($1,'regulaer',$2,$3) returning *", [md * 10, `Spieltag ${md}`, md]); }
    // Spiele ohne Nachtrag-Zuordnung gehören zur regulären Runde
    await q("update matches set round_id=$1 where matchday=$2 and (round_id is null or round_id=$1)", [r.id, md]);
    const ids = await q('select id from matches where round_id=$1', [r.id]);
    await q('update rounds set match_ids=$1 where id=$2', [ids.map(x => x.id), r.id]);
  }
  await refreshDeadlines();
  await setSetting('last_sync', { at: new Date().toISOString(), matches: n });
  return n;
}

/** Deadline = frühester Anpfiff der zugeordneten Spiele minus 90 Minuten (ausser manuell gesetzt). */
export async function refreshDeadlines() {
  await q(`update rounds r set deadline = sub.k - make_interval(mins => $1)
    from (select round_id, min(kickoff) as k from matches where kickoff is not null group by round_id) sub
    where sub.round_id = r.id and not r.deadline_manual and (r.deadline is distinct from sub.k - make_interval(mins => $1))`, [DEADLINE_MIN]);
}

/** Nur Resultate/Zeiten der laufenden und nächsten Spieltage aktualisieren (leichtgewichtig). */
export async function syncCurrent() {
  const rows = await q("select distinct matchday from matches where kickoff between now() - interval '5 days' and now() + interval '10 days'");
  const mds = rows.map(r => r.matchday); if (!mds.length) return 0;
  let n = 0;
  for (const md of mds) {
    const list = await getJson(`/getmatchdata/bl1/${season()}/${md}`);
    for (const m of list) { const er = endResult(m);
      await q('update matches set kickoff=$2, finished=$3, goals1=$4, goals2=$5, goals=$6, updated_at=now() where id=$1', [m.matchID, m.matchDateTimeUTC || null, !!m.matchIsFinished, er ? er.pointsTeam1 : null, er ? er.pointsTeam2 : null, JSON.stringify(goalsOf(m))]); n++; }
  }
  await refreshDeadlines();
  await importGoalsPending();
  await setSetting('last_sync_current', { at: new Date().toISOString(), matches: n });
  return n;
}

/** Tore für alle Runden importieren, deren Deadline vorbei und die noch nicht final sind. */
export async function importGoalsPending() {
  const rounds = await q("select * from rounds where status='open' and deadline is not null and deadline <= now()");
  if (!rounds.length) return;
  const players = {}; (await q('select * from players')).forEach(p => players[p.id] = p);
  const teamToClub = {}; (await q('select * from clubs where oldb_team_id is not null')).forEach(c => teamToClub[c.oldb_team_id] = c.id);
  for (const r of rounds) { try { await importGoals(r.id, players, teamToClub); } catch (e) { console.error('Tore-Import', r.label, e.message); } }
  // kicker-Import, sobald alle Spiele der Runde beendet sind (einmal automatisch; danach manuell über Admin)
  const b = { players, teamToClub };
  for (const r of rounds) {
    const st = await q('select count(*)::int as n, count(*) filter (where finished)::int as f, max(updated_at) as u from matches where round_id=$1', [r.id]);
    if (!st[0].n || st[0].f < st[0].n) continue;
    const done = await getSetting(`kicker_import_${r.id}`); if (done && done.auto) continue;
    try { const res = await importRound(r, b); await setSetting(`kicker_import_${r.id}`, { at: new Date().toISOString(), log: res.log, auto: true }); } catch (e) { console.error('kicker-Import', r.label, e.message); await setSetting(`kicker_import_${r.id}`, { at: new Date().toISOString(), log: ['Fehler: ' + e.message], auto: true }); }
  }
}

/** Sync auslösen, wenn der letzte länger als maxAgeMin zurückliegt (wird beim Seitenaufruf verwendet). */
export async function maybeSync(maxAgeMin = 60) {
  try {
    const last = await getSetting('last_sync');
    if (!last || Date.now() - new Date(last.at).getTime() > 24 * 3600e3) { await syncTeams(); await syncSchedule(); return 'full'; }
    const lc = await getSetting('last_sync_current');
    if (!lc || Date.now() - new Date(lc.at).getTime() > maxAgeMin * 60e3) { await syncCurrent(); return 'current'; }
  } catch (e) { console.error('Sync fehlgeschlagen', e.message); try { await importGoalsPending(); } catch {} return 'error: ' + e.message; }
  return 'skip';
}

/** Spiele, die deutlich später als der Rest ihres Spieltags stattfinden (Kandidaten für Nachtragsrunden, Ziff. 8). */
export async function postponedCandidates() {
  return q(`select m.*, r.label as round_label from matches m join rounds r on r.id=m.round_id
    where r.type='regulaer' and m.kickoff > (select min(kickoff) from matches x where x.matchday=m.matchday) + interval '5 days'
    order by m.kickoff`);
}

/* ---------- Torschützen-Import (Ziff. 8, Kategorie Tore) ---------- */
const normName = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/ß/g, 'ss').replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
/** Tokens eines Namens ohne Initialen ("D. Upamecano" -> [upamecano], "Luis Diaz" -> [luis, diaz]). */
const tokens = s => normName(s).split(' ').filter(t => t.length > 1);
/** Passt der OpenLigaDB-Name zu unserem Spielernamen? Nachname muss übereinstimmen; Vornamen/Initialen dürfen fehlen. */
export function nameMatches(oldbName, ourName) {
  const a = tokens(oldbName), b = tokens(ourName); if (!a.length || !b.length) return false;
  const la = a[a.length - 1], lb = b[b.length - 1];
  if (la === lb) return true;                                   // gleicher Nachname
  if (a.join('') === b.join('')) return true;                   // "Latte Lath" vs "Latte Lath"
  if (b.every(t => a.includes(t))) return true;                 // unser Name ist Teil des API-Namens
  if (a.every(t => b.includes(t))) return true;
  return false;
}
/**
 * Tore einer Runde aus den gespeicherten Spielen in die Resultate schreiben.
 * Zuordnung: Verein des Schützen muss zum Verein des Spielers passen, Name muss matchen. Eigentore zählen nicht.
 * Rückgabe: {assigned:[{player, tore}], unmatched:[{name, club}]}; überschreibt nur das Feld tore.
 */
export async function importGoals(roundId, players, teamToClub) {
  const matches = await q('select * from matches where round_id=$1 and finished', [roundId]);
  // Ohne beendete Spiele gibt es nichts zu uebernehmen. Frueher wurde in diesem Fall jedem
  // aufgestellten Spieler tore=0 geschrieben und damit von Hand erfasste Werte geloescht.
  if (!matches.length) return { assigned: [], unmatched: [], unknown: 0, skipped: 'keine beendeten Spiele' };
  const lus = await q('select * from lineups where round_id=$1', [roundId]);
  const lineupPids = new Set(); lus.forEach(l => Object.keys(l.entries || {}).forEach(pid => lineupPids.add(pid)));
  const candidates = Object.values(players).filter(p => lineupPids.has(p.id));
  const counts = {}; const unmatched = []; const assigned = [];
  for (const m of matches) for (const g of (m.goals || [])) {
    if (g.ownGoal) continue;
    const club = teamToClub[g.teamId];
    const hits = candidates.filter(p => (!club || normName(p.club) === normName(club)) && nameMatches(g.name, p.name));
    if (hits.length === 1) counts[hits[0].id] = (counts[hits[0].id] || 0) + 1;
    else if (hits.length > 1) unmatched.push({ name: g.name, club, reason: 'mehrdeutig: ' + hits.map(h => h.name).join(', ') });
    else unmatched.push({ name: g.name, club, reason: 'kein Spieler in einer Aufstellung' });
  }
  for (const pid of lineupPids) {
    const t = counts[pid] || 0;
    await q(`insert into results(round_id,player_id,tore) values($1,$2,$3) on conflict(round_id,player_id) do update set tore=excluded.tore where results.locked = false`, [roundId, pid, t]);
    if (t) assigned.push({ player: players[pid].name, tore: t });
  }
  return { assigned, unmatched: unmatched.filter(u => u.reason.startsWith('mehrdeutig')), unknown: unmatched.filter(u => !u.reason.startsWith('mehrdeutig')).length };
}
