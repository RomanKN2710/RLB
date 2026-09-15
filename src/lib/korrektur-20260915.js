/* Einmalige Datenkorrektur vom 15.09.2026 nach dem Abgleich der App mit den Excel-Auswertungen der Runden 1-3
   und den kicker-Daten (Sitzung mit Roman). Idempotent: laeuft nur einmal (settings korrektur_20260915). */
import { q, one, setSetting, getSetting, audit } from './db';
import { posProblems } from './rules';

const RENAMES = [['Mark', 'Veermann', 'Veerman'], ['Arbi', 'Ulrich', 'Ullrich'], ['Mike', 'Amaimouni-E', 'Amaimouni-Echghouyab'], ['Röfe', 'Johanesson', 'Johannesson'], ['Mark', 'El Ouadih', 'El Ouahdi'], ['Röfe', 'Illic', 'Ilic']];
const CLUBFIX = [['Roman', 'Ibrahimovic', 'Augsburg']];
// Kaeufe Spieltag 3 laut Blog/Excel (Top-Blatt "Kaeufe"), Entlassungen dazu
const KAEUFE = [['Arbi', 'Doan', 'Frankfurt', 'M', 12], ['Pädi', 'Maksimovic', 'Leipzig', 'M', 4], ['Pädi', 'Grüll', 'Bremen', 'S', 3]];
const ENTLASSUNGEN = [['Arbi', 'Belocian'], ['Pädi', 'Vidovic'], ['Pädi', 'Ljubicic']];
// Arbis Aufstellung Spieltag 3 (Excel Data-Blatt; die Blog-Elf war unzulaessig)
const ARBI_ELF = [['Kobel', 'T'], ['Ryerson', 'V'], ['Bensebaini', 'V'], ['Scally', 'V'], ['Mensah', 'V'], ['Raum', 'V'], ['Nmecha', 'M'], ['Mokwa', 'M'], ['Doan', 'M'], ['Gregoritsch', 'S'], ['Lemperle', 'S']];
// Spieltag 2: kicker-verifizierte Werte, die der Excel-Import (gesperrt) ueberdeckt hatte
const R2 = [['Mark', 'Burger', { karten: 1 }], ['Mark', 'Miguel', { karten: 1 }], ['Lazar', 'Maza', { karten: 1 }], ['Dani', 'Vieira', { start: 2 }]];
// Spieltag 3: Werte aus dem Excel fuer Spieler, die beim kicker-Import noch nicht aufgestellt waren oder
// nicht erkannt wurden (Quelle 'excel', nicht gesperrt - ein erneuter kicker-Import ueberschreibt sie)
const R3 = [['Roman', 'Davies', { start: 2 }], ['David', 'El Aynaoui', { start: 1 }], ['Dani', 'Kübler', { start: 2 }], ['Dani', 'Banzuzi', { start: 1, assist: 1 }], ['Dani', 'Vagnoman', { start: 1 }],
  ['Pädi', 'Moore', { start: 1 }], ['Arbi', 'Mensah', { start: 1, karten: 1 }], ['Mark', 'Veerman', { start: 1 }], ['René', 'Ache', { start: 2 }], ['Arbi', 'Doan', { start: 1 }], ['Arbi', 'Lemperle', { start: 1 }], ['Arbi', 'Bensebaini', { start: 2 }]];

