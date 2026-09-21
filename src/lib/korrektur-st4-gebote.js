/* Gebote und Nachtrag zu Spieltag 4 (Blog vom 21.09.2026, Mails vom 18.09. vor der Deadline 19:00):
   - Pädi: T Karius (Schalke) 2, ersetzt direkt Zentner (Eventualauftrag); Schwolow 2 als Alternative. Zentner entlassen.
   - René: T Karius (Schalke) 2 mit Eventualauftrag für Heuer Fernandes; M Fellhauer (Augsburg) 2 mit Eventualauftrag für Honorat; entlässt Adeline.
   - Mike: M Konstantelias (Dortmund) 2, entlässt Daka; keine Einwechslung.
   Karius: Pädi und René je 2 → Zuschlag an den schlechter platzierten Manager (Ziff. 7.1): Pädi (9.) vor René (5.). René behält Heuer Fernandes.
   Ausserdem Mikes Aufstellung Runde 4 (Post 18.09. 17:50, fehlte im ersten Blog-Export): Katic für El Khannouss, El Mala für Stiller. */
import { q, one, setSetting, audit } from './db';
import { base } from './data';
import { posProblems } from './rules';
import { importPosts } from './blog-archiv';
import { playerMatches } from './kicker';
import blogSeed from '../../db/seed/blog-2026-09-21.json';

const KAEUFE = [
  { m: 'Pädi', name: 'Karius', club: 'Schalke', pos: 'T', price: 2, release: 'Zentner', swapOut: 'Zentner', why: 'Gebot 2, Gleichstand mit René, Zuschlag an den schlechter platzierten Manager (Ziff. 7.1)' },
  { m: 'René', name: 'Fellhauer', club: 'Augsburg', pos: 'M', price: 2, release: 'Adeline', swapOut: 'Honorat', why: 'Gebot 2, einziges Gebot' },
  { m: 'Mike', name: 'Konstantelias', club: 'Dortmund', pos: 'M', price: 2, release: 'Daka', swapOut: null, why: 'Gebot 2, einziges Gebot' },
];
const MIKE_ELF = [['Nicolas', 'T'], ['Kabak', 'V'], ['Mittelstaedt', 'V'], ['Matsima', 'V'], ['Katic', 'V'], ['Uzun', 'M'], ['Tillman', 'M'], ['El Mala', 'M'], ['Diaby', 'S'], ['Nusa', 'S'], ['Saibari', 'S']];

