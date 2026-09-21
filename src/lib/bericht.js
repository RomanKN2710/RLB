/* Spieltagsbericht: nach Abschluss einer Runde schreibt Claude aus den Fakten der Runde (Aufstellungen, kicker-Werte, Tabelle,
   Potential, Blog-Einträge) einen unterhaltsamen Bericht mit einem Abschnitt je Manager. Der Bericht wird gespeichert, auf der
   Seite /bericht gezeigt und einmal als Sammel-Mail an alle Manager verschickt, mit Tabelle und Potential-Tabelle und der Bitte,
   die Werte zu kontrollieren. Benötigt ANTHROPIC_API_KEY sowie RESEND_API_KEY oder SMTP_URL und MAIL_FROM. */
import Anthropic from '@anthropic-ai/sdk';
import { q, one, getSetting } from './db';
import * as D from './data';
import * as R from './rules';
import { potential } from './potential';

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
  return { runde: round.label, spieltag: round.matchday, spiele: matches, team_der_runde: round.tdr || [], spieler_des_tages: round.sdt || null,
    tabelle: table.map(t => ({ rang: t.rank, manager: b.managerName[t.manager_id], rangpunkte: t.total, ...Object.fromEntries(R.CATS.map(([c]) => [CATS_DE[c], t.tot[c]])) })),
    potential_tabelle: pot ? pot.potentialTable.map(t => ({ rang: t.rank, manager: b.managerName[t.manager_id], rangpunkte: t.total, echt_rang: pot.actual.find(x => x.manager_id === t.manager_id).rank })) : null,
    verpasste_rangpunkte: pot ? b.managerIds.map(m => ({ manager: b.managerName[m], echt: pot.alone[m].actualRp, allein_optimal: pot.alone[m].rp, verpasst: pot.alone[m].gain })) : null,
    manager: managers };
}

