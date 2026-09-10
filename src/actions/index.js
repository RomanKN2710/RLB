'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, tx, audit, setSetting, getSetting } from '@/lib/db';
import { login, clearSession, requireUser, requireAdmin, hashPassword } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { syncTeams, syncSchedule, syncCurrent, refreshDeadlines, importGoals } from '@/lib/oldb';
import { importRound } from '@/lib/kicker';

const ok = (msg, extra) => ({ ok: true, msg, ...extra });
const fail = msg => ({ ok: false, msg });
const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { return fail(e.message || String(e)); } };
const rev = () => ['/', '/aufstellung', '/markt', '/kader', '/abrechnung', '/admin'].forEach(p => revalidatePath(p, 'layout'));

/* ---------- Auth ---------- */
export async function loginAction(prev, fd) {
  const u = await login(String(fd.get('email') || ''), String(fd.get('password') || ''));
  if (!u) return fail('E-Mail oder Passwort falsch');
  await audit(u.id, 'login', {});
  redirect(u.must_change_pw ? '/konto?first=1' : '/');
}
export async function logoutAction() { clearSession(); redirect('/login'); }
export const changePasswordAction = wrap(async (prev, fd) => {
  const u = await requireUser(); const pw = String(fd.get('password') || ''), pw2 = String(fd.get('password2') || '');
  if (pw.length < 8) return fail('Mindestens 8 Zeichen'); if (pw !== pw2) return fail('Passwörter stimmen nicht überein');
  await q('update users set password_hash=$1, must_change_pw=false where id=$2', [await hashPassword(pw), u.id]);
  return ok('Passwort geändert');
});

/* ---------- Aufstellung (Manager: nur eigene, nur offene Runde, bis Deadline; Admin: alles) ---------- */
export const saveLineupAction = wrap(async (roundId, managerId, entries) => {
  const u = await requireUser(); const admin = u.role === 'admin';
  if (!admin && u.manager_id !== managerId) return fail('Nur die eigene Aufstellung');
  const round = await D.roundById(roundId); if (!round) return fail('Runde nicht gefunden');
  if (!admin) { const open = await D.openRound(); if (!open || open.id !== round.id) return fail('Diese Aufstellung ist nicht mehr offen (Deadline 90 Min. vor Anpfiff, Ziff. 5.1)'); }
  const b = await D.base();
  const clean = {}; for (const [pid, e] of Object.entries(entries || {})) { const p = b.players[pid]; if (!p || p.manager_id !== managerId || p.status !== 'active' || !R.playerValid(p, round.number)) return fail(`Spieler ${pid} nicht im Kader`);
    const pos = String(e.pos || p.base_pos).toUpperCase(); if (!R.positionsOf(p).includes(pos)) return fail(`${p.name} kann nicht als ${pos} aufgestellt werden (Ziff. 5.2)`); clean[pid] = { pos }; }
  const chk = R.posCheck(clean, b.players); if (!chk.ok) return fail(chk.n !== 11 ? `Genau 11 Spieler (aktuell ${chk.n})` : `Positionsregel verletzt: ${chk.bad.join(', ')} (1 T, 3–5 V, 3–6 M, 1–3 S)`);
  await tx(async t => {
    const old = await t.one('select * from lineups where round_id=$1 and manager_id=$2', [roundId, managerId]);
    await t.q(`insert into lineups(round_id,manager_id,entries,free_in,updated_at,updated_by) values($1,$2,$3,$4,now(),$5)
      on conflict(round_id,manager_id) do update set entries=excluded.entries, updated_at=now(), updated_by=excluded.updated_by`, [roundId, managerId, JSON.stringify(clean), old ? old.free_in : [], u.id]);
    // Jugendspieler verlieren den Status bei Aufstellung (Ziff. 4.3.4)
    await t.q('update players set jugend=false where jugend and id = any($1)', [Object.keys(clean)]);
  });
  await audit(u.id, 'lineup', { roundId, managerId, entries: clean }); rev();
  return ok('Aufstellung gespeichert');
});

