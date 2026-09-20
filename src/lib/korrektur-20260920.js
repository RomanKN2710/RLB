/* Einmalige Datenkorrektur vom 20.09.2026: Ergebnis des Gesamt-Abgleichs Blog (alle 63 Einträge seit Saisonstart)
   ↔ kicker-Spielberichte Spieltag 1–3 ↔ Excel-Auswertungen ↔ App. Idempotent (settings korrektur_20260920). */
import { q, one, setSetting, getSetting, audit } from './db';
import { posProblems } from './rules';
import { importPosts } from './blog-archiv';
import blogSeed from '../../db/seed/blog-2026-08-09.json';

// Aufstellungen laut Blog, die in App und Excel falsch waren: [Runde, Manager, raus, rein, Position von rein]
const ELF = [[3, 'Mike', 'El Mala', 'Diaby', 'S', 'Blog «Mike Runde 3 - Update» 11.09. 17:24: Diaby anstatt El Mala'],
  [2, 'Dani', 'Günter', 'Vagnoman', 'V', 'Blog «Team Dani Runde 2» 03.09.: «V Vagnoman Stuttgart für V Günter Freiburg» – im Excel übersehen']];
// Werte laut kicker-Spielbericht (gesperrt, Quelle kicker)
const WERTE = [[1, 'Arbi', 'Ullrich', { start: 1 }, 'Leipzig – Gladbach 3:0: Ullrich in der Startelf (64. ausgewechselt)'],
  [1, 'René', 'Juranovic', { assist: 2 }, 'Union – Frankfurt 3:3: Vorlagen zum 1:0 (Latte Lath) und 2:3 (Querfeld)'],
  [2, 'Dani', 'Vagnoman', { start: 1, assist: 1, tore: 1, karten: 0 }, 'Stuttgart – Köln 4:1: Startelf, Vorlage 1:0, Tor 4:1']];
// Positionen: Grundposition laut kicker-Kader, Zusatzpositionen laut kicker-Startelf (Ziff. 5.2)
const POS = [['Mark', 'Daghim', 'S', ['M'], 'kicker-Kader: Sturm; Startelf Spieltag 1 als Mittelfeld → M ab Spieltag 2'],
  ['Pädi', 'Moore', 'M', [], 'kicker-Kader Köln: Mittelfeld (nicht Sturm)'],
  ['Pädi', 'Conté', null, ['S'], 'Startelf Spieltag 1 (Hoffenheim) als Sturm → S ab Spieltag 2'],
  ['Pädi', 'Grüll', null, ['M'], 'Startelf Spieltag 1–3 (Bremen) als Mittelfeld → M'],
  ['Mark', 'El Ouahdi', null, ['M'], 'Startelf Spieltag 2 und 3 als Mittelfeld → M ab Spieltag 3'],
  ['Röfe', 'Bülter', null, ['M'], 'Startelf Spieltag 3 als Mittelfeld → M ab Spieltag 4']];
// Verträge laut Blog (Keeper-Posts vor dem Draft, Ziff. 4.3.3)
const VERTRAEGE = { 'Pädi': { '1J': ['Ben Seghir', 'Bahoya', 'Undav', 'Prömel'] }, 'Mark': { '2J': ['Burger', 'Führich'], '1J': ['Baku', 'Lukeba'] },
  'Roman': { '1J': ['Svensson', 'Eggestein'], '2J': ['Karl', 'Chabot'] }, 'Lazar': { '2J': ['Asllani', 'Maza'], '1J': ['Kimmich', 'Olise'] },
  'Mike': { '2J': ['Nusa', 'Uzun'], '1J': ['Stiller', 'Kabak'] }, 'René': { '2J': ['Tapsoba', 'Romulo'], '1J': ['Honorat'] },
  'Röfe': { '2J': ['Pejcinovic', 'Leweling'], '1J': ['Burkardt', 'Amiri'] }, 'Dani': { '2J': ['Baumgartner', 'Matanovic'], '1J': ['Brown', 'Luis Diaz'] },
  'Arbi': { '2J': ['Nmecha', 'Ryerson'], '1J': ['Raum', 'Bensebaini'] }, 'David': { '2J': ['Sano', 'Gruda'], '1J': ['Tah', 'Laimer'] } };

