/* Spieltagsbericht: nach Abschluss einer Runde schreibt Claude aus den Fakten der Runde (Aufstellungen, kicker-Werte, Tabelle,
   Potential, Blog-Einträge) einen unterhaltsamen Bericht mit Kommentar zur Gesamttabelle und einem Abschnitt je Manager.
   Der Bericht wird gespeichert und auf der Seite /bericht gezeigt. Benötigt ANTHROPIC_API_KEY. */
import Anthropic from '@anthropic-ai/sdk';
import { q, one, getSetting } from './db';
import * as D from './data';
import * as R from './rules';
import { potential } from './potential';
import { roundAwards } from './auszeichnungen';

let ready = false;
export async function ensureTable() { if (ready) return; await q(`create table if not exists reports (round_id int primary key references rounds(id), text text, facts jsonb, model text, created_at timestamptz not null default now(), sent_at timestamptz, sent_to text[], error text)`); ready = true; }

const CATS_DE = { punkte: 'Punkte', shutout: 'Zu-null', assist: 'Assists', tore: 'Tore', karten: 'Karten', tdr: 'Team der Runde', start: 'Starts' };

/** Alle Fakten einer Runde, kompakt für den Bericht. */
export async function buildFacts(roundId) {
  const round = await D.roundById(roundId); if (!round) throw new Error('Runde fehlt');
  const sd = await D.season(round.number); const b = sd.base; const i = sd.upto.findIndex(r => r.id === round.id); const d = sd.datas[i];
  const prev = i > 0 ? R.standings(b.managerIds, sd.datas.slice(0, i).map(x => x.totals)) : null;
  const table = sd.table; const form = R.standings(b.managerIds, [d.totals]);
  let pot = null; try { pot = await potential(sd); } catch (e) { pot = null; }
  const potRound = pot ? pot.details.find(x => x.round.id === round.id) : null;
  const matches = d.matches.filter(m => m.finished).map(m => ({ heim: b.teamToClub[m.team1], gast: b.teamToClub[m.team2], tore: `${m.goals1}:${m.goals2}` }));
  const posts = await q('select title, posted_at, body from blog_posts where round_number=$1 and kind in ($2,$3) order by posted_at', [round.number, 'aufstellung', 'gebot']).catch(() => []);
  const transfers = await q("select t.type, t.player_name, t.price, m.name as manager from transfers t join managers m on m.id=t.manager_id where t.round_id=$1 and t.type in ('kauf','entlassung')", [round.id]);
  const managers = b.managerIds.map(m => {
    const lu = d.lineups[m]; const entries = lu ? lu.entries : {};
    const spieler = Object.entries(entries).map(([pid, e]) => { const p = b.players[pid]; const r = d.results[pid] || {}; const v = R.entryValues(p, e.pos, r, d.clubRes); const st = Number(r.start) || 0;
      return { name: p.name, verein: p.club, pos: e.pos, einsatz: st === 1 ? 'Startelf' : st === 2 ? 'eingewechselt' : 'nicht gespielt', punkte: v.punkte, zu_null: v.shutout, assists: v.assist, tore: v.tore, karten: r.karten === 2 ? 'Gelb-Rot' : r.karten === 3 ? 'Rot' : r.karten === 4 ? 'Rot nach Gelb' : r.karten === 1 ? 'Gelb' : '', team_der_runde: v.tdr }; });
    const t = table.find(x => x.manager_id === m); const pv = prev ? prev.find(x => x.manager_id === m) : null; const f = form.find(x => x.manager_id === m);
    const pr = potRound ? potRound.det[m] : null;
    const postsM = posts.filter(p => p.title && new RegExp('(?<!\\p{L})' + b.managerName[m].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\p{L})', 'iu').test(p.title + ' ' + p.body.slice(0, 120))).map(p => ({ titel: p.title, zeit: p.posted_at, text: p.body.slice(0, 600) }));
    return { manager: b.managerName[m], rundenwerte: Object.fromEntries(R.CATS.map(([c]) => [CATS_DE[c], d.totals[m][c]])), tages_rangpunkte: f.total, tabelle: { rang: t.rank, rangpunkte: t.total, vorher_rang: pv?.rank ?? null, vorher_rangpunkte: pv?.total ?? null, saisonwerte: Object.fromEntries(R.CATS.map(([c]) => [CATS_DE[c], t.tot[c]])) },
      aufstellung: spieler, gratis_eingewechselt: (lu?.free_in || []).map(pid => b.players[pid]?.name).filter(Boolean),
      potential: pr ? { beste_elf: pr.picks.map(x => `${x.pos} ${b.players[x.pid]?.name}${entries[x.pid] ? '' : ' (sass auf der Bank)'}`), verpasste_kategoriensumme: pr.delta } : null,
      blog: postsM, transfers: transfers.filter(x => x.manager === b.managerName[m]).map(x => `${x.type} ${x.player_name} ${Number(x.price)}`) };
  });
  const auszeichnungen = roundAwards(sd, i).map(a => ({ titel: a.title, manager: a.manager, begruendung: a.detail }));
  return { runde: round.label, spieltag: round.matchday, auszeichnungen, spiele: matches, team_der_runde: round.tdr || [], spieler_des_tages: round.sdt || null,
    tabelle: table.map(t => ({ rang: t.rank, manager: b.managerName[t.manager_id], rangpunkte: t.total, ...Object.fromEntries(R.CATS.map(([c]) => [CATS_DE[c], t.tot[c]])) })),
    potential_tabelle: pot ? pot.potentialTable.map(t => ({ rang: t.rank, manager: b.managerName[t.manager_id], rangpunkte: t.total, echt_rang: pot.actual.find(x => x.manager_id === t.manager_id).rank })) : null,
    verpasste_rangpunkte: pot ? b.managerIds.map(m => ({ manager: b.managerName[m], echt: pot.alone[m].actualRp, allein_optimal: pot.alone[m].rp, verpasst: pot.alone[m].gain })) : null,
    manager: managers };
}

const SYSTEM = `Du schreibst den Spieltagsbericht für die "Rotissery League Bundesliga" (RLB), ein privates Bundesliga-Managerspiel mit zehn Managern (Pädi, Arbi, Röfe, Mark, Roman, Mike, Dani, Lazar, René, David), die sich seit Jahren kennen. Ton: unterhaltsam, ironisch, liebevoll frech, wie ein Sportkolumnist unter Freunden. Schweizer Rechtschreibung (ss statt ß). Deutsch.

Regeln:
- Nur Fakten aus den gelieferten Daten verwenden. Nichts erfinden, keine Ereignisse behaupten, die nicht in den Daten stehen. Zahlen exakt übernehmen.
- Aufbau: 1) "Die Lage": kurz, was der Spieltag gebracht hat. 2) "Das Rennen": Kommentar zur Gesamttabelle nach dieser Runde – wer führt und mit welchem Vorsprung, wer sind die Verfolger auf den Top-Plätzen, wer hat sich am meisten bewegt (Rang vorher → nachher), wer steht auf dem letzten Platz und wie weit ist es bis zum Anschluss; bei knappen Abständen das auch so benennen. 3) Ein Abschnitt je Manager (alle zehn, in Tabellenreihenfolge). 4) "Elf des Tages" (kurz). 5) "Auszeichnungen": die drei Auszeichnungen des Spieltags aus den Fakten (Titel, Manager, Begründung), je ein frecher Satz; gibt es keine, den Abschnitt weglassen. 6) "Ausblick" (zwei Sätze).
- Je Manager: was seine Spieler geleistet haben (Tore, Vorlagen, Zu-null, Karten, Team der Runde), wer nicht gespielt hat, was die Aufstellung war (Wechsel laut Blog, späte Updates, keine Abgabe), und was die Potential-Daten sagen (beste Elf im Nachhinein, Bankspieler die gezündet hätten). Offensichtliche Fehler humorvoll kommentieren, aber niemanden blossstellen.
- Länge: 700 bis 1000 Wörter. Markdown mit ## für die Abschnitte und ### je Manager. Fettdruck sparsam.
- Keine Einleitung über dich selbst, keine Hinweise auf Datenquellen oder KI.`;

/** Bericht mit Claude schreiben. */
export async function generateReportText(facts) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen');
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: 'claude-opus-5', max_tokens: 8000, output_config: { effort: 'medium' },
    system: SYSTEM,
    messages: [{ role: 'user', content: `Schreib den Bericht zu ${facts.runde}. Daten:\n\n${JSON.stringify(facts)}` }],
  });
  const msg = await stream.finalMessage();
  if (msg.stop_reason === 'refusal') throw new Error('Bericht abgelehnt: ' + (msg.stop_details?.explanation || ''));
  const text = msg.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
  if (!text) throw new Error('Leere Antwort');
  return { text, model: msg.model };
}