/* ---------- Gebote (Manager: eigenes, offene Runde, bis Deadline) ---------- */
export const submitBidAction = wrap(async (prev, fd) => {
  const u = await requireUser(); const managerId = u.role === 'admin' ? Number(fd.get('manager_id')) : u.manager_id;
  if (!managerId) return fail('Kein Manager');
  const open = await D.openRound(); if (!open) return fail('Keine offene Runde');
  const bid = { player_name: String(fd.get('player_name') || '').trim(), club: String(fd.get('club') || ''), pos: String(fd.get('pos') || '').toUpperCase(), price: Math.floor(Number(fd.get('price'))), release: String(fd.get('release') || ''), swap: String(fd.get('swap') || '') };
  if (!bid.player_name) return fail('Spielername fehlt'); if (!'TVMS'.includes(bid.pos) || !bid.pos) return fail('Position');
  if (!(bid.price >= R.MIN_BID)) return fail(`Gebot in ganzen Franken, mindestens ${R.MIN_BID}`);
  const budget = await D.budgetLeft(managerId); if (bid.price > budget) return fail(`Kaufbudget reicht nicht (${budget} verfügbar, Ziff. 7.4)`);
  const rel = await one('select * from players where id=$1', [bid.release]); if (!rel || rel.manager_id !== managerId || rel.status !== 'active') return fail('Zu entlassender Spieler fehlt (Kader bleibt 22, Ziff. 7.1)');
  const own = await one("select p.*, m.name as mname from players p join managers m on m.id=p.manager_id where p.status='active' and lower(p.name)=lower($1)", [bid.player_name]); if (own) return fail(`${own.name} steht bereits im Kader von ${own.mname}`);
  if (bid.swap) { const lu = await one('select * from lineups where round_id=$1 and manager_id=$2', [open.id, managerId]); if (!lu || !lu.entries[bid.swap]) return fail('Eventualauftrag: der zu ersetzende Spieler steht nicht in deiner Aufstellung'); }
  await q(`insert into bids(round_id,manager_id,player_name,club,pos,price,release_player_id,swap_out_player_id,status,created_at) values($1,$2,$3,$4,$5,$6,$7,$8,'sealed',now())
    on conflict(round_id,manager_id) do update set player_name=excluded.player_name, club=excluded.club, pos=excluded.pos, price=excluded.price, release_player_id=excluded.release_player_id, swap_out_player_id=excluded.swap_out_player_id, status='sealed', reason=null, created_at=now()`,
    [open.id, managerId, bid.player_name, bid.club || null, bid.pos, bid.price, bid.release, bid.swap || null]);
  await audit(u.id, 'bid', { roundId: open.id, managerId }); rev();
  return ok('Gebot verdeckt gespeichert');
});
export const withdrawBidAction = wrap(async () => {
  const u = await requireUser(); const open = await D.openRound(); if (!open) return fail('Keine offene Runde');
  await q("delete from bids where round_id=$1 and manager_id=$2 and status='sealed'", [open.id, u.manager_id]); rev(); return ok('Gebot zurückgezogen');
});

