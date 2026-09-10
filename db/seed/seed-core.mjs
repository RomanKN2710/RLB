/* Seed-Logik (Runde 1 aus dem Excel, Admin-Konto). Wird vom Skript scripts/seed.mjs und von /api/setup verwendet. */
import bcrypt from 'bcryptjs';

export async function runSeed(query, env, seedData, log = console.log) {
  const q = query; const S = seedData;
  /* Sammelanweisung statt einer Abfrage pro Zeile. Gegen eine Datenbank im Netz zaehlt
     die Zahl der Hin- und Rueckwege, nicht die Rechenzeit: einzeln geschrieben braucht
     der Seed ueber 900 Abfragen und laeuft in die Zeitgrenze der Serverless-Funktion.
     Werte werden einzeln angehaengt, nie mit flat(), damit Array-Spalten wie extra_pos
     erhalten bleiben. */
  const many = async (table, cols, rows, tail = '', size = 150) => {
    for (let i = 0; i < rows.length; i += size) {
      const part = rows.slice(i, i + size); const params = [];
      const vals = part.map((row, r) => { for (const v of row) params.push(v); return '(' + cols.map((_, c) => '$' + (r * cols.length + c + 1)).join(',') + ')'; }).join(',');
      await q(`insert into ${table}(${cols.join(',')}) values ${vals} ${tail}`, params);
    }
  };
  const ROUND1 = 10; // Rundennummer = Spieltag × 10
  const norm = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g, '');

  // Manager
  const mid = {};
  for (const [i, name] of S.managers.entries()) { const r = await q('insert into managers(name,sort) values($1,$2) on conflict(name) do update set sort=excluded.sort returning id', [name, i]); mid[name] = r[0].id; }
  // Vereine
  for (const cl of S.clubs) await q('insert into clubs(id,oldb_team_id) values($1,$2) on conflict(id) do update set oldb_team_id=excluded.oldb_team_id', [cl.id, cl.oldb]);
  // Runde 1 + Spiele
  let r1 = (await q("select * from rounds where type='regulaer' and matchday=1"))[0];
  if (!r1) r1 = (await q("insert into rounds(number,type,label,matchday,status,tdr,sdt,bids_resolved) values($1,'regulaer','Spieltag 1',1,'final',$2,$3,true) returning *", [ROUND1, S.round1.tdr, S.round1.sdt]))[0];
  for (const m of S.matches) await q('insert into matches(id,matchday,round_id,kickoff,team1,team2,finished,goals1,goals2) values($1,1,$2,$3,$4,$5,true,$6,$7) on conflict(id) do update set round_id=excluded.round_id, finished=true, goals1=excluded.goals1, goals2=excluded.goals2', [m.id, r1.id, m.kickoff, m.team1, m.team2, m.g1, m.g2]);
  await q("update rounds set match_ids=(select coalesce(array_agg(id),'{}') from matches where round_id=$1), deadline=(select min(kickoff) - interval '90 minutes' from matches where round_id=$1) where id=$1", [r1.id]);
  // Spieler
  const inLineup = new Set(Object.keys(S.round1.entries));
  const playerRows = S.players.map(p => {
    const parts = String(p.pos).split('/').map(x => x.trim().toUpperCase().charAt(0)).filter(x => 'TVMS'.includes(x) && x);
    const base = parts[0] || 'M', extra = parts.slice(1).filter(x => x !== base);
    const jugend = p.slot === 'bank' && p.source === 'draft' && p.status === 'active' && !inLineup.has(p.id);
    return [p.id, mid[p.manager], p.name, p.club, base, extra, p.price, p.slot, p.source === 'kauf' ? 'kauf' : 'draft', p.status === 'released' ? 'released' : 'active', ROUND1, p.status === 'released' ? 0 : null, jugend];
  });
  await many('players', ['id','manager_id','name','club','base_pos','extra_pos','price','slot','source','status','valid_from','valid_to','jugend'], playerRows, 'on conflict(id) do nothing');
  // Aufstellungen + Resultate Runde 1
  const byMgr = {}; for (const [pid, e] of Object.entries(S.round1.entries)) { const p = S.players.find(x => x.id === pid); (byMgr[p.manager] ||= {})[pid] = { pos: String(p.pos).split('/')[0].trim().toUpperCase().charAt(0), e }; }
  const resultRows = [];
  for (const [mname, ent] of Object.entries(byMgr)) {
    const entries = {}; for (const [pid, v] of Object.entries(ent)) entries[pid] = { pos: v.pos };
    await q('insert into lineups(round_id,manager_id,entries,free_in) values($1,$2,$3,$4) on conflict do nothing', [r1.id, mid[mname], JSON.stringify(entries), []]);
    resultRows.push(...Object.entries(ent).map(([pid, v]) => [r1.id, pid, v.e.start, v.e.assist, v.e.tore, v.e.karten, v.e.tdr]));
  }
  await many('results', ['round_id','player_id','start','assist','tore','karten','tdr'], resultRows, 'on conflict do nothing');
  for (const k of S.round1.korrekturen) { const ex = await q('select 1 from corrections where round_id=$1 and text=$2', [r1.id, k.text]); if (!ex.length) await q('insert into corrections(round_id,manager_id,text,delta) values($1,$2,$3,$4)', [r1.id, mid[k.manager], k.text + ' (bereits in den Werten enthalten)', '{}']); }
  // Zusatzposten (+20) als Vertragsauflösung, Käufe/Entlassungen
  for (const [mname, extras] of Object.entries(S.extras)) for (const x of extras) { const ex = await q("select 1 from ledger where manager_id=$1 and type='vertragsaufloesung' and text=$2", [mid[mname], x.label]); if (!ex.length) await q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'vertragsaufloesung',$3,$4)", [mid[mname], r1.id, x.amount, x.label]); }
  for (const [mname, amt] of Object.entries(S.draftCost || {})) { const ex = await q("select 1 from ledger where manager_id=$1 and type='draft'", [mid[mname]]); if (!ex.length) await q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'draft',$3,'Draft Phase 1 (Blatt Draft)')", [mid[mname], r1.id, amt]); }
  for (const t of S.transfers) { const ex = await q('select 1 from transfers where manager_id=$1 and type=$2 and player_name=$3', [mid[t.manager], t.type, t.player]); if (!ex.length) await q('insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,$3,$4,$5,$6)', [t.type === 'kauf' ? r1.id : null, mid[t.manager], t.type, t.player, t.price, t.note]); }
  for (const name of S.managers) await q('insert into finance(manager_id,paid) values($1,0) on conflict do nothing', [mid[name]]);
  await q("insert into settings(key,value) values('vorsaison_reihenfolge',$1) on conflict(key) do nothing", [JSON.stringify(S.wechsel)]);
  await q("insert into settings(key,value) values('rest_draft',$1) on conflict(key) do nothing", [JSON.stringify(S.restDraft)]);
  // Admin
  const users = await q('select count(*)::int as n from users');
  if (users[0].n === 0) {
    const email = env.ADMIN_EMAIL, pw = env.ADMIN_PASSWORD;
    if (!email || !pw) log('Kein Admin angelegt: ADMIN_EMAIL/ADMIN_PASSWORD setzen');
    else { await q("insert into users(email,name,role,manager_id,password_hash,must_change_pw) values($1,'Admin','admin',$2,$3,true)", [email.toLowerCase(), env.ADMIN_MANAGER ? mid[env.ADMIN_MANAGER] || null : null, await bcrypt.hash(pw, 10)]); log('Admin angelegt: ' + email); }
  }
  if (env.DEMO_MANAGER_PASSWORD) { for (const name of S.managers) { const email = `${norm(name).toLowerCase()}@rlb.local`; await q("insert into users(email,name,role,manager_id,password_hash,must_change_pw) values($1,$2,'manager',$3,$4,false) on conflict(email) do nothing", [email, name, mid[name], await bcrypt.hash(env.DEMO_MANAGER_PASSWORD, 10)]); } log('Demo-Manager-Konten: <name>@rlb.local'); }
  log('Seed fertig');
}