/** Sehr kleiner Markdown-Renderer (Überschriften, Absätze, Listen, fett/kursiv) für Seite und Mail. */
export function md2html(md) {
  const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>');
  const out = []; let list = null;
  for (const raw of String(md || '').split('\n')) { const line = raw.trimEnd();
    if (/^\s*[-*] /.test(line)) { if (!list) { list = []; } list.push(`<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`); continue; }
    if (list) { out.push(`<ul>${list.join('')}</ul>`); list = null; }
    if (!line.trim()) continue;
    const h = line.match(/^(#{1,4})\s+(.*)$/); if (h) { const n = Math.min(h[1].length + 1, 4); out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue; }
    out.push(`<p>${inline(line)}</p>`); }
  if (list) out.push(`<ul>${list.join('')}</ul>`);
  return out.join('\n');
}

/** Bericht erstellen, falls er fehlt (oder force). */
export async function createReport(roundId, { force = false } = {}) {
  await ensureTable(); const round = await D.roundById(roundId); if (!round) throw new Error('Runde fehlt');
  if (round.status !== 'final') throw new Error('Runde ist nicht abgeschlossen');
  const rep = await one('select * from reports where round_id=$1', [roundId]);
  if (rep && rep.text && !force) return ['Bericht vorhanden'];
  const facts = await buildFacts(roundId);
  try { const g = await generateReportText(facts);
    await q(`insert into reports(round_id,text,facts,model,created_at,error) values($1,$2,$3,$4,now(),null) on conflict(round_id) do update set text=excluded.text, facts=excluded.facts, model=excluded.model, created_at=now(), error=null`, [roundId, g.text, JSON.stringify(facts), g.model]);
    return ['Bericht erstellt (' + g.model + ')']; }
  catch (e) { await q(`insert into reports(round_id,facts,error) values($1,$2,$3) on conflict(round_id) do update set facts=excluded.facts, error=excluded.error`, [roundId, JSON.stringify(facts), e.message]); throw e; }
}