/* ---------- Trades (Ziff. 6) ---------- */
export const proposeTradeAction = wrap(async (prev, fd) => {
  const u = await requireUser(); const from = u.manager_id; const to = Number(fd.get('to')); const give = fd.getAll('give').map(String), get = fd.getAll('get').map(String);
  if (!from || !to || from === to) return fail('Partner wählen'); if (!give.length || give.length !== get.length) return fail('Gleich viele Spieler auf beiden Seiten (Kader bleibt 22)');
  const ps = await q('select * from players where id = any($1)', [give.concat(get)]);
  if (give.some(id => !ps.find(p => p.id === id && p.manager_id === from && p.status === 'active'))) return fail('Eigene Spieler ungültig');
  if (get.some(id => !ps.find(p => p.id === id && p.manager_id === to && p.status === 'active'))) return fail('Spieler des Partners ungültig');
  await q('insert into trades(from_manager,to_manager,give,get_) values($1,$2,$3,$4)', [from, to, give, get]); rev(); return ok('Trade vorgeschlagen');
});
export const respondTradeAction = wrap(async (tradeId, accept) => {
  const u = await requireUser(); const t = await one('select * from trades where id=$1', [tradeId]); if (!t || t.status !== 'proposed') return fail('Trade nicht offen');
  const admin = u.role === 'admin';
  if (!accept) { if (!admin && u.manager_id !== t.to_manager && u.manager_id !== t.from_manager) return fail('Nicht beteiligt'); await q("update trades set status='rejected' where id=$1", [tradeId]); rev(); return ok('Trade abgelehnt'); }
  if (!admin && u.manager_id !== t.to_manager) return fail('Nur der angefragte Manager kann annehmen');
  const open = await D.openRound(); const roundId = open ? open.id : null;
  await tx(async x => {
    await x.q("update players set manager_id=$1, source='trade' where id = any($2)", [t.to_manager, t.give]);
    await x.q("update players set manager_id=$1, source='trade' where id = any($2)", [t.from_manager, t.get_]);
    for (const m of [t.from_manager, t.to_manager]) await x.q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'trade',$3,$4)", [m, roundId, R.TRADE_FEE, `Trade #${t.id}`]);
    const names = async ids => (await x.q('select name from players where id=any($1)', [ids])).map(r => r.name).join(', ');
    await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'trade',$3,$4,$5)", [roundId, t.from_manager, await names(t.give), R.TRADE_FEE, 'erhält ' + await names(t.get_)]);
    await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'trade',$3,$4,$5)", [roundId, t.to_manager, await names(t.get_), R.TRADE_FEE, 'erhält ' + await names(t.give)]);
    // Getauschte Spieler aus der offenen Aufstellung des abgebenden Managers entfernen (Ziff. 6: Aufstellung muss angepasst werden)
    if (open) for (const [m, ids] of [[t.from_manager, t.give], [t.to_manager, t.get_]]) { const lu = await x.one('select * from lineups where round_id=$1 and manager_id=$2', [open.id, m]); if (lu) { const e = { ...lu.entries }; ids.forEach(id => delete e[id]); await x.q('update lineups set entries=$1 where round_id=$2 and manager_id=$3', [JSON.stringify(e), open.id, m]); } }
    await x.q("update trades set status='done', done_at=now(), round_id=$2 where id=$1", [tradeId, roundId]);
  });
  await audit(u.id, 'trade_done', { tradeId }); rev(); return ok('Trade vollzogen, je CHF 5 gebucht');
});
export const vetoTradeAction = wrap(async (tradeId, on) => {
  const u = await requireUser(); const t = await one('select * from trades where id=$1', [tradeId]); if (!t || t.status !== 'done') return fail('Kein vollzogener Trade');
  if (u.manager_id === t.from_manager || u.manager_id === t.to_manager || !u.manager_id) return fail('Nur unbeteiligte Manager');
  const v = (t.vetos || []).filter(m => m !== u.manager_id); if (on) v.push(u.manager_id);
  await q('update trades set vetos=$1 where id=$2', [v, tradeId]); rev(); return ok(on ? 'Veto eingelegt' : 'Veto zurückgezogen');
});
export const revertTradeAction = wrap(async (tradeId) => {
  const u = await requireAdmin(); const t = await one('select * from trades where id=$1', [tradeId]); if (!t || t.status !== 'done') return fail('Kein vollzogener Trade');
  await tx(async x => { await x.q('update players set manager_id=$1 where id=any($2)', [t.from_manager, t.give]); await x.q('update players set manager_id=$1 where id=any($2)', [t.to_manager, t.get_]); await x.q("update trades set status='reverted' where id=$1", [tradeId]); });
  await audit(u.id, 'trade_revert', { tradeId }); rev(); return ok('Trade rückgängig gemacht (Gebühren bleiben gebucht)');
});

