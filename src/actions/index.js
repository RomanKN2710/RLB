'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { q, one, tx, audit, setSetting, getSetting, dbHint } from '@/lib/db';
import { login, clearSession, requireUser, requireAdmin, hashPassword } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { syncTeams, syncSchedule, syncCurrent, refreshDeadlines } from '@/lib/oldb';
import { importPages, playerMatches, ensureColumns as ensureKickerColumns } from '@/lib/kicker';
import { parseLineupText } from '@/lib/aufstellungstext';
import * as BlogImport from '@/lib/blog-import';
import * as Blog from '@/lib/blog-archiv';
import { waitUntil } from '@vercel/functions';
import { createReport as berichtCreate } from '@/lib/bericht';
import * as Inbox from '@/lib/kicker-inbox';
import * as HOF from '@/lib/halloffame';

const ok = (msg, extra) => ({ ok: true, msg, ...extra });
const fail = msg => ({ ok: false, msg });
const wrap = fn => async (...a) => { try { return await fn(...a); } catch (e) { return fail(e.message || String(e)); } };
const rev = () => ['/', '/aufstellung', '/markt', '/kader', '/abrechnung', '/admin'].forEach(p => revalidatePath(p, 'layout'));

/* ---------- Auth ---------- */
export async function loginAction(prev, fd) {
  let u;
  // Der Datenbankteil braucht einen eigenen try-Block: redirect() weiter unten wirft
  // selbst eine Ausnahme, die nicht abgefangen werden darf.
  try {
    u = await login(String(fd.get('email') || ''), String(fd.get('password') || ''));
  } catch (e) { return fail(dbHint(e)); }
  if (!u) return fail('E-Mail oder Passwort falsch');
  await audit(u.id, 'login', {});
  redirect(u.must_change_pw ? '/konto?first=1' : '/');
}
export async function logoutAction() { clearSession(); redirect('/login'); }
export const changePasswordAction = wrap(async (prev, fd) => {
  const u = await requireUser(); const pw = String(fd.get('password') || ''), pw2 = String(fd.get('password2') || ''), cur = String(fd.get('current') || '');
  const row = await one('select password_hash from users where id=$1', [u.id]); const bcrypt = (await import('bcryptjs')).default;
  if (!row || !(await bcrypt.compare(cur, row.password_hash))) return fail('Aktuelles Passwort stimmt nicht');
  if (pw.trim().length < 8) return fail('Mindestens 8 Zeichen (ohne Leerzeichen am Rand)'); if (pw !== pw2) return fail('Passwörter stimmen nicht überein');
  if (pw === cur) return fail('Das neue Passwort muss sich vom aktuellen unterscheiden');
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
  // Spieler mit mehreren Positionen: immer die Position, mit der die Elf regelkonform ist
  const fit = R.fitPositions(clean, b.players); const umgestellt = [];
  if (fit) for (const [pid, pos] of Object.entries(fit.changes)) { umgestellt.push(`${b.players[pid].name} als ${pos}`); clean[pid] = { pos }; }
  const probleme = R.posProblems(clean, b.players); if (probleme.length) return fail(`Unzulässige Aufstellung (Ziff. 5.1): ${probleme.join('; ')}`);
  await BlogImport.writeLineup(u, roundId, managerId, clean); rev();
  return ok('Aufstellung gespeichert' + (umgestellt.length ? ` – umgestellt, damit die Positionsregel stimmt: ${umgestellt.join(', ')}` : ''));
});

export const applyLineupTextAction = wrap(async (roundId, text) => { const u = await requireAdmin(); const r = await BlogImport.applyLineupPaste(u, roundId, text); rev(); return ok(r.msg); });
export const applyBidTextAction = wrap(async (roundId, text) => { const u = await requireAdmin(); const r = await BlogImport.applyBidPaste(u, roundId, text); rev(); return ok(r.msg); });
/** Blog in einem Rutsch: Posts ins Archiv, Aufstellungen und Gebote (jeweils nur die zulaessigen). */
export const previewBlogAction = wrap(async (roundId, text) => { await requireAdmin(); const r = await BlogImport.previewBlog(roundId, text); return ok(r.msg, r); });
export const applyBlogAction = wrap(async (roundId, text) => { const u = await requireAdmin(); const r = await BlogImport.applyBlog(u, roundId, text); rev(); revalidatePath('/archiv'); return ok(r.msg, r); });
export const previewLineupTextAction = wrap(async (roundId, text) => { await requireAdmin();
  const { parsed } = await BlogImport.parseLineupPaste(roundId, text);
  return ok(`${parsed.blocks.length} Manager erkannt, ${parsed.blocks.filter(x => x.ok).length} zulässig${parsed.missing.length ? ' · ohne Block: ' + parsed.missing.join(', ') : ''}${parsed.unclear.length ? ' · unklar: ' + parsed.unclear.join('; ') : ''}`, { blocks: parsed.blocks.map(x => ({ ...x, entries: undefined, ambiguous: undefined })), missing: parsed.missing, ohnePost: parsed.ohnePost, unclear: parsed.unclear, skipped: parsed.skipped, warnung: parsed.warnung }); });