export async function applyKorrektur20260920(userId = null) {
  const done = await getSetting('korrektur_20260920'); if (done) return { done: true, log: ['Korrektur vom 20.09.2026 wurde bereits eingespielt am ' + done.at] };
  const log = []; const managers = await q('select * from managers'); const mid = n => { const m = managers.find(x => x.name === n); if (!m) throw new Error('Manager ' + n); return m.id; };
  const rounds = await q("select * from rounds where type='regulaer' order by number"); const rd = md => { const r = rounds.find(x => x.matchday === md); if (!r) throw new Error('Runde ' + md); return r; };
  const pl = async (m, name) => one("select * from players where manager_id=$1 and name=$2 order by (status='active') desc, valid_from desc limit 1", [mid(m), name]);
  // 1) Aufstellungen
  for (const [md, m, out, inn, pos, why] of ELF) {
    const r = rd(md); const po = await pl(m, out); const pi = await pl(m, inn); const lu = await one('select * from lineups where round_id=$1 and manager_id=$2', [r.id, mid(m)]);
    if (!po || !pi || !lu) { log.push(`${r.label} ${m}: ${out}/${inn}/Aufstellung nicht gefunden`); continue; }
    if (!lu.entries[po.id]) { log.push(`${r.label} ${m}: ${out} steht nicht in der Elf (schon korrigiert?)`); continue; }
    const entries = { ...lu.entries }; delete entries[po.id]; entries[pi.id] = { pos };
    const all = await q('select * from players where manager_id=$1', [mid(m)]); const byId = Object.fromEntries(all.map(p => [p.id, p]));
    const probs = posProblems(entries, byId); if (probs.length) { log.push(`${r.label} ${m}: Elf NICHT geändert (${probs.join('; ')})`); continue; }
    await q('update lineups set entries=$3, updated_at=now(), updated_by=$4 where round_id=$1 and manager_id=$2', [r.id, mid(m), JSON.stringify(entries), userId]);
    log.push(`${r.label} ${m}: ${inn} (${pos}) statt ${out} – ${why}`);
  }
  // 2) Werte
  for (const [md, m, name, vals, why] of WERTE) {
    const r = rd(md); const p = await pl(m, name); if (!p) { log.push(`${r.label} ${m} ${name}: nicht gefunden`); continue; }
    const cur = await one('select * from results where round_id=$1 and player_id=$2', [r.id, p.id]);
    const v = { start: cur?.start ?? 0, assist: cur?.assist ?? 0, tore: cur?.tore ?? 0, karten: cur?.karten ?? 0, tdr: cur?.tdr ?? 0, ...vals };
    await q(`insert into results(round_id,player_id,start,assist,tore,karten,tdr,source,locked) values($1,$2,$3,$4,$5,$6,$7,'kicker',true)
      on conflict(round_id,player_id) do update set start=excluded.start, assist=excluded.assist, tore=excluded.tore, karten=excluded.karten, tdr=excluded.tdr, source='kicker', locked=true`, [r.id, p.id, v.start, v.assist, v.tore, v.karten, v.tdr]);
    log.push(`${r.label} ${m} ${name}: ${Object.entries(vals).map(([k, x]) => k + '=' + x).join(', ')} – ${why}`);
  }
  // 3) Positionen (+ Pädis Elf Spieltag 3: Moore als M)
  for (const [m, name, base, extra, why] of POS) {
    const p = await pl(m, name); if (!p) { log.push(`${m} ${name}: nicht gefunden`); continue; }
    const nb = base || p.base_pos; const ne = [...new Set([...(p.extra_pos || []), ...extra])].filter(x => x !== nb);
    if (nb === p.base_pos && ne.length === (p.extra_pos || []).length) { log.push(`${m} ${name}: Position schon ${nb}${ne.length ? '/' + ne.join('/') : ''}`); continue; }
    await q('update players set base_pos=$2, extra_pos=$3 where id=$1', [p.id, nb, ne]);
    await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values(null,$1,'position',$2,0,$3)", [mid(m), p.name, `Positionen ${nb}${ne.length ? '/' + ne.join('/') : ''} (Korrektur 20.09.2026): ${why}`]);
    log.push(`${m} ${name}: ${p.base_pos}${(p.extra_pos || []).length ? '/' + p.extra_pos.join('/') : ''} → ${nb}${ne.length ? '/' + ne.join('/') : ''} – ${why}`);
  }
  { const r = rd(3); const p = await pl('Pädi', 'Moore'); const lu = p && await one('select * from lineups where round_id=$1 and manager_id=$2', [r.id, mid('Pädi')]);
    if (lu && lu.entries[p.id] && lu.entries[p.id].pos !== 'M') { const e = { ...lu.entries, [p.id]: { pos: 'M' } }; await q('update lineups set entries=$3 where round_id=$1 and manager_id=$2', [r.id, mid('Pädi'), JSON.stringify(e)]); log.push(`${r.label} Pädi: Moore als M geführt (Grundposition laut kicker)`); } }
  // 3b) Arbi Spieltag 3: Doan wurde mit dem Gebot per Eventualauftrag direkt eingesetzt → gratis (Ziff. 7.1), wie im Excel
  { const r = rd(3); const p = await pl('Arbi', 'Doan'); const lu = p && await one('select * from lineups where round_id=$1 and manager_id=$2', [r.id, mid('Arbi')]);
    if (lu && lu.entries[p.id] && !(lu.free_in || []).includes(p.id)) { await q('update lineups set free_in=$3 where round_id=$1 and manager_id=$2', [r.id, mid('Arbi'), [...(lu.free_in || []), p.id]]); log.push(`${r.label} Arbi: Doan als Eventualauftrag gratis eingewechselt (keine Wechselkosten, wie im Excel)`); } }
  // 4) Buchungen
  { const l = await one("select * from ledger where manager_id=$1 and type='vertragsaufloesung' and text like '%Kabak%'", [mid('Mike')]);
    if (l) { await q("update ledger set text='+20 Theate (Vertragsauflösung laut Blog «Mike Keepers 26/27»)' where id=$1", [l.id]); log.push('Mike: Vertragsauflösung betrifft Theate, nicht Kabak (Text korrigiert)'); }
    const r3 = rd(3); const g = await one("select 1 from ledger where manager_id=$1 and type='gutschrift' and text like '%Belocian%'", [mid('Arbi')]);
    if (!g) { await q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'gutschrift',2,'Abgang Belocian aus der Bundesliga (Ziff. 7.4), wie Excel Spieltag 3')", [mid('Arbi'), r3.id]); log.push('Arbi: Gutschrift 2 für Belocian (Spieltag 3, wie im Excel)'); } }
  // 5) Verträge laut Blog
  for (const [m, byLen] of Object.entries(VERTRAEGE)) for (const [len, names] of Object.entries(byLen)) for (const name of names) {
    const p = await pl(m, name); if (!p) { log.push(`${m} ${name}: Vertragsspieler nicht im Kader gefunden`); continue; }
    if (p.contract !== len) { await q('update players set contract=$2 where id=$1', [p.id, len]); log.push(`${m} ${name}: Vertrag ${len}${p.status !== 'active' ? ' (Spieler inzwischen entlassen)' : ''}`); }
  }
  // 6) Blog-Archiv füllen
  { const r = await importPosts(blogSeed, managers, rounds, 'export 20.09.2026'); log.push(`Blog-Archiv: ${r.neu} Einträge neu, ${r.vorhanden} schon vorhanden`); }
  await setSetting('korrektur_20260920', { at: new Date().toISOString(), log }); await audit(userId, 'korrektur_20260920', { n: log.length });
  return { done: false, log };
}

/* Teil 2: Aufstellungen Spieltag 4 laut Blog (letzter Post je Manager vor der Deadline 18.09. 19:00).
   Mike und Lazar haben nicht gepostet: bisherige Elf gilt (Ziff. 5.1, ensureLineups). Arbis Elf ist unzulässig
   (Lemperle als M, hat nur S) und wird wie gepostet gespeichert, damit die Admins entscheiden; das Archiv zeigt den Fehler. */
const ELF4 = {
  'Pädi': [['Zentner', 'T'], ['Coufal', 'V'], ['Caci', 'V'], ['Posch', 'V'], ['Mwene', 'V'], ['Conté', 'M'], ['Nkunku', 'M'], ['Grüll', 'M'], ['Moore', 'M'], ['Moreira', 'S'], ['Undav', 'S']],
  'Arbi': [['Kobel', 'T'], ['Mensah', 'V'], ['Raum', 'V'], ['Ryerson', 'V'], ['Doan', 'M'], ['Nmecha', 'M'], ['Musiala', 'M'], ['Lemperle', 'M'], ['Mokwa', 'S'], ['Hlozek', 'S'], ['Gregoritsch', 'S']],
  'Röfe': [['Dahmen', 'T'], ['Gadou', 'V'], ['Hajdari', 'V'], ['Lienhart', 'V'], ['Karaman', 'M'], ['Aleix Garcia', 'M'], ['Amiri', 'M'], ['Petkov', 'M'], ['Burkardt', 'S'], ['Pejcinovic', 'S'], ['Kane', 'S']],
  'Mark': [['Backhaus', 'T'], ['Baku', 'V'], ['Quansah', 'V'], ['Miguel', 'V'], ['El Ouahdi', 'V'], ['Nwaneri', 'M'], ['Daghim', 'M'], ['Grönbaek', 'M'], ['Führich', 'M'], ['Tietz', 'S'], ['Kofane', 'S']],
  'Roman': [['Flekken', 'T'], ['Svensson', 'V'], ['Chabot', 'V'], ['Davies', 'V'], ['Anton', 'V'], ['Medina', 'V'], ['Avdullahu', 'M'], ['Eggestein', 'M'], ['Ibrahimovic', 'M'], ['Rieder', 'M'], ['Fuellkrug', 'S']],
  'Dani': [['Vandevoordt', 'T'], ['Brown', 'V'], ['Makengo', 'V'], ['Vagnoman', 'V'], ['Fabio Silva', 'M'], ['Beste', 'M'], ['Banzuzi', 'M'], ['Engelhardt', 'M'], ['Guirassy', 'S'], ['Luis Diaz', 'S'], ['Matanovic', 'S']],
  'René': [['Heuer Fernandes', 'T'], ['Schlotterbeck N.', 'V'], ['Ginter', 'V'], ['Rots', 'V'], ['Tapsoba', 'V'], ['Jeltsch', 'V'], ['Suzuki', 'M'], ['Honorat', 'M'], ['Lee', 'M'], ['Ache', 'S'], ['Becker', 'S']],
  'David': [['Neuer', 'T'], ['Baum', 'V'], ['Tah', 'V'], ['Laimer', 'V'], ['Upamecano', 'V'], ['El Aynaoui', 'M'], ['Pavlovic', 'M'], ['Sano', 'M'], ['Gruda', 'M'], ['Grifo', 'M'], ['Gomis', 'S']],
};
const QUELLE4 = { 'Pädi': '«Aufstellung Runde 4 - Pädi» 18.09. 15:26', 'Arbi': '«Arbi R4» 18.09. 15:22', 'Röfe': '«Aufstellung Team Röfe - Runde 4» 18.09. 17:01', 'Mark': '«Mark 4 NEU» 18.09. 16:53', 'Roman': '«Roman Runde 4» 18.09. 17:44', 'Dani': '«Team Dani Runde 4» 16.09. 12:35', 'René': '«René R4» 18.09. 16:41', 'David': '«David Runde 4» 18.09. 14:47' };

export async function applyAufstellungenST4(userId = null) {
  const done = await getSetting('korrektur_20260920_st4'); if (done) return { done: true, log: ['Aufstellungen Spieltag 4 wurden bereits eingespielt am ' + done.at] };
  const log = []; const managers = await q('select * from managers'); const r = await one("select * from rounds where type='regulaer' and matchday=4"); if (!r) throw new Error('Spieltag 4 nicht gefunden');
  for (const [mname, elf] of Object.entries(ELF4)) {
    const m = managers.find(x => x.name === mname); if (!m) { log.push(`${mname}: Manager fehlt`); continue; }
    const all = await q('select * from players where manager_id=$1', [m.id]); const byId = Object.fromEntries(all.map(p => [p.id, p]));
    const entries = {}; const missing = [];
    for (const [name, pos] of elf) { const p = all.filter(x => x.name === name).sort((a, b) => (b.status === 'active') - (a.status === 'active'))[0]; if (!p) missing.push(name); else entries[p.id] = { pos }; }
    if (missing.length) { log.push(`${r.label} ${mname}: NICHT gesetzt, Spieler fehlen: ${missing.join(', ')}`); continue; }
    const old = await one('select * from lineups where round_id=$1 and manager_id=$2', [r.id, m.id]);
    const same = old && Object.keys(old.entries).length === Object.keys(entries).length && Object.entries(entries).every(([pid, e]) => old.entries[pid] && old.entries[pid].pos === e.pos);
    if (same) { log.push(`${r.label} ${mname}: Elf entspricht schon dem Blog (${QUELLE4[mname]})`); continue; }
    await q(`insert into lineups(round_id,manager_id,entries,free_in,updated_at,updated_by) values($1,$2,$3,$4,now(),$5) on conflict(round_id,manager_id) do update set entries=excluded.entries, updated_at=now(), updated_by=excluded.updated_by`, [r.id, m.id, JSON.stringify(entries), old ? old.free_in : [], userId]);
    const probs = posProblems(entries, byId);
    const diff = old ? [...Object.keys(entries).filter(pid => !old.entries[pid]).map(pid => '+' + byId[pid].name), ...Object.keys(old.entries).filter(pid => !entries[pid]).map(pid => '−' + (byId[pid]?.name || pid))] : ['neu'];
    log.push(`${r.label} ${mname}: Elf laut Blog ${QUELLE4[mname]} gesetzt (${diff.join(', ')})${probs.length ? ' – UNZULÄSSIG: ' + probs.join('; ') : ''}`);
  }
  log.push(`${r.label} Mike, Lazar: kein Blog-Post, bisherige Elf gilt (Ziff. 5.1)`);
  await setSetting('korrektur_20260920_st4', { at: new Date().toISOString(), log }); await audit(userId, 'korrektur_20260920_st4', { n: log.length });
  return { done: false, log };
}