/* ---------- Admin: Benutzer ---------- */
export const createUserAction = wrap(async (prev, fd) => {
  const a = await requireAdmin(); const email = String(fd.get('email') || '').trim().toLowerCase(), name = String(fd.get('name') || '').trim(), role = String(fd.get('role') || 'manager'), mid = Number(fd.get('manager_id')) || null, pw = String(fd.get('password') || '');
  if (!email || !name || pw.length < 8) return fail('E-Mail, Name und Startpasswort (min. 8 Zeichen)'); if (role === 'manager' && !mid) return fail('Manager-Team wählen');
  await q('insert into users(email,name,role,manager_id,password_hash,must_change_pw) values($1,$2,$3,$4,$5,true)', [email, name, role, mid, await hashPassword(pw)]);
  await audit(a.id, 'user_create', { email, role, mid }); rev(); return ok(`Konto ${email} angelegt`);
});
export const resetPasswordAction = wrap(async (userId, pw) => { const a = await requireAdmin(); if (String(pw).length < 8) return fail('min. 8 Zeichen'); await q('update users set password_hash=$1, must_change_pw=true where id=$2', [await hashPassword(String(pw)), userId]); await audit(a.id, 'pw_reset', { userId }); return ok('Startpasswort gesetzt'); });
export const deleteUserAction = wrap(async (userId) => { const a = await requireAdmin(); if (userId === a.id) return fail('Eigenes Konto nicht löschbar'); await q('delete from users where id=$1', [userId]); rev(); return ok('Konto gelöscht'); });

/* ---------- Admin: Spielplan / Runden ---------- */
export const syncAction = wrap(async () => { await requireAdmin(); await syncTeams(); const n = await syncSchedule(); rev(); return ok(`Spielplan synchronisiert (${n} Spiele)`); });
export const syncCurrentAction = wrap(async () => { await requireAdmin(); const n = await syncCurrent(); rev(); return ok(`Aktuelle Spieltage aktualisiert (${n} Spiele)`); });
export const setDeadlineAction = wrap(async (roundId, isoOrEmpty) => { const a = await requireAdmin();
  if (!isoOrEmpty) { await q('update rounds set deadline_manual=false where id=$1', [roundId]); await refreshDeadlines(); }
  else await q('update rounds set deadline=$1, deadline_manual=true where id=$2', [new Date(isoOrEmpty).toISOString(), roundId]);
  await audit(a.id, 'deadline', { roundId, isoOrEmpty }); rev(); return ok('Deadline gesetzt'); });
export const roundInfoAction = wrap(async (roundId, tdr, sdt, label) => { await requireAdmin(); await q('update rounds set tdr=$1, sdt=$2, label=coalesce(nullif($3,\'\'),label) where id=$4', [tdr, sdt || null, label || '', roundId]); rev(); return ok('Gespeichert'); });
export const finalizeRoundAction = wrap(async (roundId, final) => { const a = await requireAdmin(); await q('update rounds set status=$1 where id=$2', [final ? 'final' : 'open', roundId]); await audit(a.id, 'round_status', { roundId, final }); rev(); return ok(final ? 'Runde abgeschlossen' : 'Runde wieder geöffnet'); });
export const splitNachtragAction = wrap(async (matchId) => { const a = await requireAdmin();
  const m = await one('select * from matches where id=$1', [matchId]); if (!m) return fail('Spiel nicht gefunden');
  const teams = await q('select id, full_name from clubs where oldb_team_id in ($1,$2)', [m.team1, m.team2]);
  // Rundennummer: nach der letzten Runde, deren Deadline vor dem Anpfiff liegt
  const before = await one('select number from rounds where deadline < $1 order by number desc limit 1', [m.kickoff]);
  const after = await one('select number from rounds where number > $1 order by number limit 1', [before ? before.number : 0]);
  const number = before ? (after ? Math.floor((before.number + after.number) / 2) : before.number + 5) : 5;
  if (before && after && number === before.number) return fail('Kein Platz in der Nummerierung; Runde manuell anlegen');
  const label = `Nachtrag ${m.matchday}: ${teams.map(t => t.id).join(' – ')}`;
  await tx(async x => { const r = await x.one("insert into rounds(number,type,label,matchday,match_ids) values($1,'nachtrag',$2,$3,$4) returning *", [number, label, m.matchday, [matchId]]);
    await x.q('update matches set round_id=$1 where id=$2', [r.id, matchId]); await x.q('update rounds set match_ids=array_remove(match_ids,$1) where type=\'regulaer\' and matchday=$2', [matchId, m.matchday]); });
  await refreshDeadlines(); await audit(a.id, 'nachtrag', { matchId }); rev(); return ok(`${label} angelegt`); });

