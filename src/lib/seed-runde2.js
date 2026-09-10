/* Runde 2 aus dem Excel (db/seed/runde2.json) einmalig in die Datenbank übernehmen: Käufe, Entlassungen, Aufstellungen, Resultate, Vereinsergebnisse, Gutschriften. Idempotent (settings.runde2_seed). */
import { q, one, getSetting, setSetting } from './db';
import { norm } from './rules';

export async function applyRunde2(seed, log = () => {}) {
  const done = await getSetting('runde2_seed'); if (done) { log('Runde 2 bereits importiert (' + done.at + ')'); return done; }
  const md = seed.matchday || 2; const number = md * 10;
  const managers = await q('select * from managers'); const mid = {}; managers.forEach(m => mid[m.name] = m.id);
  let round = await one("select * from rounds where type='regulaer' and matchday=$1", [md]);
  if (!round) round = (await q("insert into rounds(number,type,label,matchday,status,tdr,sdt,bids_resolved) values($1,'regulaer',$2,$3,'open',$4,$5,true) returning *", [number, `Spieltag ${md}`, md, seed.tdr || [], seed.sdt || '']))[0];
  await q('update rounds set tdr=$2, sdt=$3, bids_resolved=true where id=$1', [round.id, seed.tdr || [], seed.sdt || '']);
  // Vereinsergebnisse: über die Spiele (OpenLigaDB-Sync) oder, falls Spiele noch ohne Resultat, aus dem Seed ableiten (Tore aus Punkten/Zu-null rekonstruiert: nur Punkte und Zu-null sind wertungsrelevant)
  const matches = await q('select m.*, c1.id as c1, c2.id as c2 from matches m left join clubs c1 on c1.oldb_team_id=m.team1 left join clubs c2 on c2.oldb_team_id=m.team2 where m.round_id=$1', [round.id]);
  for (const m of matches) { if (m.finished) continue; const a = seed.clubResults[m.c1], b = seed.clubResults[m.c2]; if (!a || !b) continue;
    const g1 = a.pts === 3 ? (b.cs ? 0 : 2) : a.pts === 1 ? (a.cs ? 0 : 1) : (b.cs ? 0 : 1), g2 = b.pts === 3 ? (a.cs ? 0 : 2) : b.pts === 1 ? (b.cs ? 0 : 1) : (a.cs ? 0 : 1);
    await q('update matches set finished=true, goals1=$2, goals2=$3 where id=$1', [m.id, g1, g2]); }
  const players = async () => q('select * from players');
  const findP = (list, m, name) => { const k = norm(name); const c = list.filter(p => p.manager_id === mid[m] && p.status === 'active' && (norm(p.name) === k || norm(p.name).startsWith(k) || k.startsWith(norm(p.name)))); return c.length === 1 ? c[0] : c.find(p => norm(p.name) === k) || null; };
  let list = await players(); const missing = [];
  for (const e of seed.entlassungen || []) { const p = findP(list, e.manager, e.name); if (!p) { missing.push('Entlassung ' + e.manager + ' ' + e.name); continue; }
    await q("update players set status='released', valid_to=$2 where id=$1", [p.id, number - 10]);
    await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'entlassung',$3,$4,'Import Excel Runde 2')", [round.id, mid[e.manager], p.name, e.price]); }
  for (const k of seed.kaeufe || []) { const id = `${norm(k.manager)}-${norm(k.name)}-r${md}`; const contract = k.price >= 20 ? '1J' : null;
    await q("insert into players(id,manager_id,name,club,base_pos,price,slot,source,status,valid_from,jugend,contract,contract_mandatory) values($1,$2,$3,$4,$5,$6,'bank','kauf','active',$7,false,$8,$9) on conflict(id) do nothing", [id, mid[k.manager], k.name, k.club, k.pos, k.price, number, contract, !!contract]);
    await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'kauf',$3,$4,'Import Excel Runde 2')", [round.id, mid[k.manager], k.name, k.price]); }
  for (const v of seed.vereinswechsel || []) { const p = findP(await players(), v.manager, v.name); if (p) await q('update players set club=$2 where id=$1', [p.id, v.club]); }
  list = await players();
  for (const [m, entries] of Object.entries(seed.lineups || {})) {
    const ent = {}; const free = [];
    for (const e of entries) { const p = findP(list, m, e.name); if (!p) { missing.push('Aufstellung ' + m + ' ' + e.name); continue; }
      ent[p.id] = { pos: e.pos };
      if ((seed.freeIn || {})[m]?.some(n => norm(n) === norm(e.name))) free.push(p.id);
      if (e.pos !== p.base_pos && !(p.extra_pos || []).includes(e.pos)) await q('update players set extra_pos = array_append(extra_pos, $1) where id=$2 and not ($1 = any(extra_pos))', [e.pos, p.id]);
      await q("insert into results(round_id,player_id,start,assist,tore,karten,tdr,source) values($1,$2,$3,$4,$5,$6,$7,'excel') on conflict(round_id,player_id) do update set start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten, tdr=excluded.tdr, source='excel'", [round.id, p.id, e.start, e.assist, e.tore, e.karten, e.tdr]); }
    await q('insert into lineups(round_id,manager_id,entries,free_in,updated_at) values($1,$2,$3,$4,now()) on conflict(round_id,manager_id) do update set entries=excluded.entries, free_in=excluded.free_in, updated_at=now()', [round.id, mid[m], JSON.stringify(ent), free]); }
  for (const g of seed.gutschriften || []) await q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'gutschrift',$3,$4)", [mid[g.manager], round.id, g.amount, g.text]);
  await q("update rounds set status='final' where id=$1", [round.id]);
  // Ohne Spiele in der Datenbank hat die Runde keine Deadline, und die Tabelle blendet sie
  // aus (sie zeigt nur Runden mit abgelaufener Deadline). Darum eine vorlaeufige setzen:
  // refreshDeadlines() ersetzt sie durch die echte, sobald der Spielplan geladen ist,
  // weil deadline_manual false bleibt.
  const mrows = await q('select count(*)::int as n from matches where round_id=$1', [round.id]);
  if (!mrows[0].n) {
    await q("update rounds set deadline=coalesce(deadline, now() - interval '1 day') where id=$1 and not deadline_manual", [round.id]);
    log('Runde 2: keine Spiele in der Datenbank – Vereinspunkte und Zu-null fehlen noch. Im Admin den Spielplan laden (OpenLigaDB), danach stimmen sie. Deadline vorlaeufig gesetzt, damit die Runde in der Tabelle erscheint.');
  }
  const info = { at: new Date().toISOString(), missing };
  await setSetting('runde2_seed', info);
  log(`Runde 2 importiert: ${(seed.kaeufe || []).length} Käufe, ${(seed.entlassungen || []).length} Entlassungen, ${Object.keys(seed.lineups || {}).length} Aufstellungen${missing.length ? ' · nicht zugeordnet: ' + missing.join(', ') : ''}`);
  return info;
}
