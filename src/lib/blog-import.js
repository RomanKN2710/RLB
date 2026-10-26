/* Blog-Import: Aufstellungen und Gebote aus eingefuegtem Blog-Text in die Runde uebernehmen, die Posts ins Archiv.
   Hier liegt die Logik ohne Server-Action-Huelle, damit Aktionen und einmalige Korrekturen (migrations.js) denselben
   Code nutzen. parse-Funktionen lesen nur, apply-Funktionen schreiben und protokollieren. */
import { q, one, tx, audit, setSetting, getSetting } from './db';
import * as D from './data';
import * as R from './rules';
import { parseLineupText } from './aufstellungstext';
import { parseBidText } from './gebotetext';
import { playerMatches } from './kicker';
import * as Archiv from './blog-archiv';

const fmtStamp = d => d ? new Date(d).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';

/** Aufstellung speichern (Admin oder Manager); Jugendstatus faellt erst, wenn die Aufstellung zaehlt. */
export async function writeLineup(u, roundId, managerId, clean) {
  const rd = await D.roundById(roundId); const effective = rd && rd.deadline && new Date(rd.deadline) <= new Date();
  await tx(async t => {
    const old = await t.one('select * from lineups where round_id=$1 and manager_id=$2', [roundId, managerId]);
    await t.q(`insert into lineups(round_id,manager_id,entries,free_in,updated_at,updated_by) values($1,$2,$3,$4,now(),$5)
      on conflict(round_id,manager_id) do update set entries=excluded.entries, updated_at=now(), updated_by=excluded.updated_by`, [roundId, managerId, JSON.stringify(clean), old ? old.free_in : [], u.id]);
    // Jugendspieler verlieren den Status bei Aufstellung (Ziff. 4.3.4)
    if (effective) await t.q('update players set jugend=false where jugend and id = any($1)', [Object.keys(clean)]);   // vor der Deadline: erst beim Abschluss der Runde
  });
  await audit(u.id, 'lineup', { roundId, managerId, entries: clean });
}