/* ---------- Admin: Resultate, Korrekturen ---------- */
export const saveResultsAction = wrap(async (roundId, managerId, rows) => { const a = await requireAdmin();
  await tx(async x => { for (const [pid, r] of Object.entries(rows || {})) { const old = await x.one('select * from results where round_id=$1 and player_id=$2', [roundId, pid]);
    const vals = { start: +r.start || 0, assist: +r.assist || 0, tore: +r.tore || 0, karten: +r.karten || 0, tdr: +r.tdr || 0 };
    const changed = old ? ['start', 'assist', 'tore', 'karten', 'tdr'].some(k => Number(old[k]) !== vals[k]) : true; // Admin ändert gegenüber Import: Zeile sperren
    await x.q(`insert into results(round_id,player_id,start,assist,tore,karten,tdr,locked,source) values($1,$2,$3,$4,$5,$6,$7,$8,'admin')
    on conflict(round_id,player_id) do update set start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten, tdr=excluded.tdr, locked=(results.locked or excluded.locked), source=case when excluded.locked then 'admin' else results.source end`, [roundId, pid, vals.start, vals.assist, vals.tore, vals.karten, vals.tdr, changed]); } });
  await audit(a.id, 'results', { roundId, managerId }); rev(); return ok('Resultate gespeichert'); });
export const unlockResultsAction = wrap(async (roundId) => { await requireAdmin(); await q('update results set locked=false where round_id=$1', [roundId]); rev(); return ok('Sperren aufgehoben, Import überschreibt wieder'); });
export const addCorrectionAction = wrap(async (roundId, managerId, text, delta) => { await requireAdmin(); if (!text) return fail('Text fehlt'); await q('insert into corrections(round_id,manager_id,text,delta) values($1,$2,$3,$4)', [roundId, managerId, text, JSON.stringify(delta || {})]); rev(); return ok('Korrektur gebucht'); });
export const deleteCorrectionAction = wrap(async (id) => { await requireAdmin(); await q('delete from corrections where id=$1', [id]); rev(); return ok('Gelöscht'); });

/* ---------- Admin: Gebote auflösen (Ziff. 7) ---------- */
export const previewBidsAction = wrap(async (roundId) => { await requireAdmin(); const round = await D.roundById(roundId); const b = await D.base();
  const bids = await q('select * from bids where round_id=$1', [roundId]); const list = await resolve(round, b, bids); return ok('Vorschau', { list }); });