/* ---------- Gebote (Manager: eigenes, offene Runde, bis Deadline) ---------- */
export const submitBidAction = wrap(async (prev, fd) => {
  const u = await requireUser(); const managerId = u.role === 'admin' ? Number(fd.get('manager_id')) : u.manager_id;
  if (!managerId) return fail('Kein Manager');
  const open = await D.openRound(); if (!open) return fail('Keine offene Runde');
  const bid = { player_name: String(fd.get('player_name') || '').trim(), club: String(fd.get('club') || ''), pos: String(fd.get('pos') || '').toUpperCase(), price: Number(fd.get('price')), release: String(fd.get('release') || ''), swap: String(fd.get('swap') || '') };
  if (!bid.player_name) return fail('Spielername fehlt'); if (!'TVMS'.includes(bid.pos) || !bid.pos) return fail('Position');
  if (!Number.isInteger(bid.price) || !(bid.price >= R.MIN_BID)) return fail(`Gebot in ganzen Franken, mindestens ${R.MIN_BID}`);
  { // Ziff. 7.3: eigener Abgang erst eine Runde später, sonst alter Wert als Mindestgebot
    const pr = await one("select t.* from transfers t join rounds r on r.id=t.round_id where t.type='entlassung' and lower(t.player_name)=lower($1) and r.number < $2 order by r.number desc limit 1", [bid.player_name, open.number]);
    const prevNo = await one('select number from rounds where number < $1 order by number desc limit 1', [open.number]);
    if (pr && prevNo && pr.round_id && (await one('select number from rounds where id=$1', [pr.round_id])).number === prevNo.number) {
      if (pr.manager_id === managerId) return fail(`${bid.player_name} hast du in der Vorrunde selbst entlassen: frühestens nächste Runde bieten (Ziff. 7.3)`);
      if (bid.price < Number(pr.price)) return fail(`Mindestgebot für ${bid.player_name} in dieser Runde: CHF ${Number(pr.price)} (alter Wert, Ziff. 7.3)`); } }
  const budget = await D.budgetLeft(managerId); if (bid.price > budget) return fail(`Kaufbudget reicht nicht (${budget} verfügbar, Ziff. 7.4)`);
  const rel = await one('select * from players where id=$1', [bid.release]); if (!rel || rel.manager_id !== managerId || rel.status !== 'active') return fail('Zu entlassender Spieler fehlt (Kader bleibt 22, Ziff. 7.1)');
  const own = await one("select p.*, m.name as mname from players p join managers m on m.id=p.manager_id where p.status='active' and lower(p.name)=lower($1) and ($2 = '' or p.club is null or p.club=$2)", [bid.player_name, bid.club]); if (own) return fail(`${own.name} steht bereits im Kader von ${own.mname}`);
  if (bid.swap) { const lu = (await one('select * from lineups where round_id=$1 and manager_id=$2', [open.id, managerId])) || (await D.prevLineup(open, managerId)); if (!lu || !lu.entries[bid.swap]) return fail('Eventualauftrag: der zu ersetzende Spieler steht nicht in deiner Aufstellung'); }
  await BlogImport.ensureBidColumns(); await q("delete from bids where round_id=$1 and manager_id=$2 and status='sealed'", [open.id, managerId]);
  await q(`insert into bids(round_id,manager_id,player_name,club,pos,price,release_player_id,swap_out_player_id,status,created_at,priority,max_wins,source) values($1,$2,$3,$4,$5,$6,$7,$8,'sealed',now(),1,1,'app')`,
    [open.id, managerId, bid.player_name, bid.club || null, bid.pos, bid.price, bid.release, bid.swap || null]);
  await audit(u.id, 'bid', { roundId: open.id, managerId }); rev();
  return ok('Gebot verdeckt gespeichert');
});
export const withdrawBidAction = wrap(async () => {
  const u = await requireUser(); const open = await D.openRound(); if (!open) return fail('Keine offene Runde');
  await q("delete from bids where round_id=$1 and manager_id=$2 and status='sealed'", [open.id, u.manager_id]); rev(); return ok('Gebot zurückgezogen');
});

/** Aufstellung einer Runde holen; fehlt sie, aus der letzten Vorrunde übernehmen (Ziff. 5.1) und speichern. */
async function materializeLineup(x, round, m, b) {
  const lu = await x.one('select * from lineups where round_id=$1 and manager_id=$2', [round.id, m]); if (lu) return lu;
  const prev = await x.one('select l.* from lineups l join rounds r on r.id=l.round_id where l.manager_id=$1 and r.number < $2 order by r.number desc limit 1', [m, round.number]); if (!prev) return null;
  const entries = {}; for (const [pid, e] of Object.entries(prev.entries || {})) { const p = b.players[pid]; if (p && p.manager_id === m && p.status === 'active' && R.playerValid(p, round.number)) entries[pid] = e; }
  await x.q('insert into lineups(round_id,manager_id,entries,free_in,updated_at) values($1,$2,$3,$4,now()) on conflict do nothing', [round.id, m, JSON.stringify(entries), []]);
  return x.one('select * from lineups where round_id=$1 and manager_id=$2', [round.id, m]);
}