/* ---------- Admin: Aufstellungen aus eingefuegtem Text (Blog) ---------- */
export async function parseLineupPaste(roundId, text) {
  const round = await D.roundById(roundId); if (!round) throw new Error('Runde?'); const b = await D.base();
  const kaders = {}; const pool = await q('select slug, name, club from bl_players');
  for (const m of b.managers) kaders[m.id] = (await D.kader(m.id, round.number)).map(p => {
    // voller kicker-Name als Alias ("Miguel" -> miguel-gutierrez), damit auch der Nachname im Blog passt; Zusatzpositionen nur, soweit sie in dieser Runde schon gelten
    const bl = pool.filter(x => x.club === p.club && playerMatches(x.slug, x.name, p.name)); return { ...p, extra_pos: R.positionsOf(p, round.number).slice(1), alias: bl.length === 1 ? bl[0].slug.split('-').filter(t => !/^\d+$/.test(t)) : [] }; });
  // Basis fuer reine Wechsel-Posts ("Kramaric für Lemperle", "Keine Wechsel"): die Aufstellung der Vorrunde
  const bases = {}; for (const m of b.managers) bases[m.id] = await D.prevLineup(round, m.id);
  // Spieler, die nicht mehr im Kader sind (entlassen, abgegeben), aber in der Vorrunde oder im Post noch auftauchen
  const goneOf = id => { const ids = new Set(kaders[id].map(p => p.id)); const ref = new Set(Object.keys(bases[id]?.entries || {}));
    return b.playersArr.filter(p => !ids.has(p.id) && (p.manager_id === id || ref.has(p.id))); };
  // Gewonnene Gebote mit Eventualauftrag: der Neue ersetzt den genannten Spieler
  const bidsWon = await q("select * from bids where round_id=$1 and status='won' and swap_out_player_id is not null", [round.id]);
  const eventualOf = id => bidsWon.filter(x => x.manager_id === id).map(x => ({ inId: (kaders[id].find(p => p.valid_from === round.number && R.norm(p.name) === R.norm(x.player_name)) || {}).id, outId: x.swap_out_player_id })).filter(x => x.inId);
  const prevRound = await one('select * from rounds where number < $1 and deadline is not null order by number desc limit 1', [round.number]);
  const parsed = parseLineupText(text, b.managers.map(m => ({ id: m.id, name: m.name })), id => kaders[id], { clubs: (b.clubs || []).map(c => c.name || c.id), roundNumbers: [round.number, round.matchday].filter(Boolean), roundLabel: round.label,
    baseOf: id => bases[id], goneOf, eventualOf, notBefore: prevRound?.deadline || null, deadline: round.deadline || null });
  // Abgleich mit dem, was in der App schon steht: vom Manager selbst gespeichert, vom Admin, automatisch aus der
  // Vorrunde uebernommen oder noch nichts (dann gilt die Vorrunde). Im Zweifel gilt der Blog; der Unterschied wird gezeigt.
  const cur = await q('select l.*, u.role as by_role, u.manager_id as by_manager, u.name as by_name from lineups l left join users u on u.id=l.updated_by where l.round_id=$1', [round.id]);
  for (const x of parsed.blocks) {
    const c = cur.find(l => l.manager_id === x.managerId); const prev = c ? null : await D.prevLineup(round, x.managerId);
    const app = c ? c.entries : (prev ? prev.entries : null);
    x.bisher = !c ? (prev ? 'nichts gespeichert – es gilt die Vorrunde' : 'nichts gespeichert') : !c.updated_by ? `automatisch aus der Vorrunde (${fmtStamp(c.updated_at)})` : c.by_role === 'admin' && c.by_manager !== x.managerId ? `vom Admin gespeichert (${fmtStamp(c.updated_at)})` : `von ${x.name} selbst in der App gespeichert (${fmtStamp(c.updated_at)})`;
    x.selbst = !!(c && c.updated_by && !(c.by_role === 'admin' && c.by_manager !== x.managerId));
    if (app) { const name = pid => b.players[pid]?.name || pid;
      const plus = Object.keys(x.entries).filter(pid => !(pid in app)).map(name), minus = Object.keys(app).filter(pid => !(pid in x.entries)).map(name);
      const posw = Object.keys(x.entries).filter(pid => pid in app && app[pid].pos !== x.entries[pid].pos).map(pid => `${name(pid)} ${app[pid].pos}→${x.entries[pid].pos}`);
      x.diff = [...plus.map(n => '+' + n), ...minus.map(n => '−' + n), ...posw]; x.gleich = !x.diff.length; }
    else { x.diff = []; x.gleich = false; }
  }
  // Nicht zugeordnete Namen erklaeren: offenes Gebot dieser Runde (Gebote zuerst auswerten!), Kader eines anderen
  // Managers, entlassen oder gar nicht im Spiel. Haeufigster Fall: der Manager stellt einen Spieler auf, den er in
  // dieser Runde erst kauft - der ist bis zur Auswertung der Gebote nicht in seinem Kader.
  const bids = await q('select * from bids where round_id=$1', [round.id]);
  const alle = b.playersArr || Object.values(b.players || {});
  const erklaere = (mgrId, name) => { const n = name => R.norm(name); const nn = n(name);
    const bid = bids.find(x => x.manager_id === mgrId && (n(x.player_name) === nn || n(x.player_name).includes(nn) || nn.includes(n(x.player_name))));
    if (bid) return `${name} (Gebot in dieser Runde${bid.status === 'sealed' ? ', noch nicht ausgewertet – zuerst Gebote auswerten' : bid.status === 'won' ? ', gewonnen' : ', ' + bid.status})`;
    const other = alle.find(p => p.manager_id !== mgrId && p.status === 'active' && (n(p.name) === nn || (nn.length >= 5 && n(p.name).includes(nn)))); if (other) return `${name} (im Kader von ${b.managerName[other.manager_id]})`;
    const own = alle.find(p => p.manager_id === mgrId && (n(p.name) === nn || (nn.length >= 5 && n(p.name).includes(nn)))); if (own) return `${name} (${own.status === 'released' ? 'entlassen' : own.status}${own.valid_from > round.number ? ', gültig erst ab Runde ' + own.valid_from : ''})`;
    return `${name} (nicht im Kader)`; };
  for (const x of parsed.blocks) { x.unmatched = x.unmatched.map(u => erklaere(x.managerId, u)); x.kaderN = (kaders[x.managerId] || []).length; x.kaderSpaeter = alle.filter(p => p.manager_id === x.managerId && p.status === 'active' && p.valid_from > round.number).map(p => `${p.name} (ab Runde ${p.valid_from})`); }
  parsed.warnung = !round.bids_resolved && bids.some(x => x.status === 'sealed') ? `Die Gebote dieser Runde (${bids.filter(x => x.status === 'sealed').length}) sind noch nicht ausgewertet. Neu gekaufte Spieler fehlen deshalb in den Kadern und werden hier nicht erkannt – zuerst «Gebote auswerten», dann den Blog übernehmen.` : null;
  // Manager ohne Post: was gilt fuer sie?
  parsed.ohnePost = parsed.missing.map(n => { const m = b.managers.find(y => y.name === n); const c = cur.find(l => l.manager_id === m.id);
    return `${n}: ${!c ? 'Vorrunde' : !c.updated_by ? 'Vorrunde (automatisch übernommen)' : 'in der App gespeichert (' + fmtStamp(c.updated_at) + ')'}`; });
  return { round, b, parsed };
}