async function resolve(round, b, bids) {
  const budgets = {}; for (const m of b.managerIds) budgets[m] = await D.budgetLeft(m);
  const prevRound = await one('select * from rounds where number < $1 order by number desc limit 1', [round.number]);
  const prevReleases = prevRound ? await q("select * from transfers where type='entlassung' and round_id=$1", [prevRound.id]) : [];
  const tiebreak = await D.tiebreakOrder(round, b);
  return R.resolveBids(bids.map(x => ({ ...x, price: Number(x.price) })), { players: b.players, budgetLeft: m => budgets[m], managerName: m => b.managerName[m], tiebreak, prevReleases });
}
export const applyBidsAction = wrap(async (roundId) => { const a = await requireAdmin(); const round = await D.roundById(roundId); if (round.bids_resolved) return fail('Bereits aufgelöst'); const b = await D.base();
  const bids = await q("select * from bids where round_id=$1", [roundId]); const list = await resolve(round, b, bids);
  await tx(async x => {
    for (const bid of list) {
      await x.q('update bids set status=$1, reason=$2 where id=$3', [bid.status, bid.reason || null, bid.id]);
      if (bid.status !== 'won') continue;
      const m = bid.manager_id, rel = b.players[bid.release_player_id];
      const id = `${b.managerName[m]}-${bid.player_name}-${round.number}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const contract = bid.price >= R.CONTRACT_MIN ? '1J' : null;
      // Positionen aus dem Spielerpool: Grundposition laut kicker-Kader, Zusatzpositionen aus Startaufstellungen dieser Saison (Ziff. 5.2)
      const { playerMatches } = await import('@/lib/kicker'); const poolRows = await x.q('select * from bl_players where club=$1', [bid.club]); const pp = poolRows.find(r => playerMatches(r.slug, r.name, bid.player_name));
      const basePos = (pp && pp.squad_pos) || bid.pos; const extra = pp ? [...new Set([...(pp.played_pos || []), bid.pos].filter(x => x && x !== basePos))] : (bid.pos !== basePos ? [bid.pos] : []);
      await x.q(`insert into players(id,manager_id,name,club,base_pos,extra_pos,price,slot,source,status,valid_from,jugend,contract,contract_mandatory) values($1,$2,$3,$4,$5,$6,$7,'bank','kauf','active',$8,false,$9,$10)`, [id, m, bid.player_name, bid.club, basePos, extra, bid.price, round.number, contract, !!contract]);
      await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'kauf',$3,$4,$5)", [round.id, m, bid.player_name, bid.price, `Gebot ${round.label}${contract ? ', Vertragspflicht (7.4), Laufzeit wählbar' : ''}`]);
      if (rel) { await x.q("update players set status='released', valid_to=$2 where id=$1", [rel.id, round.number - 1]); await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'entlassung',$3,$4,$5)", [round.id, m, rel.name, R.value(rel), `mit Gebot ${round.label}`]); }
      const lu = await x.one('select * from lineups where round_id=$1 and manager_id=$2', [round.id, m]);
      if (lu) { const e = { ...lu.entries }; const free = (lu.free_in || []).slice(); let ch = false;
        if (bid.swap_out_player_id && e[bid.swap_out_player_id]) { const pos = e[bid.swap_out_player_id].pos; delete e[bid.swap_out_player_id]; e[id] = { pos: pos === bid.pos ? pos : bid.pos }; free.push(id); ch = true; }
        if (rel && e[rel.id]) { delete e[rel.id]; ch = true; }
        if (ch) await x.q('update lineups set entries=$1, free_in=$2, updated_at=now() where round_id=$3 and manager_id=$4', [JSON.stringify(e), free, round.id, m]); }
    }
    await x.q('update rounds set bids_resolved=true where id=$1', [round.id]);
  });
  await audit(a.id, 'bids_applied', { roundId }); rev(); return ok(`Gebote aufgelöst: ${list.filter(x => x.status === 'won').length} Zuschläge`); });

/* ---------- Admin: Spieler, Buchungen ---------- */
export const manualBuyAction = wrap(async (prev, fd) => { const a = await requireAdmin(); const m = Number(fd.get('manager_id')), name = String(fd.get('name') || '').trim(), pos = String(fd.get('pos')), club = String(fd.get('club')), price = Number(fd.get('price')) || 0, from = Number(fd.get('valid_from')) || 0;
  if (!m || !name) return fail('Manager und Name'); const id = `${m}-${name}-${Date.now().toString(36)}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'); const contract = price >= R.CONTRACT_MIN ? '1J' : null;
  const r = from ? await one('select * from rounds where number=$1', [from]) : await D.openRound();
  await q("insert into players(id,manager_id,name,club,base_pos,price,slot,source,status,valid_from,jugend,contract,contract_mandatory) values($1,$2,$3,$4,$5,$6,'bank','kauf','active',$7,false,$8,$9)", [id, m, name, club || null, pos, price, r ? r.number : 1, contract, !!contract]);
  await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'kauf',$3,$4,'manuell (Admin)')", [r ? r.id : null, m, name, price]); await audit(a.id, 'manual_buy', { id }); rev(); return ok(`${name} gebucht`); });
export const releasePlayerAction = wrap(async (pid) => { const a = await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); const open = await D.openRound(); const last = await one('select * from rounds where number < $1 order by number desc limit 1', [open ? open.number : 9999]);
  await q("update players set status='released', valid_to=$2 where id=$1", [pid, last ? last.number : 0]); await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'entlassung',$3,$4,'manuell (Admin)')", [last ? last.id : null, p.manager_id, p.name, R.value(p)]); await audit(a.id, 'release', { pid }); rev(); return ok(`${p.name} entlassen`); });
export const abgangPlayerAction = wrap(async (pid) => { const a = await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); const open = await D.openRound(); const last = await one('select * from rounds where number < $1 order by number desc limit 1', [open ? open.number : 9999]);
  await q("update players set status='abgang', valid_to=$2 where id=$1", [pid, last ? last.number : 0]); await q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'gutschrift',$3,$4)", [p.manager_id, last ? last.id : null, R.value(p), `Abgang ${p.name} aus der Bundesliga (Ziff. 7.4)`]); await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'abgang',$3,$4,'Wert dem Kaufbudget gutgeschrieben')", [last ? last.id : null, p.manager_id, p.name, R.value(p)]); await audit(a.id, 'abgang', { pid }); rev(); return ok(`Abgang ${p.name} gebucht`); });
export const addPositionAction = wrap(async (pid, pos) => { await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); const set = new Set([...(p.extra_pos || []), pos]); set.delete(p.base_pos); await q('update players set extra_pos=$1 where id=$2', [[...set], pid]); rev(); return ok(`${p.name}: Zusatzposition ${pos}`); });
export const setContractAction = wrap(async (pid, contract) => { await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (p.contract_mandatory && !contract) return fail('Vertragspflicht (Neueinkauf ≥ 20) kann nicht aufgelöst werden (Ziff. 7.4)'); await q('update players set contract=$1 where id=$2', [contract || null, pid]); rev(); return ok('Vertrag gesetzt'); });
export const setJugendAction = wrap(async (pid, on) => { await requireAdmin(); await q('update players set jugend=$1 where id=$2', [!!on, pid]); rev(); return ok('Jugendstatus gesetzt'); });
export const ledgerAction = wrap(async (prev, fd) => { const a = await requireAdmin(); const m = Number(fd.get('manager_id')), type = String(fd.get('type')), amount = Number(fd.get('amount')), text = String(fd.get('text') || ''); if (!m || !amount) return fail('Manager und Betrag'); const open = await D.openRound();
  await q('insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,$3,$4,$5)', [m, open ? open.id : null, type, amount, text]); await audit(a.id, 'ledger', { m, type, amount }); rev(); return ok('Buchung erfasst'); });