export async function applyKorrektur20260915(userId = null) {
  const done = await getSetting('korrektur_20260915'); if (done) return { done: true, log: ['Korrektur vom 15.09.2026 wurde bereits eingespielt am ' + done.at] };
  const log = []; const managers = await q('select * from managers'); const mid = n => { const m = managers.find(x => x.name === n); if (!m) throw new Error('Manager ' + n); return m.id; };
  const r3 = await one("select * from rounds where type='regulaer' and matchday=3"); const r2 = await one("select * from rounds where type='regulaer' and matchday=2");
  if (!r3 || !r2) throw new Error('Runden 2/3 nicht gefunden');
  const pl = async (m, name) => one("select * from players where manager_id=$1 and name=$2 and status='active'", [mid(m), name]);
  // 1) Namen (kicker-Schreibweise) und Verein
  for (const [m, from, to] of RENAMES) { const p = await pl(m, from); if (!p) { log.push(`${m} ${from}: nicht gefunden (schon umbenannt?)`); continue; } await q('update players set name=$1 where id=$2', [to, p.id]); log.push(`${m}: ${from} → ${to}`); }
  for (const [m, name, club] of CLUBFIX) { const p = await pl(m, name); if (!p) { log.push(`${m} ${name}: nicht gefunden`); continue; } if (p.club !== club) { await q('update players set club=$1 where id=$2', [club, p.id]); log.push(`${m}: ${name} Verein ${p.club} → ${club}`); } }
  // 2) Kaeufe und Entlassungen Spieltag 3
  for (const [m, name, club, pos, price] of KAEUFE) {
    if (await pl(m, name)) { log.push(`${m} ${name}: schon im Kader`); continue; }
    const id = `${m}-${name}-r3`.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    await q("insert into players(id,manager_id,name,club,base_pos,extra_pos,price,slot,source,status,valid_from,jugend,contract,contract_mandatory) values($1,$2,$3,$4,$5,'{}',$6,'bank','kauf','active',$7,false,null,false) on conflict(id) do nothing", [id, mid(m), name, club, pos, price, r3.number]);
    await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'kauf',$3,$4,'Blog Spieltag 3 (Korrektur 15.09.2026)')", [r3.id, mid(m), name, price]);
    log.push(`${m}: Kauf ${name} (${club}, ${pos}, ${price}) ab ${r3.label}`);
  }
  for (const [m, name] of ENTLASSUNGEN) {
    const p = await pl(m, name); if (!p) { log.push(`${m} ${name}: nicht aktiv (schon entlassen?)`); continue; }
    await q("update players set status='released', valid_to=$2 where id=$1", [p.id, r2.number]);
    await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'entlassung',$3,$4,'Blog Spieltag 3 (Korrektur 15.09.2026)')", [r3.id, mid(m), p.name, p.price]);
    log.push(`${m}: Entlassung ${name} (gültig bis ${r2.label})`);
  }
  // 3) Arbis Aufstellung Spieltag 3
  { const entries = {}; const byId = {}; const missing = [];
    for (const [name, pos] of ARBI_ELF) { const p = await pl('Arbi', name); if (!p) { missing.push(name); continue; } entries[p.id] = { pos }; byId[p.id] = p; }
    const probs = posProblems(entries, byId);
    if (missing.length || probs.length) log.push(`Arbi Aufstellung NICHT gesetzt: ${[...missing.map(x => x + ' fehlt'), ...probs].join('; ')}`);
    else { const old = await one('select * from lineups where round_id=$1 and manager_id=$2', [r3.id, mid('Arbi')]);
      await q(`insert into lineups(round_id,manager_id,entries,free_in,updated_at,updated_by) values($1,$2,$3,$4,now(),$5) on conflict(round_id,manager_id) do update set entries=excluded.entries, updated_at=now(), updated_by=excluded.updated_by`, [r3.id, mid('Arbi'), JSON.stringify(entries), old ? old.free_in : [], userId]);
      log.push(`Arbi: Aufstellung ${r3.label} gesetzt (${ARBI_ELF.map(x => x[1] + ' ' + x[0]).join(', ')})`); }
  }
  // 4) Resultate
  const setRes = async (round, m, name, vals, source, lock) => {
    const p = await pl(m, name); if (!p) { log.push(`${round.label} ${m} ${name}: Spieler nicht gefunden`); return; }
    const cur = await one('select * from results where round_id=$1 and player_id=$2', [round.id, p.id]);
    if (cur && cur.locked && !lock) { log.push(`${round.label} ${m} ${name}: Zeile vom Admin gesperrt, nicht angefasst`); return; }
    const v = { start: cur?.start ?? 0, assist: cur?.assist ?? 0, tore: cur?.tore ?? 0, karten: cur?.karten ?? 0, tdr: cur?.tdr ?? 0, ...vals };
    await q(`insert into results(round_id,player_id,start,assist,tore,karten,tdr,source,locked) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
      on conflict(round_id,player_id) do update set start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten, tdr=excluded.tdr, source=excluded.source, locked=excluded.locked`, [round.id, p.id, v.start, v.assist, v.tore, v.karten, v.tdr, source, lock]);
    log.push(`${round.label} ${m} ${name}: ${Object.entries(vals).map(([k, x]) => k + '=' + x).join(', ')}`);
  };
  for (const [m, name, vals] of R2) await setRes(r2, m, name, vals, 'kicker', true);
  for (const [m, name, vals] of R3) await setRes(r3, m, name, vals, 'excel', false);
  await setSetting('korrektur_20260915', { at: new Date().toISOString(), log }); await audit(userId, 'korrektur_20260915', { n: log.length });
  return { done: false, log };
}