export async function applyLineupPaste(u, roundId, text) {
  const { parsed } = await parseLineupPaste(roundId, text);
  const log = []; let n = 0;
  if (parsed.warnung) log.push('ACHTUNG: ' + parsed.warnung);
  for (const x of parsed.blocks) {
    if (!x.ok) { log.push(`${x.name}: nicht übernommen (${x.problems.join('; ')})${x.selbst ? ' – die in der App gespeicherte Aufstellung bleibt' : ''}`); continue; }
    if (x.gleich) { log.push(`${x.name}: Blog und App identisch, nichts zu ändern`); continue; }
    await writeLineup(u, roundId, x.managerId, x.entries); n++;
    log.push(`${x.name}: ${Object.keys(x.entries).length} Spieler aus dem Blog gespeichert${x.selbst ? ' – überschreibt die selbst in der App gespeicherte Aufstellung' : ''}${x.diff.length ? ' (' + x.diff.join(', ') + ')' : ''}${x.notes.length ? ' – ' + x.notes.join('; ') : ''}${x.unmatched.length ? ' – nicht zugeordnet: ' + x.unmatched.join(', ') : ''}`);
  }
  if (parsed.ohnePost.length) log.push(`Ohne Post im Blog: ${parsed.ohnePost.join('; ')}`);
  if (parsed.skipped?.length) log.push(`Übersprungen: ${parsed.skipped.join('; ')}`);
  // Protokoll dauerhaft ablegen (wie beim kicker-Import), damit ein Lauf spaeter nachvollziehbar ist
  const prevLog = (await getSetting(`lineup_paste_${roundId}`)) || { runs: [] };
  await setSetting(`lineup_paste_${roundId}`, { runs: [...(prevLog.runs || []).slice(-9), { at: new Date().toISOString(), by: u.name || u.email, n, log, text: String(text || '').slice(0, 20000) }] });
  await audit(u.id, 'lineup_paste', { roundId, n, log });
  return { n, log, msg: `${n} Aufstellung(en) übernommen · ` + log.join(' · ') };
}


/** Gebote-Tabelle um Reihenfolge, Limit und Entlassungsliste erweitern (einmalig, idempotent). */
let bidColsReady = false;
export async function ensureBidColumns() { if (bidColsReady) return;
  await q("alter table bids add column if not exists priority int not null default 1"); await q("alter table bids add column if not exists max_wins int not null default 1");
  await q("alter table bids add column if not exists release_order text[] not null default '{}'"); await q("alter table bids add column if not exists source text"); await q("alter table bids add column if not exists note text");
  await q("alter table bids drop constraint if exists bids_round_id_manager_id_key"); await q("create unique index if not exists bids_round_manager_priority on bids(round_id, manager_id, priority)"); bidColsReady = true; }