export const setPaidAction = wrap(async (managerId, paid) => { await requireAdmin(); await q('insert into finance(manager_id,paid) values($1,$2) on conflict(manager_id) do update set paid=excluded.paid', [managerId, Number(paid) || 0]); rev(); return ok('Zahlung gespeichert'); });
export const poolPasteAction = wrap(async (prev, fd) => { const a = await requireAdmin(); const text = String(fd.get('text') || ''); let n = 0;
  for (const line of text.split(/\r?\n/)) { const [name, club, pos] = line.split(/[;,\t]/).map(x => (x || '').trim()); if (!name) continue;
    const slug = 'man-' + name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-') + (club ? '-' + club.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '');
    await q("insert into bl_players(slug,name,club,pos,games) values($1,$2,$3,$4,0) on conflict(slug) do update set club=coalesce(excluded.club, bl_players.club), pos=coalesce(excluded.pos, bl_players.pos), updated_at=now()", [slug, name, club || null, pos && 'TVMS'.includes(pos.toUpperCase()) ? pos.toUpperCase() : null]); n++; }
  await audit(a.id, 'pool_paste', { n }); rev(); return ok(`${n} Spieler im Pool ergänzt`); });
export const syncSquadsAction = wrap(async () => { const a = await requireAdmin(); const { syncSquads } = await import('@/lib/squads'); const b = await D.base();
  try { const r = await syncSquads(b); await audit(a.id, 'squads_sync', { players: r.players }); rev(); return ok(`${r.players} Spieler in ${r.clubs} Kadern, ${r.log.length} Änderungen${r.errors.length ? ' · Fehler: ' + r.errors.join('; ') : ''}`); }
  catch (e) { return fail(e.message + ' – Rückfall: Kader-JSON einfügen'); } });