/* ---------- Trades (Ziff. 6) ---------- */
export const proposeTradeAction = wrap(async (prev, fd) => {
  const u = await requireUser(); const from = u.manager_id; const to = Number(fd.get('to')); const give = fd.getAll('give').map(String), get = fd.getAll('get').map(String);
  if (!from || !to || from === to) return fail('Partner wählen'); if (!give.length || give.length !== get.length) return fail('Gleich viele Spieler auf beiden Seiten (Kader bleibt 22)');
  const ps = await q('select * from players where id = any($1)', [give.concat(get)]);
  if (give.some(id => !ps.find(p => p.id === id && p.manager_id === from && p.status === 'active'))) return fail('Eigene Spieler ungültig');
  if (get.some(id => !ps.find(p => p.id === id && p.manager_id === to && p.status === 'active'))) return fail('Spieler des Partners ungültig');
  const busy = await q("select id from trades where status='proposed' and (give && $1 or get_ && $1)", [give.concat(get)]);
  if (busy.length) return fail('Mindestens einer dieser Spieler steht schon in einem offenen Trade. Erst diesen abschliessen oder ablehnen.');
  await q('insert into trades(from_manager,to_manager,give,get_) values($1,$2,$3,$4)', [from, to, give, get]); rev(); return ok('Trade vorgeschlagen');
});
export const respondTradeAction = wrap(async (tradeId, accept) => {
  const u = await requireUser(); const t = await one('select * from trades where id=$1', [tradeId]); if (!t || t.status !== 'proposed') return fail('Trade nicht offen');
  const admin = u.role === 'admin';
  if (!accept) { if (!admin && u.manager_id !== t.to_manager && u.manager_id !== t.from_manager) return fail('Nicht beteiligt'); await q("update trades set status='rejected' where id=$1", [tradeId]); rev(); return ok('Trade abgelehnt'); }
  if (!admin && u.manager_id !== t.to_manager) return fail('Nur der angefragte Manager kann annehmen');
  const open = await D.openRound(); const roundId = open ? open.id : null;
  const cur = await q('select id, manager_id, status from players where id = any($1)', [t.give.concat(t.get_)]);
  if (t.give.some(id => !cur.find(p => p.id === id && p.manager_id === t.from_manager && p.status === 'active')) || t.get_.some(id => !cur.find(p => p.id === id && p.manager_id === t.to_manager && p.status === 'active'))) {
    await q("update trades set status='rejected' where id=$1", [tradeId]); rev(); return fail('Trade nicht mehr gültig: mindestens ein Spieler ist nicht mehr im ursprünglichen Kader. Trade wurde verworfen.'); }
  const b0 = open ? await D.base() : null;
  await tx(async x => {
    // Aufstellungen der offenen Runde vor dem Besitzwechsel sichern (sonst fiele der abgegebene Spieler beim Übertrag ersatzlos weg)
    if (open) for (const m of [t.from_manager, t.to_manager]) await materializeLineup(x, open, m, b0);
    await x.q("update players set manager_id=$1, source='trade' where id = any($2)", [t.to_manager, t.give]);
    await x.q("update players set manager_id=$1, source='trade' where id = any($2)", [t.from_manager, t.get_]);
    for (const m of [t.from_manager, t.to_manager]) await x.q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'trade',$3,$4)", [m, roundId, R.TRADE_FEE, `Trade #${t.id}`]);
    const names = async ids => (await x.q('select name from players where id=any($1)', [ids])).map(r => r.name).join(', ');
    await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'trade',$3,$4,$5)", [roundId, t.from_manager, await names(t.give), R.TRADE_FEE, 'erhält ' + await names(t.get_)]);
    await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'trade',$3,$4,$5)", [roundId, t.to_manager, await names(t.get_), R.TRADE_FEE, 'erhält ' + await names(t.give)]);
    // Ziff. 6: Die erworbenen Spieler ersetzen provisorisch die Aufstellungsstelle inkl. Position der abgegebenen
    // (paarweise: give[i] gegen get[i]); das ist kein kostenpflichtiger Wechsel (free_in). Passt die Position nicht
    // zum neuen Spieler, faellt die Stelle weg und der Manager muss vor der Deadline nachbessern.
    if (open) { const rows = await x.q('select * from players where id = any($1)', [t.give.concat(t.get_)]); const P = Object.fromEntries(rows.map(p => [p.id, p]));
      for (const [m, out, inn] of [[t.from_manager, t.give, t.get_], [t.to_manager, t.get_, t.give]]) {
        const lu = await x.one('select * from lineups where round_id=$1 and manager_id=$2', [open.id, m]); if (!lu) continue;
        const e = { ...lu.entries }; const free = (lu.free_in || []).slice();
        out.forEach((id, i) => { if (!e[id]) return; const pos = e[id].pos; delete e[id]; const np = P[inn[i]]; if (np && R.positionsOf(np).includes(pos)) { e[np.id] = { pos }; free.push(np.id); } });
        await x.q('update lineups set entries=$1, free_in=$2, updated_at=now() where round_id=$3 and manager_id=$4', [JSON.stringify(e), free, open.id, m]); } }
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
/* Team der Runde / Spieler des Tages von Hand: Namen werden gegen die Aufstellungen der Runde aufgelöst und als TdR-Punkte
   geschrieben (Elf des Tages 1, Spieler des Tages zusätzlich 1). Nicht zuordenbare Namen werden gemeldet. */
export const roundInfoAction = wrap(async (roundId, tdr, sdt, label) => { const a = await requireAdmin(); const round = await D.roundById(roundId); if (!round) return fail('Runde?');
  if (String(tdr || '').trim() && !(round.deadline && new Date(round.deadline) <= new Date())) return fail('Team der Runde erst nach der Deadline erfassen');
  if (String(tdr || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean).length > 11) return fail('Höchstens 11 Namen (der Spieler des Tages kommt ins eigene Feld)');
  const b = await D.base(); await D.ensureLineups(round, b);
  const lus = await q('select l.*, m.name as manager_name from lineups l join managers m on m.id=l.manager_id where round_id=$1', [roundId]);
  const inLineup = []; lus.forEach(l => Object.keys(l.entries || {}).forEach(pid => { const p = b.players[pid]; if (p) inLineup.push({ ...p, manager_name: l.manager_name }); }));
  const names = String(tdr || '').split(/[,;\n]/).map(x => x.trim()).filter(Boolean);
  const findAll = txt => { const m = txt.match(/^(.*?)\s*\(([^)]+)\)\s*$/); const name = m ? m[1].trim() : txt; const club = m ? m[2].trim() : null;
    let hits = inLineup.filter(p => (!club || R.norm(p.club) === R.norm(club) || R.norm(p.club).includes(R.norm(club))) && (R.norm(p.name) === R.norm(name) || playerMatches(name.toLowerCase().replace(/\s+/g, '-'), name, p.name) || playerMatches(p.name.toLowerCase().replace(/\s+/g, '-'), p.name, name)));
    return { name, hits }; };
  const tdrPids = new Set(); const notes = [];
  const lev = (x, y) => { const d = Array.from({ length: x.length + 1 }, (_, i) => [i, ...Array(y.length).fill(0)]); for (let j = 1; j <= y.length; j++) d[0][j] = j; for (let i = 1; i <= x.length; i++) for (let j = 1; j <= y.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (x[i - 1] === y[j - 1] ? 0 : 1)); return d[x.length][y.length]; };
  const nearest = name => { const n = R.norm(name.split(' ').pop()); return inLineup.map(p => ({ p, d: lev(n, R.norm(p.name.split(' ').pop())) })).filter(x => x.d <= 2).sort((a, b2) => a.d - b2.d).slice(0, 2).map(x => `${x.p.name} (${x.p.club}, ${x.p.manager_name})`); };
  for (const n of names) { const { name, hits } = findAll(n); if (hits.length === 1) tdrPids.add(hits[0].id); else if (hits.length > 1) notes.push(`«${name}» mehrdeutig (${hits.map(h => h.name + ', ' + h.manager_name).join(' / ')}) – mit Verein in Klammern angeben`); else { const near = nearest(name); notes.push(`«${name}» in keiner Aufstellung (kein TdR-Punkt)${near.length ? ' – meintest du ' + near.join(' oder ') + '?' : ''}`); } }
  let sdtPid = null; if (sdt && sdt.trim()) { const { name, hits } = findAll(sdt.trim()); if (hits.length === 1) sdtPid = hits[0].id; else if (hits.length > 1) notes.push(`Spieler des Tages «${name}» mehrdeutig`); else notes.push(`Spieler des Tages «${name}» in keiner Aufstellung`); }
  let written = 0;
  for (const p of inLineup) { const v = (tdrPids.has(p.id) ? 1 : 0) + (sdtPid === p.id ? 1 : 0);
    const r = v > 0 ? await one(`insert into results(round_id,player_id,tdr,source) values($1,$2,$3,'admin') on conflict(round_id,player_id) do update set tdr=excluded.tdr where results.tdr is distinct from excluded.tdr returning player_id`, [roundId, p.id, v])
      : await one('update results set tdr=0 where round_id=$1 and player_id=$2 and tdr<>0 returning player_id', [roundId, p.id]); if (r) written++; }
  await q("update rounds set tdr=$1, sdt=$2, label=coalesce(nullif($3,''),label) where id=$4", [names, sdt || null, label || '', roundId]);
  await audit(a.id, 'round_tdr_manual', { roundId, n: tdrPids.size, sdt: sdtPid }); rev();
  return ok(`Team der Runde: ${tdrPids.size} von ${names.length} Namen in Aufstellungen${sdtPid ? ', Spieler des Tages +1' : ''}, ${written} TdR-Werte geändert.${notes.length ? ' ' + notes.join(' · ') : ''}`); });