/* ---------- Admin: Gebote aus eingefuegtem Text (Blog: weitergeleitete Gebots-Mails) ---------- */
export async function parseBidPaste(roundId, text) {
  await ensureBidColumns(); const round = await D.roundById(roundId); if (!round) throw new Error('Runde?'); const b = await D.base();
  const kaders = {}; for (const m of b.managers) kaders[m.id] = (await D.kader(m.id, round.number)).map(p => ({ ...p, alias: [] }));
  const vorRunde = await one('select * from rounds where number < $1 and deadline is not null order by number desc limit 1', [round.number]);
  const parsed = parseBidText(text, b.managers.map(m => ({ id: m.id, name: m.name })), id => kaders[id], { roundNumbers: [round.number, round.matchday].filter(Boolean), notBefore: vorRunde?.deadline || null, deadline: round.deadline || null });
  // Verein und Position aus dem Spielerpool ergaenzen, Budget und Ziff. 7.3 pruefen
  const pool = await D.freeAgents(b); const { playerMatches } = await import('@/lib/kicker');
  const prevRound = await one('select * from rounds where number < $1 order by number desc limit 1', [round.number]);
  const prevRel = prevRound ? await q("select * from transfers where type='entlassung' and round_id=$1", [prevRound.id]) : [];
  for (const x of parsed.blocks) {
    const budget = await D.budgetLeft(x.managerId); x.budget = budget;
    for (const bid of x.bids) {
      const hitsAll = pool.filter(p => (!bid.club || p.club === bid.club) && (playerMatches(p.slug, p.name, bid.player_name) || R.norm(p.name) === R.norm(bid.player_name) || (p.first && R.norm(p.first + ' ' + p.name) === R.norm(bid.player_name))));
      const hits = hitsAll.filter((p, i) => hitsAll.findIndex(x => x.name === p.name && x.club === p.club) === i);   // doppelte Pool-Eintraege (gleicher Name und Verein) zaehlen einmal
      const hit = hits.length === 1 ? hits[0] : hits.filter(p => p.club === bid.club).length === 1 ? hits.find(p => p.club === bid.club) : null;
      if (hit) { bid.poolName = hit.name; bid.club = bid.club || hit.club; bid.pos = bid.pos || hit.pos; bid.taken = hit.taken; bid.pool = `${hit.positions} ${hit.name}, ${hit.club}`; }
      else bid.poolNote = hits.length > 1 ? `mehrere im Pool: ${hits.map(p => p.name + ' (' + p.club + ')').join(', ')}` : 'nicht im Pool (noch kein Einsatz oder Schreibweise prüfen)';
      if (bid.taken) x.problems.push(`${bid.player_name} steht schon in einem RLB-Kader`);
      if (!bid.club) x.problems.push(`${bid.player_name}: Verein unbekannt`); if (!bid.pos) x.problems.push(`${bid.player_name}: Position unbekannt`);
      if (!Number.isInteger(bid.price) || bid.price < R.MIN_BID) x.problems.push(`${bid.player_name}: Gebot ${bid.price} unter Mindestgebot ${R.MIN_BID}`);
      if (bid.price > budget) x.problems.push(`${bid.player_name}: Gebot ${bid.price} über Kaufbudget ${budget} (7.4)`);
      const pr = prevRel.find(t => R.norm(t.player_name) === R.norm(bid.player_name));
      if (pr && pr.manager_id === x.managerId) x.problems.push(`${bid.player_name}: in der Vorrunde selbst entlassen, erst nächste Runde (7.3)`);
      else if (pr && bid.price < Number(pr.price)) x.problems.push(`${bid.player_name}: Mindestgebot ${Number(pr.price)} = alter Wert (7.3)`);
    }
    x.ok = x.problems.length === 0;
    const cur = await q("select * from bids where round_id=$1 and manager_id=$2 order by priority", [round.id, x.managerId]);
    x.bisher = cur.length ? cur.map(c => `${c.priority}. ${c.pos} ${c.player_name} ${c.price}${c.status !== 'sealed' ? ' (' + c.status + ')' : ''}`).join(', ') : 'noch kein Gebot';
    x.resolved = cur.some(c => c.status !== 'sealed');
  }
  return { round, b, parsed };
}

