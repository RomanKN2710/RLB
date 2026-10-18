/* Eingang fuer kicker-Seiten vom Handy: ein Kurzbefehl (iOS) oder eine Browser-Erweiterung schickt den
   Quelltext der geoeffneten kicker-Seite an /api/kicker-inbox. Die Seite wird erkannt (Spiel-Aufstellung
   oder Elf des Tages, Spieltag), ausgeduennt und abgelegt; der Admin importiert den Eingang mit einem Klick. */
import { q, one } from './db';
import { slimHtml, classify, parseElfDesTages } from './kicker-parse.js';

let ready = false;
async function ensureTable() {
  if (ready) return;
  await q(`create table if not exists kicker_pages (matchday int not null, page_id text not null, kind text not null, title text, html text not null, at timestamptz not null default now(), primary key (matchday, page_id))`);
  ready = true;
}

export { slimHtml, classify };

export async function savePage(html, opts = {}) {
  await ensureTable();
  const c = classify(html, opts.url || ''); let md = opts.matchday || c.matchday;
  // Elf des Tages: nennt die Adresse den Spieltag nicht, gehoert sie zur Runde in Auswertung (Deadline vorbei, noch nicht final),
  // sonst zum Spieltag, dessen Spiele zuletzt eingegangen sind. Ein nur aus dem Seitentext geratener Spieltag zaehlt weniger als die Runde in Auswertung.
  let parsedElf = null; let paarung = null;
  if (c.kind === 'unknown') throw new Error(`Keine Aufstellungsseite: «${c.title}» – bei kicker den Reiter «Aufstellung» öffnen, nicht Spielbericht/Ticker`);
  if (c.kind === 'elf') { parsedElf = parseElfDesTages(html);
    if (!opts.matchday && c.matchdaySource !== 'url') { const pend = await one("select matchday from rounds where type='regulaer' and status='open' and deadline is not null and deadline <= now() order by number desc limit 1");
      const last = await one("select matchday from kicker_pages where kind='match' order by at desc limit 1"); md = (pend && pend.matchday) || (last && last.matchday) || md; } }
  else {
    // Aufstellungsseite: Spieltag verbindlich aus der Paarung im Spielplan; Zahlen aus dem Seitentext nur als Rueckfall
    const { matchdayOfPage } = await import('./kicker'); const mp = await matchdayOfPage(html).catch(() => null);
    if (mp) { paarung = mp.paarung; if (!opts.matchday) md = mp.matchday; else if (opts.matchday !== mp.matchday) throw new Error(`${mp.paarung} gehört laut Spielplan zu Spieltag ${mp.matchday}, nicht ${opts.matchday}`); }
    if (!c.id) c.id = mp ? String(mp.matchId) : null;
  }
  if (!md) throw new Error('Spieltag nicht erkennbar – bitte ?matchday=N mitgeben');
  if (c.kind === 'match' && !c.id) throw new Error('Spiel-Kennung nicht erkennbar');
  const slim = slimHtml(html);
  await q(`insert into kicker_pages(matchday,page_id,kind,title,html,at) values($1,$2,$3,$4,$5,now()) on conflict(matchday,page_id) do update set kind=excluded.kind, title=excluded.title, html=excluded.html, at=now()`, [md, c.id, c.kind, paarung || c.title, slim]);
  const st = await status(md);
  return { ...c, title: paarung || c.title, matchday: md, bytes: slim.length, status: st, elf: parsedElf ? { n: parsedElf.elf.length, sdt: parsedElf.sdt ? parsedElf.sdt.name : null, how: parsedElf.diag.how, links: parsedElf.diag.playerLinks } : null };
}

export async function status(matchday) {
  await ensureTable();
  const rows = await q('select page_id, kind, title, at, length(html) as bytes from kicker_pages where matchday=$1 order by at', [matchday]);
  const elfRow = rows.find(r => r.kind === 'elf');
  // Elf des Tages unter einem anderen Spieltag abgelegt (z. B. Spieltag aus der kicker-Seite falsch gelesen)? Zum Verschieben anbieten
  const elsewhere = elfRow ? [] : (await q("select matchday, title, at from kicker_pages where kind='elf' and matchday<>$1 order by at desc", [matchday])).map(r => ({ matchday: r.matchday, title: r.title, at: r.at }));
  return { matchday, matches: rows.filter(r => r.kind === 'match').map(r => ({ id: r.page_id, title: r.title, at: r.at })), elf: !!elfRow, elfTitle: elfRow ? elfRow.title : null, elfAt: elfRow ? elfRow.at : null, elfElsewhere: elsewhere, n: rows.filter(r => r.kind === 'match').length };
}

export async function pages(matchday) {
  await ensureTable();
  const rows = await q('select page_id, kind, html from kicker_pages where matchday=$1 order by at', [matchday]);
  return { matches: rows.filter(r => r.kind === 'match').map(r => r.html), elf: (rows.find(r => r.kind === 'elf') || {}).html || '' };
}

/** Eine abgelegte Seite (zum Nachsehen, wenn der Import sie nicht lesen kann). */
export async function page(matchday, pageId) { await ensureTable(); return one('select kind, title, html, at from kicker_pages where matchday=$1 and page_id=$2', [matchday, pageId]); }

/** Elf des Tages von einem Spieltag zu einem anderen verschieben (falsch zugeordnet). */
export async function moveElf(fromMd, toMd) { await ensureTable(); await q("delete from kicker_pages where matchday=$1 and kind='elf'", [toMd]); const r = await q("update kicker_pages set matchday=$2, at=now() where matchday=$1 and kind='elf' returning page_id", [fromMd, toMd]); return r.length; }

export async function clear(matchday) { await ensureTable(); await q('delete from kicker_pages where matchday=$1', [matchday]); }

/** Alle Eingaenge (je Spieltag) fuer die Admin-Uebersicht. */
export async function allStatus() {
  await ensureTable();
  const rows = await q('select matchday, kind, page_id, title, at from kicker_pages order by matchday, at');
  const out = {}; rows.forEach(r => { const o = out[r.matchday] ||= { matchday: r.matchday, matches: [], elf: false, n: 0, at: r.at }; if (r.kind === 'elf') o.elf = true; else { o.matches.push({ id: r.page_id, title: r.title }); o.n++; } if (r.at > o.at) o.at = r.at; });
  return Object.values(out);
}