export const finalizeRoundAction = wrap(async (roundId, final) => { const a = await requireAdmin(); await q('update rounds set status=$1 where id=$2', [final ? 'final' : 'open', roundId]); await audit(a.id, 'round_status', { roundId, final });
  // Ziff. 4.3.4: Jugendspieler verlieren den Status, wenn sie in eine gültige (gewertete) Aufstellung berufen wurden
  if (final) await q("update players set jugend=false where jugend and id in (select jsonb_object_keys(entries) from lineups where round_id=$1)", [roundId]);
  rev();
  if (!final) return ok('Runde wieder geöffnet');
  // Spieltagsbericht entsteht im Hintergrund (eigene Funktion mit längerer Laufzeit)
  const base = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'http://127.0.0.1:' + (process.env.PORT || 3000));
  if (process.env.CRON_SECRET) waitUntil(fetch(`${base}/api/bericht?round_id=${roundId}&key=${process.env.CRON_SECRET}`, { method: 'POST' }).catch(e => console.error('Bericht', e.message)));
  return ok('Runde abgeschlossen. Der Spieltagsbericht wird jetzt erstellt (Seite «Bericht»).'); });
export const berichtAction = wrap(async (roundId, opts = {}) => { await requireAdmin(); try { const log = await berichtCreate(roundId, opts); revalidatePath('/bericht'); return ok(log.join(' · ')); } catch (e) { revalidatePath('/bericht'); return fail(e.message); } });
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
export const previewBidsAction = wrap(async (roundId) => { await requireAdmin(); await BlogImport.ensureBidColumns(); const round = await D.roundById(roundId); const b = await D.base();
  const bids = await q('select * from bids where round_id=$1 order by manager_id, priority', [roundId]); const list = await BlogImport.resolveRoundBids(round, b, bids); return ok('Vorschau', { list: list.map(x => ({ ...x, manager_name: b.managerName[x.manager_id], release_name: (b.players[x.release_player_id] || {}).name || null, swap_name: (b.players[x.swap_out_player_id] || {}).name || null })) }); });