export async function applyBidPaste(u, roundId, text) {
  const { round, parsed } = await parseBidPaste(roundId, text);
  if (round.bids_resolved) return { n: 0, log: ['Gebote dieser Runde sind schon aufgelöst'], msg: 'Gebote dieser Runde sind schon aufgelöst' };
  const log = []; let n = 0;
  for (const x of parsed.blocks) {
    if (!x.ok) { log.push(`${x.name}: nicht übernommen (${x.problems.join('; ')})`); continue; }
    if (x.resolved) { log.push(`${x.name}: Gebote schon aufgelöst, nicht geändert`); continue; }
    await q("delete from bids where round_id=$1 and manager_id=$2 and status='sealed'", [round.id, x.managerId]);
    const order = x.releases.map(p => p.id);
    // Notizen (bedingter Wechsel ohne Kauf, Frist) bleiben am Gebot, damit sie beim Aufloesen und in der Tabelle sichtbar sind
    const note = [x.fallback ? `Falls kein Zuschlag: ${x.fallback.in.name} für ${x.fallback.out.name} einwechseln (kostenpflichtig, von Hand)` : null, x.spaet ? 'nach der Deadline eingegangen' : null].filter(Boolean).join(' · ') || null;
    for (const bd of x.bids) await q(`insert into bids(round_id,manager_id,player_name,club,pos,price,release_player_id,swap_out_player_id,status,created_at,priority,max_wins,release_order,source,note) values($1,$2,$3,$4,$5,$6,$7,$8,'sealed',now(),$9,$10,$11,'blog',$12)`,
      [round.id, x.managerId, bd.poolName || bd.player_name, bd.club, bd.pos, bd.price, bd.release?.id || null, bd.swapOut?.id || null, bd.priority, x.maxWins, order, note]);
    n++; log.push(`${x.name}: ${x.bids.length} Gebot(e) gespeichert (max. ${x.maxWins}): ${x.bids.map(bd => `${bd.priority}. ${bd.pos} ${bd.poolName || bd.player_name} ${bd.price}${bd.release ? ' −' + bd.release.name : ''}${bd.swapOut ? ' ⇄' + bd.swapOut.name : ''}`).join(', ')}${order.length ? ' · Entlassungen: ' + x.releases.map(p => p.name).join(', ') : ''}${note ? ' · ' + note : ''}`);
  }
  if (parsed.unclear.length) log.push('Unklar: ' + parsed.unclear.join('; '));
  const prevLog = (await getSetting(`bid_paste_${roundId}`)) || { runs: [] };
  await setSetting(`bid_paste_${roundId}`, { runs: [...(prevLog.runs || []).slice(-9), { at: new Date().toISOString(), by: u.name || u.email, n, log }] });
  await audit(u.id, 'bid_paste', { roundId, n, log });
  return { n, log, msg: `Gebote von ${n} Manager(n) übernommen · ` + log.join(' · ') };
}
/** Gebote einer Runde aufloesen (Vorschau und Zuteilen nutzen dieselbe Rechnung). */
export async function resolveRoundBids(round, b, bids) {
  const budgets = {}; for (const m of b.managerIds) budgets[m] = await D.budgetLeft(m);
  const prevRound = await one('select * from rounds where number < $1 order by number desc limit 1', [round.number]);
  const prevReleases = prevRound ? await q("select * from transfers where type='entlassung' and round_id=$1", [prevRound.id]) : [];
  const tiebreak = await D.tiebreakOrder(round, b);
  return R.resolveBids(bids.map(x => ({ ...x, price: Number(x.price) })), { players: b.players, budgetLeft: m => budgets[m], managerName: m => b.managerName[m], tiebreak, prevReleases });
}

/** Aufstellung der Runde anlegen, falls noch keine da ist: Kopie der Vorrunde ohne Spieler, die nicht mehr spielberechtigt sind. */
export async function materializeLineup(x, round, m, b) {
  const lu = await x.one('select * from lineups where round_id=$1 and manager_id=$2', [round.id, m]); if (lu) return lu;
  const prev = await x.one('select l.* from lineups l join rounds r on r.id=l.round_id where l.manager_id=$1 and r.number < $2 order by r.number desc limit 1', [m, round.number]); if (!prev) return null;
  const entries = {}; for (const [pid, e] of Object.entries(prev.entries || {})) { const p = b.players[pid]; if (p && p.manager_id === m && p.status === 'active' && R.playerValid(p, round.number)) entries[pid] = e; }
  await x.q('insert into lineups(round_id,manager_id,entries,free_in,updated_at) values($1,$2,$3,$4,now()) on conflict do nothing', [round.id, m, JSON.stringify(entries), []]);
  return x.one('select * from lineups where round_id=$1 and manager_id=$2', [round.id, m]);
}
const slugId = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
/** Kennung des gekauften Spielers (Manager-Name-Runde), beim Zuteilen und beim Zuruecksetzen gleich. */
export const kaufPlayerId = (b, bid, round) => slugId(`${b.managerName[bid.manager_id]}-${bid.player_name}-${round.number}`);
const setSettingTx = (x, key, value) => x.q('insert into settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value', [key, JSON.stringify(value)]);

/** Gebote zuteilen (Ziff. 7.1, 7.3, 7.4): Kauf, Entlassung, Vertragspflicht ab 20 und Eventualauftrag.
    Der Eventualauftrag ist verbindlich: der Neue ersetzt den genannten Spieler in der Aufstellung dieser Runde – auch
    wenn die Aufstellung aus dem Blog oder der App ihn noch nicht kennt – und ist in dieser Runde gratis (free_in).
    Vorher werden die Aufstellungen gesichert, damit «Auflösung zurücksetzen» sie wiederherstellen kann. */
