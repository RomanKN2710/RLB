/* Eingang fuer kicker-Seiten vom Handy: ein Kurzbefehl (iOS) oder eine Browser-Erweiterung schickt den
   Quelltext der geoeffneten kicker-Seite an /api/kicker-inbox. Die Seite wird erkannt (Spiel-Aufstellung
   oder Elf des Tages, Spieltag), ausgeduennt und abgelegt; der Admin importiert den Eingang mit einem Klick. */
import { q, one } from './db';

let ready = false;
async function ensureTable() {
  if (ready) return;
  await q(`create table if not exists kicker_pages (matchday int not null, page_id text not null, kind text not null, title text, html text not null, at timestamptz not null default now(), primary key (matchday, page_id))`);
  ready = true;
}

/** Skripte, Stile und Kommentare entfernen (wie der Ruckfall im Browser), damit die Seite klein bleibt. */
export const slimHtml = html => String(html || '')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, '')
  .replace(/<link\b[^>]*>/gi, '').replace(/<picture\b[\s\S]*?<\/picture>/gi, '');

/** Art der Seite, Spieltag und Kennung aus dem rohen Quelltext lesen. */
export function classify(html, hintUrl = '') {
  const h = String(html || ''); const title = ((h.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim();
  const elfMd = (h.match(/elf-des-tages\/\d{4}-\d{2}\/(\d+)/) || (hintUrl.match(/elf-des-tages\/\d{4}-\d{2}\/(\d+)/)) || [])[1];
  if (elfMd || /Elf des Tages/i.test(title)) return { kind: 'elf', matchday: elfMd ? Number(elfMd) : null, id: 'elf', title: title || 'Elf des Tages' };
  const hasLineup = /kick__lineup__teamrow/.test(h);
  const id = (h.match(/rel="canonical" href="[^"]*?-(\d+)\/(?:aufstellung|spielbericht|schema|analyse|spielinfo|ticker)?"?/) || h.match(/\/([0-9]{6,})\/aufstellung/) || hintUrl.match(/-(\d+)\/\w*$/) || [])[1];
  const md = (h.match(/bundesliga_\d{4}-\d{2}_(\d+)/) || h.match(/"spieltag"\s*:\s*"?(\d+)/i) || [])[1];
  const teams = [...h.matchAll(/kick__lineup__teamrow__teamname[^>]*>\s*([^<]+?)\s*</g)].map(m => m[1].replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCharCode(parseInt(x, 16))).replace(/&amp;/g, '&')).slice(0, 2);
  return { kind: hasLineup ? 'match' : 'unknown', matchday: md ? Number(md) : null, id: id || null, title: teams.length === 2 ? teams.join(' – ') : title.replace(/\s*\|.*$/, '') };
}

export async function savePage(html, opts = {}) {
  await ensureTable();
  const c = classify(html, opts.url || ''); const md = opts.matchday || c.matchday;
  if (!md) throw new Error('Spieltag nicht erkennbar – bitte ?matchday=N mitgeben');
  if (c.kind === 'unknown') throw new Error(`Keine Aufstellungsseite: «${c.title}» – bei kicker den Reiter «Aufstellung» öffnen, nicht Spielbericht/Ticker`);
  if (c.kind === 'match' && !c.id) throw new Error('Spiel-Kennung nicht erkennbar');
  const slim = slimHtml(html);
  await q(`insert into kicker_pages(matchday,page_id,kind,title,html,at) values($1,$2,$3,$4,$5,now()) on conflict(matchday,page_id) do update set kind=excluded.kind, title=excluded.title, html=excluded.html, at=now()`, [md, c.id, c.kind, c.title, slim]);
  const st = await status(md);
  return { ...c, matchday: md, bytes: slim.length, status: st };
}

export async function status(matchday) {
  await ensureTable();
  const rows = await q('select page_id, kind, title, at, length(html) as bytes from kicker_pages where matchday=$1 order by at', [matchday]);
  return { matchday, matches: rows.filter(r => r.kind === 'match').map(r => ({ id: r.page_id, title: r.title, at: r.at })), elf: rows.some(r => r.kind === 'elf'), n: rows.filter(r => r.kind === 'match').length };
}

export async function pages(matchday) {
  await ensureTable();
  const rows = await q('select page_id, kind, html from kicker_pages where matchday=$1 order by at', [matchday]);
  return { matches: rows.filter(r => r.kind === 'match').map(r => r.html), elf: (rows.find(r => r.kind === 'elf') || {}).html || '' };
}

export async function clear(matchday) { await ensureTable(); await q('delete from kicker_pages where matchday=$1', [matchday]); }