export const previewBidTextAction = wrap(async (roundId, text) => { await requireAdmin(); const { parsed } = await BlogImport.parseBidPaste(roundId, text);
  return ok(`${parsed.blocks.length} Manager mit Geboten erkannt, ${parsed.blocks.filter(x => x.ok).length} zulässig${parsed.unclear.length ? ' · unklar: ' + parsed.unclear.join('; ') : ''}`, { blocks: parsed.blocks.map(x => ({ managerId: x.managerId, name: x.name, title: x.title, maxWins: x.maxWins, budget: x.budget, ok: x.ok, problems: x.problems, notes: x.notes, unmatched: x.unmatched, bisher: x.bisher, resolved: x.resolved, releases: x.releases.map(p => p.name), bids: x.bids.map(bd => ({ priority: bd.priority, player_name: bd.player_name, club: bd.club, pos: bd.pos, price: bd.price, release: bd.release?.name || null, swapOut: bd.swapOut?.name || null, pool: bd.pool || null, poolNote: bd.poolNote || null })) })), unclear: parsed.unclear, skipped: parsed.skipped }); });

export const applyBidsAction = wrap(async (roundId) => { const a = await requireAdmin(); const round = await D.roundById(roundId); if (round.bids_resolved) return fail('Bereits aufgelöst'); const b = await D.base();
  await BlogImport.ensureBidColumns(); const bids = await q("select * from bids where round_id=$1 order by manager_id, priority", [roundId]); const list = await BlogImport.resolveRoundBids(round, b, bids);
  const usedRel = new Set();
  await tx(async x => {
    for (const bid of list) {
      await x.q('update bids set status=$1, reason=$2 where id=$3', [bid.status, bid.reason || null, bid.id]);
      if (bid.status !== 'won') continue;
      // Entlassung: je Gebot genannt, sonst die naechste freie aus der Reihenfolge-Liste des Managers
      const m = bid.manager_id; let relId = bid.release_player_id; if (!relId) relId = (bid.release_order || []).find(pid => !usedRel.has(pid) && b.players[pid] && b.players[pid].status === 'active' && b.players[pid].manager_id === m) || null;
      if (relId) { usedRel.add(relId); if (!bid.release_player_id) await x.q('update bids set release_player_id=$1 where id=$2', [relId, bid.id]); }
      const rel = b.players[relId];
      const id = `${b.managerName[m]}-${bid.player_name}-${round.number}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const contract = bid.price >= R.CONTRACT_MIN ? '1J' : null;
      // Positionen aus dem Spielerpool: Grundposition laut kicker-Kader, Zusatzpositionen aus Startaufstellungen dieser Saison (Ziff. 5.2)
      const { playerMatches } = await import('@/lib/kicker'); const poolRows = await x.q('select * from bl_players where club=$1', [bid.club]); const pp = poolRows.find(r => playerMatches(r.slug, r.name, bid.player_name));
      const basePos = (pp && pp.squad_pos) || bid.pos; const extra = pp ? [...new Set((pp.played_pos || []).filter(x => x && x !== basePos))] : [];   // Zusatzpositionen nur aus kicker-Startelf (Ziff. 5.2), nie aus dem Gebot
      await x.q(`insert into players(id,manager_id,name,club,base_pos,extra_pos,price,slot,source,status,valid_from,jugend,contract,contract_mandatory) values($1,$2,$3,$4,$5,$6,$7,'bank','kauf','active',$8,false,$9,$10)`, [id, m, bid.player_name, bid.club, basePos, extra, bid.price, round.number, contract, !!contract]);
      await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'kauf',$3,$4,$5)", [round.id, m, bid.player_name, bid.price, `Gebot ${round.label}${contract ? ', Vertragspflicht (7.4), Laufzeit wählbar' : ''}`]);
      if (rel) { await x.q("update players set status='released', valid_to=$2 where id=$1", [rel.id, round.number - 1]); await x.q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'entlassung',$3,$4,$5)", [round.id, m, rel.name, R.value(rel), `mit Gebot ${round.label}`]); }
      const lu = await materializeLineup(x, round, m, b);
      if (lu) { const e = { ...lu.entries }; const free = (lu.free_in || []).slice(); let ch = false;
        if (bid.swap_out_player_id && e[bid.swap_out_player_id]) { const pos = e[bid.swap_out_player_id].pos; const can = [basePos, ...extra];
          const e2 = { ...e }; delete e2[bid.swap_out_player_id]; e2[id] = { pos: can.includes(pos) ? pos : basePos };
          const P2 = { ...b.players, [id]: { id, name: bid.player_name, base_pos: basePos, extra_pos: extra } }; const fit = R.fitPositions(e2, P2);   // passt die Position nicht: andere Spieler mit Zusatzposition umstellen
          if (fit) for (const [pid, p2] of Object.entries(fit.changes)) e2[pid] = { pos: p2 };
          if (!R.posCheck(e2, P2).bad.length) { Object.keys(e).forEach(k => delete e[k]); Object.assign(e, e2); free.push(id); ch = true; } }   // geht es nicht auf, bleibt die Aufstellung (Rundencheck meldet es)
        if (rel && e[rel.id]) { delete e[rel.id]; ch = true; }
        if (ch) await x.q('update lineups set entries=$1, free_in=$2, updated_at=now() where round_id=$3 and manager_id=$4', [JSON.stringify(e), free, round.id, m]); }
    }
    await x.q('update rounds set bids_resolved=true where id=$1', [round.id]);
  });
  await audit(a.id, 'bids_applied', { roundId }); rev(); return ok(`Gebote aufgelöst: ${list.filter(x => x.status === 'won').length} Zuschläge`); });

/* ---------- Admin: Spieler, Buchungen ---------- */
export const manualBuyAction = wrap(async (prev, fd) => { const a = await requireAdmin(); const m = Number(fd.get('manager_id')), name = String(fd.get('name') || '').trim(), pos = String(fd.get('pos')), club = String(fd.get('club')), price = Number(fd.get('price')) || 0, from = Number(fd.get('valid_from')) || 0;
  if (!m || !name) return fail('Manager und Name'); await ensureKickerColumns(); const id = `${m}-${name}-${Date.now().toString(36)}`.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-'); const contract = price >= R.CONTRACT_MIN ? '1J' : null;
  const r = from ? await one('select * from rounds where number=$1', [from]) : await D.openRound();
  // Positionen aus dem kicker-Pool: Grundposition laut Kaderliste, Zusatzpositionen laut bisherigen Startelf-Einsätzen (Ziff. 5.2)
  const pp = (await q('select * from bl_players where club=$1', [club])).find(x => playerMatches(x.slug, x.name, name));
  const basePos = (pp && pp.squad_pos) || pos; const extra = pp ? [...new Set((pp.played_pos || []).filter(x => x && x !== basePos))] : [];
  await q("insert into players(id,manager_id,name,club,base_pos,extra_pos,price,slot,source,status,valid_from,jugend,contract,contract_mandatory,kicker_slug) values($1,$2,$3,$4,$5,$6,$7,'bank','kauf','active',$8,false,$9,$10,$11)", [id, m, name, club || null, basePos, extra, price, r ? r.number : 1, contract, !!contract, pp ? pp.slug : null]);
  await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'kauf',$3,$4,'manuell (Admin)')", [r ? r.id : null, m, name, price]); await audit(a.id, 'manual_buy', { id }); rev(); return ok(`${name} gebucht`); });
export const releasePlayerAction = wrap(async (pid) => { const a = await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); const open = await D.openRound(); const last = await one('select * from rounds where number < $1 order by number desc limit 1', [open ? open.number : 9999]);
  const neu = open && (p.valid_from ?? 0) >= open.number; const tr = neu ? open : last;
  await q("update players set status='released', valid_to=$2 where id=$1", [pid, neu ? (p.valid_from - 1) : (last ? last.number : 0)]); await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'entlassung',$3,$4,'manuell (Admin)')", [tr ? tr.id : null, p.manager_id, p.name, R.value(p)]); await audit(a.id, 'release', { pid }); rev(); return ok(`${p.name} entlassen`); });
export const abgangPlayerAction = wrap(async (pid) => { const a = await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); const open = await D.openRound(); const last = await one('select * from rounds where number < $1 order by number desc limit 1', [open ? open.number : 9999]);
  await q("update players set status='abgang', valid_to=$2 where id=$1", [pid, last ? last.number : 0]); await q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'gutschrift',$3,$4)", [p.manager_id, last ? last.id : null, R.value(p), `Abgang ${p.name} aus der Bundesliga (Ziff. 7.4)`]); await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'abgang',$3,$4,'Wert dem Kaufbudget gutgeschrieben')", [last ? last.id : null, p.manager_id, p.name, R.value(p)]); await audit(a.id, 'abgang', { pid }); rev(); return ok(`Abgang ${p.name} gebucht`); });
/* Name (kicker-Schreibweise, damit der Import trifft) oder Verein eines Kaderspielers korrigieren */
export const editPlayerAction = wrap(async (pid, name, club) => { const a = await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?');
  const nm = String(name || '').trim() || p.name; const cl = String(club || '').trim() || p.club; const b = await D.base();
  if (cl !== p.club && !b.clubs.some(c => c.id === cl)) return fail(`Verein «${cl}» unbekannt – gültig: ${b.clubs.map(c => c.id).join(', ')}`);
  await q('update players set name=$1, club=$2 where id=$3', [nm, cl, pid]); await audit(a.id, 'player_edit', { pid, von: [p.name, p.club], nach: [nm, cl] }); rev();
  return ok(`${p.name} (${p.club}) → ${nm} (${cl})`); });
export const addPositionAction = wrap(async (pid, pos) => { await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); const set = new Set([...(p.extra_pos || []), pos]); set.delete(p.base_pos); await q('update players set extra_pos=$1 where id=$2', [[...set], pid]); rev(); return ok(`${p.name}: Zusatzposition ${pos}`); });
export const setContractAction = wrap(async (pid, contract) => { await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (p.contract_mandatory && !contract) return fail('Vertragspflicht (Neueinkauf ≥ 20) kann nicht aufgelöst werden (Ziff. 7.4)');
  if (contract) { const others = await q("select contract from players where manager_id=$1 and status='active' and contract is not null and id<>$2", [p.manager_id, pid]); const n2 = others.filter(x => x.contract === '2J').length + (contract === '2J' ? 1 : 0);
    if (others.length + 1 > 4) return fail('Höchstens 4 Verträge pro Manager (Ziff. 4.3.3)'); if (n2 > 2) return fail('Höchstens 2 Verträge über 2 Jahre (Ziff. 4.3.3)'); }
  await q('update players set contract=$1 where id=$2', [contract || null, pid]); rev(); return ok('Vertrag gesetzt'); });
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
/* ---------- Blog-Archiv ---------- */
export const blogImportAction = wrap(async (prev, fd) => { const a = await requireAdmin(); const text = String(fd.get('text') || ''); const date = String(fd.get('date') || '') || null;
  if (!text.trim()) return fail('Kein Text');
  const b = await D.base(); const rounds = await q("select * from rounds where type='regulaer' order by number");
  const posts = Blog.parseBlogText(text, { defaultDate: date }); if (!posts.length) return fail('Keine Einträge erkannt. Erwartet wird der Blog-Text (Titel, Text, «Eingestellt von … um HH:MM») oder der Textexport (### Titel / Datum: … | Autor: …).');
  const r = await Blog.importPosts(posts, b.managers, rounds, 'paste'); await audit(a.id, 'blog_import', { neu: r.neu, vorhanden: r.vorhanden }); rev(); revalidatePath('/archiv');
  return ok(`${posts.length} Einträge erkannt, ${r.neu} neu gespeichert, ${r.vorhanden} schon vorhanden.${r.log.length ? ' ' + r.log.join(' · ') : ''}`); });
export const blogMetaAction = wrap(async (id, kind, managerId, roundNumber) => { await requireAdmin(); await Blog.setPostMeta(id, { kind, manager_id: managerId ? Number(managerId) : null, round_number: roundNumber ? Number(roundNumber) : null }); revalidatePath('/archiv'); return ok('Gespeichert'); });
export const blogDeleteAction = wrap(async (id) => { await requireAdmin(); await Blog.deletePost(id); revalidatePath('/archiv'); return ok('Gelöscht'); });
/* ---------- Admin: kicker-Import (Startelf, Wechsel, Tore, Vorlagen, Karten, Elf des Tages) ---------- */
export const importKickerHtmlAction = wrap(async (roundId, htmlAufstellung, htmlElf, unlock = false) => { const a = await requireAdmin(); const round = await D.roundById(roundId); if (!round) return fail('Runde?');
  const matches = (htmlAufstellung || []).filter(h => h && h.trim()); const elf = htmlElf && htmlElf.trim() ? htmlElf : null;
  if (!matches.length && !elf) return fail('Kein Quelltext eingefügt');
  // Eingefügte Seiten landen im Eingang, damit der Import immer denselben Weg nimmt und wiederholbar ist
  for (const h of matches) await Inbox.savePage(h, { matchday: round.matchday }); if (elf) await Inbox.savePage(elf, { matchday: round.matchday });
  return importKickerInboxAction(roundId, unlock); });
/* Eingang (Handy oder eingefügter Quelltext) importieren */
export const importKickerInboxAction = wrap(async (roundId, unlock = false) => { const a = await requireAdmin(); const round = await D.roundById(roundId); if (!round) return fail('Runde?'); const b = await D.base();
  const pg = await Inbox.pages(round.matchday); if (!pg.matches.length && !pg.elf) return fail(`Eingang für Spieltag ${round.matchday} ist leer`);
  await D.ensureLineups(round, b);
  if (unlock) await q('update results set locked=false where round_id=$1', [round.id]);
  const r = await importPages(round, b, { matches: pg.matches, elf: pg.elf || null }); await audit(a.id, 'kicker_import', { roundId, games: r.games, elf: r.elf, counts: r.counts }); rev();
  const c = r.counts; const parts = [`${r.games} Spiele${r.elf ? ' + Elf des Tages' : ''}`, `Startelf ${c.startelf || 0}`, `eingewechselt ${c.eingewechselt || 0}`, `Bank ${c.bank || 0}`, `nicht im Kader ${c.nicht_im_kader || 0}`, `Name prüfen ${c.nicht_gefunden || 0}`, `Spiel fehlt ${c.spiel_fehlt || 0}`];
  if (r.errors.length) return fail(`Import mit ${r.errors.length} Problem(en): ${r.errors.join(' · ')} — ${parts.join(', ')}`);
  return ok(`Import ok: ${parts.join(', ')}`); });
export const importKickerInboxMatchdayAction = wrap(async (matchday, unlock = false) => { const round = await one("select * from rounds where type='regulaer' and matchday=$1", [matchday]); if (!round) return fail(`Keine Runde für Spieltag ${matchday}`); return importKickerInboxAction(round.id, unlock); });
export const clearKickerInboxMatchdayAction = wrap(async (matchday) => { await requireAdmin(); await Inbox.clear(matchday); rev(); return ok(`Eingang Spieltag ${matchday} geleert`); });
export const moveElfInboxAction = wrap(async (roundId, fromMatchday) => { await requireAdmin(); const round = await D.roundById(roundId); if (!round || !round.matchday) return fail('Runde?'); const n = await Inbox.moveElf(Number(fromMatchday), round.matchday); rev(); return n ? ok(`Elf des Tages von Spieltag ${fromMatchday} zu Spieltag ${round.matchday} verschoben – jetzt «Eingang importieren»`) : fail(`Unter Spieltag ${fromMatchday} liegt keine Elf des Tages`); });
export const clearKickerInboxAction = wrap(async (roundId) => { await requireAdmin(); const round = await D.roundById(roundId); if (!round) return fail('Runde?'); await Inbox.clear(round.matchday); rev(); return ok('Eingang geleert'); });
export const setKickerSlugAction = wrap(async (pid, slug) => { await requireAdmin(); await ensureKickerColumns(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); const v = String(slug || '').trim().toLowerCase().replace(/^https?:\/\/[^/]+\//, '').split('/')[0] || null;
  await q('update players set kicker_slug=$1 where id=$2', [v, pid]); rev(); return ok(v ? `${p.name}: kicker-Kennung ${v}` : `${p.name}: kicker-Kennung entfernt`); });
export const removePositionAction = wrap(async (pid, pos) => { await requireAdmin(); const p = await one('select * from players where id=$1', [pid]); if (!p) return fail('?'); if (pos === p.base_pos) return fail('Grundposition kann nicht entfernt werden'); await q('update players set extra_pos=array_remove(extra_pos,$1) where id=$2', [pos, pid]); rev(); return ok(`${p.name}: Zusatzposition ${pos} entfernt`); });

/* Hall of Fame: Endstand einer vergangenen Saison eintragen (Zeilen «1 Dani 55.5»), ersetzt die Saison komplett. */
export const hofImportAction = wrap(async (prev, fd) => { const a = await requireAdmin(); const season = String(fd.get('season') || '').trim(); const n = await HOF.importSeason(season, String(fd.get('text') || ''), String(fd.get('note') || '').trim());
  await audit(a.id, 'hof_import', { season, n }); revalidatePath('/hall-of-fame'); revalidatePath('/admin'); return ok(`Saison ${season}: ${n} Plätze gespeichert`); });
export const hofDeleteAction = wrap(async (season) => { const a = await requireAdmin(); await HOF.deleteSeason(season); await audit(a.id, 'hof_delete', { season }); revalidatePath('/hall-of-fame'); revalidatePath('/admin'); return ok('Saison gelöscht'); });