export async function applyBids(userId, roundId) {
  await ensureBidColumns(); const round = await D.roundById(roundId); if (!round) throw new Error('Runde?'); if (round.bids_resolved) throw new Error('Bereits aufgelöst');
  const b = await D.base(); const bids = await q('select * from bids where round_id=$1 order by manager_id, priority', [roundId]); const list = await resolveRoundBids(round, b, bids);
  const { playerMatches: pm } = await import('./kicker'); const usedRel = new Set(); const log = [];
  await tx(async x => {
    const snap = await x.q('select manager_id, entries, free_in from lineups where round_id=$1', [round.id]);
    await setSettingTx(x, `bids_snapshot_${round.id}`, { at: new Date().toISOString(), lineups: snap });
    for (const bid of list) {
      await x.q('update bids set status=$1, reason=$2 where id=$3', [bid.status, [bid.reason, bid.status !== 'won' && bid.note && /Falls kein Zuschlag/.test(bid.note) ? bid.note.replace(/^Falls kein Zuschlag: /, 'Jetzt von Hand: ') : null].filter(Boolean).join(' · ') || null, bid.id]);
      if (bid.status !== 'won') { if (bid.note && /Falls kein Zuschlag/.test(bid.note)) log.push(`${b.managerName[bid.manager_id]}: kein Zuschlag für ${bid.player_name} – ${bid.note.replace(/^Falls kein Zuschlag: /, 'von Hand: ')}`); continue; }
      // Entlassung: je Gebot genannt, sonst die naechste freie aus der Reihenfolge-Liste des Managers
      const m = bid.manager_id; let relId = bid.release_player_id; if (!relId) relId = (bid.release_order || []).find(pid => !usedRel.has(pid) && b.players[pid] && b.players[pid].status === 'active' && b.players[pid].manager_id === m) || null;
      if (relId) { usedRel.add(relId); if (!bid.release_player_id) await x.q('update bids set release_player_id=$1 where id=$2', [relId, bid.id]); }
      const rel = b.players[relId];
      const id = kaufPlayerId(b, bid, round); const contract = bid.price >= R.CONTRACT_MIN ? '1J' : null;
      // Positionen aus dem Spielerpool: Grundposition laut kicker-Kader, Zusatzpositionen nur aus Startaufstellungen dieser Saison (Ziff. 5.2), nie aus dem Gebot
      const poolRows = await x.q('select * from bl_players where club=$1', [bid.club]); const pp = poolRows.find(r => pm(r.slug, r.name, bid.player_name));
      const basePos = (pp && pp.squad_pos) || bid.pos; const extra = pp ? [...new Set((pp.played_pos || []).filter(p => p && p !== basePos))] : [];
      await x.q(`insert into players(id,manager_id,name,club,base_pos,extra_pos,price,slot,source,status,valid_from,jugend,contract,contract_mandatory) values($1,$2,$3,$4,$5,$6,$7,'bank','kauf','active',$8,false,$9,$10)`, [id, m, bid.player_name, bid.club, basePos, extra, bid.price, round.number, contract, !!contract]);
      await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'kauf',$3,$4,$5)", [round.id, m, bid.player_name, bid.price, `Gebot ${round.label}${contract ? ', Vertragspflicht (7.4), Laufzeit wählbar' : ''}`]);
      if (rel) { await x.q("update players set status='released', valid_to=$2 where id=$1", [rel.id, round.number - 1]); await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'entlassung',$3,$4,$5)", [round.id, m, rel.name, R.value(rel), `mit Gebot ${round.label}`]); }
      const np = { id, name: bid.player_name, base_pos: basePos, extra_pos: extra, manager_id: m }; let note = `${b.managerName[m]}: ${bid.player_name} für ${bid.price}${rel ? ', ' + rel.name + ' entlassen' : ''}`;
      const lu = await materializeLineup(x, round, m, b);
      if (lu) { let e = { ...lu.entries }; const free = (lu.free_in || []).slice(); let ch = false; const marks = [];
        if (bid.swap_out_player_id) {
          const out = b.players[bid.swap_out_player_id]; const sw = R.swapIn(e, bid.swap_out_player_id, np, b.players, round.number);
          if (sw) { e = sw.entries; ch = true; marks.push(`eingewechselt für ${out?.name || '?'}` + (Object.keys(sw.changes).length ? ' (' + Object.entries(sw.changes).map(([pid, p2]) => `${b.players[pid]?.name || pid} als ${p2}`).join(', ') + ')' : '') + (sw.ok ? '' : ' – Aufstellung prüfen, Positionsregel verletzt')); }
          else if (e[id]) marks.push('steht schon in der Aufstellung');
          else marks.push(`Eventualauftrag nicht ausführbar: ${out?.name || '?'} steht nicht in der Aufstellung`);
          if (!free.includes(id)) { free.push(id); ch = true; }   // Eventualauftrag: Einwechslung in dieser Runde ohne Wechselkosten (7.1)
        }
        if (rel && e[rel.id]) { delete e[rel.id]; ch = true; marks.push(`${rel.name} entlassen – fällt aus der Aufstellung`); }
        if (ch) await x.q('update lineups set entries=$1, free_in=$2, updated_at=now() where round_id=$3 and manager_id=$4', [JSON.stringify(e), free, round.id, m]);
        if (marks.length) { await x.q('update bids set reason=$1 where id=$2', [[bid.reason, ...marks].filter(Boolean).join(' · '), bid.id]); note += ' · ' + marks.join(' · '); }
      }
      log.push(note);
    }
    await x.q('update rounds set bids_resolved=true where id=$1', [round.id]);
  });
  await audit(userId, 'bids_applied', { roundId, log });
  return { list, log, won: list.filter(x => x.status === 'won').length };
}