export async function applyGeboteST4(userId = null) {
  const log = []; const b = await base(); const managers = b.managers; const mid = n => managers.find(x => x.name === n).id;
  const r4 = await one("select * from rounds where type='regulaer' and matchday=4"); const r3 = await one("select * from rounds where type='regulaer' and matchday=3");
  if (!r4 || !r3) throw new Error('Runden fehlen');
  const pl = async (m, name) => one("select * from players where manager_id=$1 and name=$2 and status='active'", [mid(m), name]);
  for (const k of KAEUFE) {
    let p = await pl(k.m, k.name);
    if (!p) {
      const id = `${k.m}-${k.name}-r4`.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const pool = (await q('select * from bl_players where club=$1', [k.club])).find(x => playerMatches(x.slug, x.name, k.name));
      const basePos = (pool && pool.squad_pos) || k.pos; const extra = pool ? (pool.played_pos || []).filter(x => x !== basePos) : [];
      await q("insert into players(id,manager_id,name,club,base_pos,extra_pos,price,slot,source,status,valid_from,jugend,contract,contract_mandatory,kicker_slug) values($1,$2,$3,$4,$5,$6,$7,'bank','kauf','active',$8,false,null,false,$9) on conflict(id) do nothing", [id, mid(k.m), k.name, k.club, basePos, extra, k.price, r4.number, pool ? pool.slug : null]);
      await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'kauf',$3,$4,$5)", [r4.id, mid(k.m), k.name, k.price, `Gebot ${r4.label} (Blog 21.09.2026): ${k.why}`]);
      p = await pl(k.m, k.name); log.push(`${k.m}: Kauf ${k.name} (${k.club}, ${basePos}${extra.length ? '/' + extra.join('/') : ''}, ${k.price})`);
    } else log.push(`${k.m}: ${k.name} schon im Kader`);
    const rel = await pl(k.m, k.release);
    if (rel) { await q("update players set status='released', valid_to=$2 where id=$1", [rel.id, r3.number]); await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'entlassung',$3,$4,'Gebot Spieltag 4 (Blog 21.09.2026)')", [r4.id, mid(k.m), rel.name, rel.price]); log.push(`${k.m}: Entlassung ${rel.name}`); }
    // Gebot festhalten (eine Zeile je Manager und Runde)
    const swap = k.swapOut ? await one('select id from players where manager_id=$1 and name=$2', [mid(k.m), k.swapOut]) : null;
    await q(`insert into bids(round_id,manager_id,player_name,club,pos,price,release_player_id,swap_out_player_id,status,reason) values($1,$2,$3,$4,$5,$6,$7,$8,'won',$9) on conflict(round_id,manager_id) do nothing`, [r4.id, mid(k.m), k.name, k.club, k.pos, k.price, rel ? rel.id : null, swap ? swap.id : null, k.why]);
    // Eventualauftrag: direkt in die Elf, gratis
    if (k.swapOut && p) { const lu = await one('select * from lineups where round_id=$1 and manager_id=$2', [r4.id, mid(k.m)]); const out = await one('select id from players where manager_id=$1 and name=$2', [mid(k.m), k.swapOut]);
      if (lu && out && lu.entries[out.id] && !lu.entries[p.id]) { const e = { ...lu.entries }; const pos = e[out.id].pos; delete e[out.id]; e[p.id] = { pos: [p.base_pos, ...(p.extra_pos || [])].includes(pos) ? pos : p.base_pos };
        await q('update lineups set entries=$3, free_in=$4, updated_at=now() where round_id=$1 and manager_id=$2', [r4.id, mid(k.m), JSON.stringify(e), [...new Set([...(lu.free_in || []), p.id])]]); log.push(`${r4.label} ${k.m}: ${k.name} für ${k.swapOut} (Eventualauftrag, gratis)`); } }
  }
  await q("update bids set status='lost', reason='Gleichstand 2:2 mit Pädi, Zuschlag an den schlechter platzierten Manager (Ziff. 7.1)' where round_id=$1 and manager_id=$2 and status='sealed'", [r4.id, mid('René')]);
  log.push('René: Gebot Karius 2 verloren (Gleichstand, Pädi schlechter platziert) – Heuer Fernandes bleibt');
  // Mikes Elf Spieltag 4
  { const all = await q('select * from players where manager_id=$1', [mid('Mike')]); const byId = Object.fromEntries(all.map(p => [p.id, p])); const entries = {}; const missing = [];
    for (const [name, pos] of MIKE_ELF) { const p = all.filter(x => x.name === name).sort((a, c) => (c.status === 'active') - (a.status === 'active'))[0]; if (!p) missing.push(name); else entries[p.id] = { pos }; }
    if (missing.length) log.push(`Mike: Elf NICHT gesetzt, fehlen: ${missing.join(', ')}`);
    else { const probs = posProblems(entries, byId); const old = await one('select * from lineups where round_id=$1 and manager_id=$2', [r4.id, mid('Mike')]);
      await q(`insert into lineups(round_id,manager_id,entries,free_in,updated_at,updated_by) values($1,$2,$3,$4,now(),$5) on conflict(round_id,manager_id) do update set entries=excluded.entries, updated_at=now(), updated_by=excluded.updated_by`, [r4.id, mid('Mike'), JSON.stringify(entries), old ? old.free_in : [], userId]);
      log.push(`${r4.label} Mike: Elf laut Blog «Mike Runde 4» 18.09. 17:50 gesetzt (Katic für El Khannouss, El Mala für Stiller)${probs.length ? ' – UNZULÄSSIG: ' + probs.join('; ') : ''}`); } }
  await q('update rounds set bids_resolved=true where id=$1', [r4.id]);
  const r = await importPosts(blogSeed, managers, await q("select * from rounds where type='regulaer' order by number"), 'blog 21.09.2026'); log.push(`Blog-Archiv: ${r.neu} Einträge neu`);
  await setSetting('gebote_st4', { at: new Date().toISOString(), log }); await audit(userId, 'gebote_st4', { n: log.length });
  return { log };
}
