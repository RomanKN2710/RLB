/* Rundencheck: alle Prüfungen einer Runde an einer Stelle. Liefert Probleme (bad), Hinweise (warn) und Infos, damit sie
   ganz oben auf der Rundenseite und in der Admin-Übersicht stehen. */
import { q } from './db';
import * as R from './rules';
import { playerMatches } from './kicker';
import { getSetting } from './db';
import { status as inboxStatus } from './kicker-inbox';

export async function roundCheck(round, b, d) {
  const out = []; const add = (level, text) => out.push({ level, text });
  const now = Date.now(); const passed = round.deadline && new Date(round.deadline).getTime() < now;
  const matches = d.matches; const finished = matches.filter(m => m.finished).length; const allDone = matches.length > 0 && finished === matches.length;
  const imp = await getSetting(`kicker_import_${round.id}`); const inbox = await inboxStatus(round.matchday).catch(() => null);
  const pool = await q('select slug, name, club from bl_players');
  const playedClubs = new Set(); matches.filter(m => m.finished).forEach(m => { const c1 = b.teamToClub[m.team1], c2 = b.teamToClub[m.team2]; if (c1) playedClubs.add(c1); if (c2) playedClubs.add(c2); });
  // 1) Aufstellungen und Kader
  for (const m of b.managers) {
    const lu = d.lineups[m.id];
    if (!lu) { add(passed ? 'bad' : 'warn', `${m.name}: keine Aufstellung${passed ? '' : ' (bis zur Deadline)'}`); continue; }
    const probs = R.posProblems(lu.entries, b.players); probs.forEach(p => add('bad', `${m.name}: Aufstellung – ${p}`));
    for (const pid of Object.keys(lu.entries)) { const p = b.players[pid]; if (!p) { add('bad', `${m.name}: unbekannter Spieler ${pid} in der Aufstellung`); continue; }
      if (p.manager_id !== m.id) add('bad', `${m.name}: ${p.name} gehört ${b.managerName[p.manager_id] || '?'}`);
      else if (!R.playerValid(p, round.number)) add('bad', `${m.name}: ${p.name} ist in dieser Runde nicht spielberechtigt (gültig ${p.valid_from}–${p.valid_to ?? '∞'})`);
      if (passed && playedClubs.has(p.club) && !d.results[pid]) add('warn', `${m.name}: ${p.name} (${p.club}) hat keine Werte, obwohl ${p.club} gespielt hat`); }
    const kader = b.playersArr.filter(p => p.manager_id === m.id && (p.status === 'active' || p.valid_to != null) && R.playerValid(p, round.number));
    if (kader.length !== R.KADER_SIZE) add('warn', `${m.name}: Kader hat ${kader.length} statt ${R.KADER_SIZE} Spieler`);
    const c1 = kader.filter(p => p.contract === '1J').length, c2 = kader.filter(p => p.contract === '2J').length;
    if (c2 > 2 || c1 + c2 > 4) add('warn', `${m.name}: ${c1 + c2} Verträge (${c2} über 2 Jahre) – erlaubt sind 4, davon 2 über 2 Jahre`);
  }
  // 2) Spiele
  if (passed && !allDone) add('warn', `Spiele: ${finished} von ${matches.length} beendet`);
  // 3) kicker-Import und Bericht
  if (passed && allDone) {
    if (!imp) add('bad', 'kicker-Werte noch nicht importiert' + (inbox && inbox.n ? ` (Eingang: ${inbox.n}/9 Spiele${inbox.elf ? ' + Elf des Tages' : ''})` : ' (Eingang leer)'));
    else {
      if (imp.games != null && imp.games < 9 && round.type !== 'nachtrag') add('bad', `kicker-Import: nur ${imp.games} von 9 Spielen`);
      if (imp.games == null) add('warn', 'kicker-Import stammt aus der alten Version ohne Vollständigkeitsbericht – bei Gelegenheit neu importieren');
      const c = imp.counts || {}; if (c.nicht_gefunden) add('bad', `kicker-Import: ${c.nicht_gefunden} Spieler «Name prüfen»`); if (c.spiel_fehlt) add('bad', `kicker-Import: ${c.spiel_fehlt} Spieler ohne Spiel`); if (c.verein_unbekannt) add('bad', `kicker-Import: ${c.verein_unbekannt} Spieler mit unbekanntem Verein`);
      (imp.errors || []).forEach(e => add('bad', 'kicker-Import: ' + e));
      if (!imp.elf && !(round.tdr || []).length) add('bad', 'Elf des Tages fehlt (weder importiert noch von Hand erfasst)');
    }
  }
  // 4) Elf des Tages: 11 Namen, jeder in der Datenbank (kicker-Pool), Spieler des Tages ebenso; TdR-Punkte passen zu den Namen
  const tdr = round.tdr || [];
  if (tdr.length) {
    if (tdr.length !== 11) add('bad', `Elf des Tages hat ${tdr.length} statt 11 Namen`);
    const find = nm => pool.filter(x => playerMatches(x.slug, x.name, nm) || R.norm(x.name) === R.norm(nm));
    const unknown = tdr.filter(nm => !find(nm).length); if (unknown.length) add('bad', `Elf des Tages: nicht in der Datenbank gefunden: ${unknown.join(', ')}`);
    if (round.sdt && !find(round.sdt).length) add('bad', `Spieler des Tages «${round.sdt}» nicht in der Datenbank gefunden`);
    if (!round.sdt) add('warn', 'Spieler des Tages fehlt');
    // erwartete TdR-Punkte bei aufgestellten RLB-Spielern
    const lineupPlayers = []; Object.values(d.lineups).forEach(l => Object.keys(l.entries).forEach(pid => { if (b.players[pid]) lineupPlayers.push(b.players[pid]); }));
    const expect = new Set();
    for (const nm of [...tdr, ...(round.sdt ? [round.sdt] : [])]) { for (const k of find(nm)) { lineupPlayers.filter(p => p.kicker_slug ? p.kicker_slug === k.slug : (R.norm(p.club) === R.norm(k.club || '') && playerMatches(k.slug, k.name, p.name))).forEach(h => expect.add(h.id)); } }
    const got = lineupPlayers.filter(p => (d.results[p.id]?.tdr || 0) > 0);
    const missing = [...expect].filter(id => !(d.results[id]?.tdr > 0)).map(id => b.players[id].name); const extra = got.filter(p => !expect.has(p.id)).map(p => p.name);
    if (missing.length) add('bad', `Team der Runde: ohne Punkt, obwohl in der Elf des Tages: ${missing.join(', ')}`);
    if (extra.length) add('warn', `Team der Runde: Punkt, obwohl nicht in der Elf des Tages: ${extra.join(', ')}`);
  }
  // 5) Gebote
  const sealed = await q("select count(*)::int as n from bids where round_id=$1 and status='sealed'", [round.id]);
  if (passed && sealed[0].n && !round.bids_resolved) add('warn', `${sealed[0].n} Gebot(e) noch nicht aufgelöst`);
  const locked = await q('select count(*)::int as n from results where round_id=$1 and locked', [round.id]);
  if (locked[0].n) add('info', `${locked[0].n} Wertzeilen vom Admin gesperrt (kicker überschreibt sie nicht)`);
  return { problems: out.filter(x => x.level === 'bad'), warnings: out.filter(x => x.level === 'warn'), infos: out.filter(x => x.level === 'info'), ok: !out.some(x => x.level === 'bad') };
}