/** Zuteilung zuruecknehmen (nur solange die Runde nicht abgeschlossen ist): Käufe, Entlassungen, Verträge und
    Aufstellungsänderungen rückgängig, Gebote wieder verdeckt. Danach kann neu aufgelöst werden. */
export async function undoBids(userId, roundId) {
  await ensureBidColumns(); const round = await D.roundById(roundId); if (!round) throw new Error('Runde?');
  if (!round.bids_resolved) throw new Error('Gebote sind nicht aufgelöst'); if (round.status === 'final') throw new Error('Runde ist abgeschlossen');
  const b = await D.base(); const won = await q("select * from bids where round_id=$1 and status='won'", [roundId]); const snap = await getSetting(`bids_snapshot_${roundId}`); const log = [];
  await tx(async x => {
    for (const bid of won) {
      const m = bid.manager_id; const id = kaufPlayerId(b, bid, round); const np = b.players[id]; let note = `${b.managerName[m]}: Kauf ${bid.player_name} zurück`;
      if (np) { await x.q('delete from results where player_id=$1', [id]); await x.q('delete from players where id=$1', [id]); }
      await x.q("delete from transfers where round_id=$1 and manager_id=$2 and type='kauf' and player_name=$3", [round.id, m, bid.player_name]);
      const rel = bid.release_player_id && b.players[bid.release_player_id];
      if (rel && rel.status === 'released' && rel.valid_to === round.number - 1) { await x.q("update players set status='active', valid_to=null where id=$1", [rel.id]); await x.q("delete from transfers where round_id=$1 and manager_id=$2 and type='entlassung' and player_name=$3", [round.id, m, rel.name]); note += `, ${rel.name} wieder im Kader`; }
      const lu = await x.one('select * from lineups where round_id=$1 and manager_id=$2', [round.id, m]);
      if (lu) { const s = snap && (snap.lineups || []).find(l => l.manager_id === m);
        if (s) { await x.q('update lineups set entries=$1, free_in=$2, updated_at=now() where round_id=$3 and manager_id=$4', [JSON.stringify(s.entries), s.free_in || [], round.id, m]); note += ', Aufstellung aus der Sicherung'; }
        else if (snap) { await x.q('delete from lineups where round_id=$1 and manager_id=$2', [round.id, m]); note += ', Aufstellung (erst beim Zuteilen angelegt) entfernt'; }
        else { // keine Sicherung (Zuteilung aus einer aelteren Version): Neuen raus, Ersetzten zurueck auf eine passende Position
          const e = { ...lu.entries }; const free = (lu.free_in || []).filter(p => p !== id);
          if (e[id]) { const pos = e[id].pos; delete e[id]; const out = bid.swap_out_player_id && b.players[bid.swap_out_player_id];
            if (out && !e[out.id]) { e[out.id] = { pos: R.positionsOf(out, round.number).includes(pos) ? pos : out.base_pos }; const fit = R.fitPositions(e, b.players, new Set(), round.number); if (fit) for (const [pid, p2] of Object.entries(fit.changes)) e[pid] = { pos: p2 }; } }
          await x.q('update lineups set entries=$1, free_in=$2, updated_at=now() where round_id=$3 and manager_id=$4', [JSON.stringify(e), free, round.id, m]); note += ', Aufstellung zurückgebaut (ohne Sicherung)'; } }
      log.push(note);
    }
    await x.q("update bids set status='sealed', reason=null where round_id=$1", [round.id]);
    await x.q('update rounds set bids_resolved=false where id=$1', [round.id]);
    await x.q('delete from settings where key=$1', [`bids_snapshot_${round.id}`]);
  });
  await audit(userId, 'bids_undone', { roundId, log });
  return { log };
}