export const squadsJsonAction = wrap(async (prev, fd) => { const a = await requireAdmin(); const { applySquads } = await import('@/lib/squads'); const b = await D.base();
  let data; try { data = JSON.parse(String(fd.get('json') || '')); } catch { return fail('Kein gültiges JSON'); }
  const squads = data.squads || data; if (typeof squads !== 'object' || !Object.keys(squads).length) return fail('JSON ohne Kader');
  const r = await applySquads(squads, b, 'JSON (Admin)'); await audit(a.id, 'squads_json', { players: r.players }); rev();
  return ok(`${r.players} Spieler in ${r.clubs} Kadern übernommen, ${r.log.length} Änderungen`); });
export const setVorsaisonAction = wrap(async (list) => { await requireAdmin(); await setSetting('vorsaison_reihenfolge', list); rev(); return ok('Reihenfolge gespeichert'); });

/* ---------- Admin: Tore aus OpenLigaDB übernehmen ---------- */
export const importGoalsAction = wrap(async (roundId) => { const a = await requireAdmin(); const b = await D.base();
  await syncCurrent().catch(() => {});
  const r = await importGoals(roundId, b.players, b.teamToClub); await audit(a.id, 'goals_import', { roundId, n: r.assigned.length }); rev();
  return ok(`Tore übernommen: ${r.assigned.map(x => `${x.player} ${x.tore}`).join(', ') || 'keine'}${r.unmatched.length ? ' · mehrdeutig: ' + r.unmatched.map(u => u.name).join(', ') : ''}`); });

/* ---------- Admin: kicker-Import (Startelf, Wechsel, Tore, Vorlagen, Karten, Elf des Tages) ---------- */
export const importKickerAction = wrap(async (roundId) => { const a = await requireAdmin(); const round = await D.roundById(roundId); if (!round) return fail('Runde?'); const b = await D.base();
  await D.ensureLineups(round, b);
  const r = await importRound(round, b); await audit(a.id, 'kicker_import', { roundId }); rev();
  return ok(r.log.join(' · ')); });
export const importKickerHtmlAction = wrap(async (roundId, htmlAufstellung, htmlElf) => { const a = await requireAdmin(); const round = await D.roundById(roundId); if (!round) return fail('Runde?'); const b = await D.base();
  await D.ensureLineups(round, b);
  const pages = {}; const paths = [];
  for (const [i, h] of (htmlAufstellung || []).entries()) { if (!h || !h.trim()) continue; const path = `/paste-${i}`; pages[`${path}/aufstellung`] = h; paths.push(path); }
  if (htmlElf && htmlElf.trim()) pages['elf'] = htmlElf;
  if (!paths.length && !pages.elf) return fail('Kein HTML eingefügt');
  const fetcher = async url => { const u = new URL(url); if (u.pathname.includes('/elf-des-tages/')) { if (pages.elf) return pages.elf; throw new Error('keine Elf-des-Tages-Seite eingefügt'); } if (pages[u.pathname]) return pages[u.pathname]; throw new Error('nicht eingefügt: ' + u.pathname); };
  const r = await importRound(round, b, fetcher, { paths, partial: true }); await audit(a.id, 'kicker_import_paste', { roundId, n: paths.length }); rev();
  return ok(r.log.join(' · ')); });
export const removePositionAction = wrap(async (pid, pos) => { await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); if (pos === p.base_pos) return fail('Grundposition kann nicht entfernt werden'); await q('update players set extra_pos=array_remove(extra_pos,$1) where id=$2', [pos, pid]); rev(); return ok(`${p.name}: Zusatzposition ${pos} entfernt`); });