const SYSTEM = `Du schreibst den Spieltagsbericht für die "Rotissery League Bundesliga" (RLB), ein privates Bundesliga-Managerspiel mit zehn Managern (Pädi, Arbi, Röfe, Mark, Roman, Mike, Dani, Lazar, René, David), die sich seit Jahren kennen. Ton: unterhaltsam, ironisch, liebevoll frech, wie ein Sportkolumnist unter Freunden. Schweizer Rechtschreibung (ss statt ß). Deutsch.

Regeln:
- Nur Fakten aus den gelieferten Daten verwenden. Nichts erfinden, keine Ereignisse behaupten, die nicht in den Daten stehen. Zahlen exakt übernehmen.
- Aufbau: kurze Lage (Tabelle, Aufsteiger, Absteiger), dann ein Abschnitt je Manager (alle zehn, in Tabellenreihenfolge), dann "Elf des Tages" (kurz), dann "Ausblick" (zwei Sätze).
- Je Manager: was seine Spieler geleistet haben (Tore, Vorlagen, Zu-null, Karten, Team der Runde), wer nicht gespielt hat, was die Aufstellung war (Wechsel laut Blog, späte Updates, keine Abgabe), und was die Potential-Daten sagen (beste Elf im Nachhinein, Bankspieler die gezündet hätten). Offensichtliche Fehler humorvoll kommentieren, aber niemanden blossstellen.
- Länge: 600 bis 900 Wörter. Markdown mit ## für die Lage und ### je Manager. Fettdruck sparsam.
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

function tableHtml(rows, cols) { return `<table cellpadding="4" style="border-collapse:collapse;font-size:13px"><tr>${cols.map(c => `<th align="left" style="border-bottom:1px solid #999">${c[1]}</th>`).join('')}</tr>${rows.map(r => `<tr>${cols.map(c => `<td style="border-bottom:1px solid #eee">${r[c[0]] ?? ''}</td>`).join('')}</tr>`).join('')}</table>`; }

/** Mail an alle Manager (eine Sammel-Mail). Resend (RESEND_API_KEY) oder SMTP (SMTP_URL). */
export async function sendReportMail(round, report, facts) {
  const to = (await q("select email from users where email is not null and email <> ''")).map(u => u.email);
  if (!to.length) throw new Error('Keine Empfänger');
  const from = process.env.MAIL_FROM; if (!from) throw new Error('MAIL_FROM fehlt');
  const app = process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : 'https://rlb-nine.vercel.app');
  const fmt = n => Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
  const tab = tableHtml(facts.tabelle.map(t => ({ ...t, rangpunkte: fmt(t.rangpunkte) })), [['rang', '#'], ['manager', 'Manager'], ['rangpunkte', 'Rangpunkte'], ['Punkte', 'Pkt'], ['Zu-null', 'Zu-null'], ['Assists', 'Ass'], ['Tore', 'Tore'], ['Karten', 'Karten'], ['Team der Runde', 'TdR'], ['Starts', 'Starts']]);
  const pot = facts.potential_tabelle ? tableHtml(facts.potential_tabelle.map(t => ({ ...t, rangpunkte: fmt(t.rangpunkte) })), [['rang', '#'], ['manager', 'Manager'], ['rangpunkte', 'Rangpunkte (alle optimal)'], ['echt_rang', 'echter Rang']]) : '';
  const miss = facts.verpasste_rangpunkte ? tableHtml(facts.verpasste_rangpunkte.map(t => ({ ...t, echt: fmt(t.echt), allein_optimal: fmt(t.allein_optimal), verpasst: fmt(t.verpasst) })), [['manager', 'Manager'], ['echt', 'echt'], ['allein_optimal', 'allein optimal'], ['verpasst', 'verpasst']]) : '';
  const html = `<div style="font-family:system-ui,Arial,sans-serif;max-width:720px;line-height:1.45">
    <p style="color:#666;font-size:13px">RLB Managerspiel · ${round.label}</p>
    ${md2html(report.text)}
    <h2>Tabelle nach ${round.label}</h2>${tab}
    ${pot ? `<h2>Potential-Tabelle</h2><p style="font-size:13px;color:#666">Alle Manager mit ihrer im Nachhinein besten Elf.</p>${pot}<h3>Verpasste Rangpunkte</h3><p style="font-size:13px;color:#666">Jeder allein optimal, die anderen wie gespielt.</p>${miss}` : ''}
    <hr><p><b>Bitte kontrollieren:</b> Schaut eure Aufstellung und Werte für ${round.label} in der App nach (<a href="${app}/runde/${round.id}">${app}/runde/${round.id}</a>). Stimmt etwas nicht, meldet euch bei den Admins. Bericht und Tabellen findet ihr auch unter <a href="${app}/bericht">${app}/bericht</a>.</p>
    <p style="color:#999;font-size:12px">Automatisch erstellt nach Abschluss der Runde.</p></div>`;
  const subject = `RLB ${round.label}: Spieltagsbericht, Tabelle und Potential`;
  const text = report.text + `\n\nTabelle: ${facts.tabelle.map(t => `${t.rang}. ${t.manager} ${fmt(t.rangpunkte)}`).join(', ')}\n\nBitte kontrolliert eure Werte in der App: ${app}/runde/${round.id}`;
  if (process.env.RESEND_API_KEY) {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { authorization: 'Bearer ' + process.env.RESEND_API_KEY, 'content-type': 'application/json' }, body: JSON.stringify({ from, to, subject, html, text }) });
    if (!r.ok) throw new Error('Resend: ' + r.status + ' ' + (await r.text()).slice(0, 300));
  } else if (process.env.SMTP_URL) {
    const nodemailer = (await import('nodemailer')).default;
    const tr = nodemailer.createTransport(process.env.SMTP_URL); await tr.sendMail({ from, to, subject, html, text });
  } else throw new Error('Kein Mailversand konfiguriert (RESEND_API_KEY oder SMTP_URL)');
  return to;
}

/** Bericht erstellen (falls fehlend oder force) und Mail versenden (falls noch nicht gesendet oder force). */
export async function createAndSend(roundId, { force = false, resend = false } = {}) {
  await ensureTable(); const round = await D.roundById(roundId); if (!round) throw new Error('Runde fehlt');
  if (round.status !== 'final') throw new Error('Runde ist nicht abgeschlossen');
  let rep = await one('select * from reports where round_id=$1', [roundId]); const log = [];
  if (!rep || !rep.text || force) {
    const facts = await buildFacts(roundId);
    try { const g = await generateReportText(facts);
      await q(`insert into reports(round_id,text,facts,model,created_at,error) values($1,$2,$3,$4,now(),null) on conflict(round_id) do update set text=excluded.text, facts=excluded.facts, model=excluded.model, created_at=now(), error=null, sent_at=case when $5 then null else reports.sent_at end`, [roundId, g.text, JSON.stringify(facts), g.model, force]);
      log.push('Bericht erstellt (' + g.model + ')'); }
    catch (e) { await q(`insert into reports(round_id,facts,error) values($1,$2,$3) on conflict(round_id) do update set facts=excluded.facts, error=excluded.error`, [roundId, JSON.stringify(facts), e.message]); throw e; }
    rep = await one('select * from reports where round_id=$1', [roundId]);
  }
  if (!rep.sent_at || resend) {
    try { const to = await sendReportMail(round, rep, rep.facts); await q('update reports set sent_at=now(), sent_to=$2, error=null where round_id=$1', [roundId, to]); log.push(`Mail an ${to.length} Empfänger`); }
    catch (e) { await q('update reports set error=$2 where round_id=$1', [roundId, 'Mail: ' + e.message]); log.push('Mail fehlgeschlagen: ' + e.message); }
  }
  return log;
}