/** Runde abschliessen (Ziff. 4.3.4: Jugendspieler in gewerteten Aufstellungen verlieren den Status). Bericht separat. */
export async function finalizeRound(userId, roundId) {
  await q("update rounds set status='final' where id=$1", [roundId]);
  await q("update players set jugend=false where jugend and id in (select jsonb_object_keys(entries) from lineups where round_id=$1)", [roundId]);
  await audit(userId, 'round_status', { roundId, final: true });
}
/** Spieltagsbericht im Hintergrund anstossen (eigene Funktion mit laengerer Laufzeit). */
export function triggerReport(roundId) {
  const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://127.0.0.1:' + (process.env.PORT || 3000));
  if (!process.env.CRON_SECRET) return null;
  return fetch(`${base}/api/bericht?round_id=${roundId}&key=${process.env.CRON_SECRET}`, { method: 'POST' }).catch(e => console.error('Bericht', e.message));
}

/** Vorschau: Aufstellungen und Gebote aus demselben Text. */
export async function previewBlog(roundId, text) {
  const l = await parseLineupPaste(roundId, text); const g = await parseBidPaste(roundId, text);
  const pl = l.parsed, pg = g.parsed;
  return { msg: `Aufstellungen: ${pl.blocks.length} erkannt, ${pl.blocks.filter(x => x.ok).length} zulässig · Gebote: ${pg.blocks.length} Manager, ${pg.blocks.filter(x => x.ok).length} zulässig`,
    lineups: { blocks: pl.blocks.map(x => ({ ...x, entries: undefined, ambiguous: undefined })), missing: pl.missing, ohnePost: pl.ohnePost, unclear: pl.unclear, skipped: pl.skipped, warnung: pl.warnung },
    bids: { blocks: pg.blocks.map(x => ({ managerId: x.managerId, name: x.name, title: x.title, maxWins: x.maxWins, budget: x.budget, ok: x.ok, problems: x.problems, notes: x.notes, unmatched: x.unmatched, bisher: x.bisher, resolved: x.resolved, releases: x.releases.map(p => p.name), bids: x.bids.map(bd => ({ priority: bd.priority, player_name: bd.player_name, club: bd.club, pos: bd.pos, price: bd.price, release: bd.release?.name || null, swapOut: bd.swapOut?.name || null, pool: bd.pool || null, poolNote: bd.poolNote || null })) })), unclear: pg.unclear, skipped: pg.skipped } };
}

/** Alles in einem Rutsch: Posts ins Archiv, Gebote speichern, Aufstellungen uebernehmen (nur Zulaessiges). */
export async function applyBlog(u, roundId, text) {
  const b = await D.base(); const rounds = (await D.rounds()).filter(r => r.type === 'regulaer' && r.deadline);
  let archiv = { neu: 0, vorhanden: 0 };
  // Ohne Datumszeile im Text (Handy-Ansicht): die Posts gehoeren zur Runde, also Deadline-Tag als Datum
  const round = await D.roundById(roundId); const defaultDate = round?.deadline ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(round.deadline)) : null;
  try { await Archiv.ensureTable(); const posts = Archiv.parseBlogText(text, { defaultDate }); if (posts.length) archiv = await Archiv.importPosts(posts, b.managers, rounds, 'paste'); } catch (e) { archiv = { neu: 0, vorhanden: 0, fehler: e.message }; }
  const bids = await applyBidPaste(u, roundId, text);
  const lineups = await applyLineupPaste(u, roundId, text);
  const msg = `Archiv: ${archiv.neu} neue Posts${archiv.fehler ? ' (Fehler: ' + archiv.fehler + ')' : ''} · ${bids.msg} · ${lineups.msg}`;
  return { archiv, bids, lineups, msg };
}
