/* Reine Parser fuer kicker-Seiten (ohne Datenbank, damit testbar): Elf des Tages, Seitenerkennung, Ausduennen.
   kicker liefert je nach Geraet (Handy, Desktop, App-Ansicht) unterschiedliches HTML; darum mehrere Lesarten
   nacheinander, und eine Diagnose, was auf der Seite gefunden wurde, wenn nichts passt. */
import * as cheerio from 'cheerio';

export const teamOfHref = href => (String(href).split('/spieler/')[1] || '').split('/').slice(1).join('/');
const slugifyName = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
export const slugOfHref = href => { const m = String(href).match(/kicker\.\w+\/([^/]+)\/spieler\//) || String(href).match(/^\/([^/]+)\/spieler\//); return m ? m[1] : ''; };
const decode = s => String(s || '').replace(/&#x([0-9a-f]+);/gi, (_, x) => String.fromCharCode(parseInt(x, 16))).replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d))).replace(/&amp;/g, '&').replace(/&quot;/g, '"');

/** Skripte, Stile und Kommentare entfernen (wie der Rueckfall im Browser), damit die Seite klein bleibt. */
export const slimHtml = html => String(html || '')
  .replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg|iframe|template)\b[\s\S]*?<\/\1>/gi, '')
  .replace(/<link\b[^>]*>/gi, '').replace(/<picture\b[\s\S]*?<\/picture>/gi, '');

/** Art der Seite, Spieltag und Kennung aus dem rohen Quelltext lesen. hintUrl: Adresse der Seite, falls der Sender sie mitgibt. */
export function classify(html, hintUrl = '') {
  const h = String(html || ''); const title = decode(((h.match(/<title>([^<]*)<\/title>/i) || [])[1] || '').trim());
  const h1 = decode(((h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1] || '').replace(/<[^>]+>/g, '').trim());
  // Elf des Tages: an der Adresse (auch in canonical/og:url), am Titel oder an der Ueberschrift
  const elfMd = (hintUrl.match(/elf-des-tages\/\d{4}-\d{2}\/(\d+)/) || h.match(/elf-des-tages\/\d{4}-\d{2}\/(\d+)/) || hintUrl.match(/elf-des-tages[^"'\s]*?[/=](\d{1,2})(?:[/?#]|$)/) || [])[1];
  const isElf = !!elfMd || /elf-des-tages/i.test(hintUrl) || /Elf des Tages/i.test(title) || /Elf des Tages/i.test(h1) || (/elf-des-tages/.test(h) && !/kick__lineup__teamrow/.test(h) && /Spieler des Tages/i.test(h));
  // Spieltag: Tracking-Kennung "…_bundesliga_2026-27_3", sonst JSON "spieltag":3, sonst Brotkrumen/Titel "3. Spieltag"
  const md = (h.match(/bundesliga_\d{4}-\d{2}_(\d+)/) || h.match(/"spieltag"\s*:\s*"?(\d+)/i) || h.match(/(\d{1,2})\.\s*Spieltag/) || title.match(/(\d{1,2})\.\s*Spieltag/) || [])[1];
  if (isElf) { const tmd = (title.match(/(\d{1,2})\.\s*Spieltag/) || h1.match(/(\d{1,2})\.\s*Spieltag/) || h.match(/bundesliga_\d{4}-\d{2}_(\d+)/) || h.match(/"spieltag"\s*:\s*"?(\d+)/i) || [])[1];
    return { kind: 'elf', matchday: elfMd ? Number(elfMd) : tmd ? Number(tmd) : null, matchdaySource: elfMd ? 'url' : tmd ? 'page' : null, id: 'elf', title: title || h1 || 'Elf des Tages' }; }
  const hasLineup = /kick__lineup__teamrow/.test(h);
  const id = (h.match(/rel="canonical" href="[^"]*?-(\d+)\/(?:aufstellung|spielbericht|schema|analyse|spielinfo|ticker)?"?/) || h.match(/\/([0-9]{6,})\/aufstellung/) || h.match(/-(\d{6,})\/(?:aufstellung|spielbericht|schema|analyse|spielinfo|ticker)\b/) || hintUrl.match(/-(\d+)\/\w*\/?$/) || [])[1];
  const teams = [...h.matchAll(/kick__lineup__teamrow__teamname[^>]*>\s*([^<]+?)\s*</g)].map(m => decode(m[1])).slice(0, 2);
  return { kind: hasLineup ? 'match' : 'unknown', matchday: md ? Number(md) : null, id: id || null, title: teams.length === 2 ? teams.join(' – ') : title.replace(/\s*\|.*$/, '') };
}

/** Elf-des-Tages-Seite: 11 Spieler {slug, name, team} und Spieler des Tages. diag sagt, was die Seite hergab. */
export function parseElfDesTages(html) {
  const $ = cheerio.load(html);
  const nameOf = a => decode($(a).find('.kick__lineup-player-card__name, [class*="player-card__name"], [class*="__name"]').first().text().trim() || $(a).find('img').attr('alt') || $(a).attr('title') || $(a).text().replace(/\s+/g, ' ').trim() || slugOfHref($(a).attr('href')).replace(/-/g, ' '));
  const toPlayer = a => ({ slug: slugOfHref($(a).attr('href')), name: nameOf(a), team: teamOfHref($(a).attr('href')).split('/').pop(), fullName: $(a).find('img').attr('alt') || '' });
  const uniq = list => { const seen = new Set(); return list.filter(p => p.slug && !seen.has(p.slug) && seen.add(p.slug)); };
  const isPlayerLink = a => /\/spieler\//.test($(a).attr('href') || '');
  const diag = { playerLinks: $('a[href*="/spieler/"]').length, title: $('title').text().trim(), how: '' };
  // Noch nicht veroeffentlicht («Die Elf des Tages liegt noch nicht vor»): nichts raten, die Seite zeigt dann nur Ranglisten
  if (/liegt noch nicht vor|noch nicht ver(ö|oe)ffentlicht/i.test($('body').text()) && !$('.kick__lineup-field a[href*="/spieler/"]').length) { diag.how = 'unveroeffentlicht'; return { elf: [], sdt: null, diag }; }
  // Spielerlinks in Navigation, Ranglisten-Tabellen («Berufungen») und Seitenleisten zaehlen bei den Rueckfall-Lesarten nicht
  const noise = e => $(e).closest('nav, table, [class*="navbar"], [class*="ranking"], [class*="playersoftheday"], footer, header').length > 0;
  // 1) Spielfeld mit Spielerkarten (Desktop und Handy), 2) Spielerkarten irgendwo, 3) Spielerlinks in einem Aufstellungs-Block,
  // 4) die ersten elf verschiedenen Spielerlinks nach der Ueberschrift «Elf des Tages» (Listenansicht)
  let elf = [];
  const tries = [['feld', () => $('.kick__lineup-field a.kick__lineup-player-card').toArray()], ['karten', () => $('a.kick__lineup-player-card, a[class*="lineup-player-card"]').toArray()],
    ['block', () => $('[class*="lineup"], [class*="elf-des-tages"], [class*="eleven"]').find('a[href*="/spieler/"]').toArray().filter(e => !noise(e))],
    ['liste', () => { const all = $('body *').toArray(); const starts = all.map((e, i) => /^h[1-5]$/i.test(e.tagName) && /Elf des Tages/i.test($(e).text()) ? i : -1).filter(i => i >= 0); if (!starts.length) starts.push(-1);
      // von jeder Ueberschrift «Elf des Tages» bis «Spieler des Tages» sammeln; die Ueberschrift direkt ueber der Liste (wenigste Links, aber elf) gewinnt
      const collect = from => { const links = []; for (let i = from + 1; i < all.length; i++) { const e = all[i]; if (/^h[1-5]$/i.test(e.tagName) && /Spieler des Tages/i.test($(e).text())) break; if (e.tagName === 'a' && isPlayerLink(e) && !noise(e)) links.push(e); } return links; };
      const cands = starts.map(collect).sort((x, y) => (uniq(x.map(toPlayer)).length >= 11 ? 0 : 1) - (uniq(y.map(toPlayer)).length >= 11 ? 0 : 1) || x.length - y.length); return cands[0] || []; }]];
  for (const [how, fn] of tries) { const found = uniq(fn().map(toPlayer)); if (found.length >= 11) { elf = found.slice(0, 11); diag.how = how; break; } if (found.length > elf.length) { elf = found; diag.how = how; } }
  // 5) ohne Spielerlinks (Handy-Layout): Spielerkarten beliebiger Art oder Bilder/Namen nach der Ueberschrift «Elf des Tages»;
  //    der Spieler wird dann ueber den Namen zugeordnet (ohne Verein)
  if (elf.length < 11) {
    const byName = list => { const seen = new Set(); return list.map(n => decode(n).replace(/\s+/g, ' ').trim()).filter(n => n && n.length >= 2 && n.length <= 40 && !/Elf des Tages|Spieler des Tages|kicker/i.test(n)).filter(n => !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase())).map(n => ({ slug: slugifyName(n), name: n, team: '', fullName: n })); };
    const cards = $('[class*="player-card"], [class*="playercard"], [class*="lineup-player"], [class*="lineup__player"]').toArray().map(e => $(e).find('[class*="__name"], [class*="-name"]').first().text().trim() || $(e).find('img').attr('alt') || $(e).attr('title') || $(e).text());
    let found = byName(cards);
    if (found.length < 11) { const all = $('body *').toArray(); const start = all.findIndex(e => /^h[1-5]$/i.test(e.tagName) && /Elf des Tages/i.test($(e).text())); const names = [];
      for (let i = start + 1; i < all.length && names.length < 40; i++) { const e = all[i]; if (/^h[1-5]$/i.test(e.tagName) && /Spieler des Tages/i.test($(e).text())) break; if (noise(e)) continue; if (e.tagName === 'img' && $(e).attr('alt')) names.push($(e).attr('alt')); else if (/name/i.test($(e).attr('class') || '') && $(e).children().length === 0) names.push($(e).text()); }
      const f2 = byName(names); if (f2.length > found.length) found = f2; }
    if (found.length > elf.length) { elf = found.slice(0, 11); diag.how = 'namen'; }
  }
  // Spieler des Tages: Ueberschrift, dann der erste Spielerlink im selben Kasten, sonst der naechste im Dokument
  let sdt = null;
  const heads = $('h1, h2, h3, h4, h5, [class*="headline"], strong, b').toArray().filter(e => /Spieler des Tages/i.test($(e).text()) && $(e).text().trim().length < 60);
  for (const hEl of heads) {
    let a = null;
    const hero = $(hEl).closest('.kick__player-hero, [class*="player-hero"], [class*="hero"]');
    // cheerio liefert bei Komma-Selektoren Dokumentreihenfolge (das leere Bild-Link zuerst), darum nacheinander probieren
    if (hero.length) for (const sel of ['h2 a[href*="/spieler/"]', 'h1 a[href*="/spieler/"]', 'h3 a[href*="/spieler/"]', 'a[href*="/spieler/"]']) { const cand = hero.find(sel).filter((_, e) => $(e).text().trim().length > 1).first(); if (cand.length) { a = cand.get(0); break; } }
    if (!a) { const sib = $(hEl).nextAll('h1, h2, h3, h4').first().find('a[href*="/spieler/"]').first(); if (sib.length) a = sib.get(0); }   // Ueberschrift, dann h2 mit dem Namen
    if (!a) for (const sel of ['[class*="card"]', 'section', 'article']) { const box = $(hEl).closest(sel); if (box.length && !box.find('.kick__lineup-field').length) { const cand = box.find('a[href*="/spieler/"]').first(); if (cand.length) { a = cand.get(0); break; } } }
    if (!a) { const all = $('body *').toArray(); const i = all.indexOf(hEl); for (let k = i + 1; k < all.length; k++) if (all[k].tagName === 'a' && isPlayerLink(all[k])) { a = all[k]; break; } }
    if (a) { const p = toPlayer(a); sdt = { slug: p.slug, name: p.name.replace(/\s+\d+$/, ''), team: p.team }; break; }
  }
  if (!sdt) { const m = String(html).match(/Spieler des Tages[\s\S]{0,600}?href="([^"]*\/spieler\/[^"]*)"/i); if (m) sdt = { slug: slugOfHref(m[1]), name: slugOfHref(m[1]).replace(/-/g, ' '), team: teamOfHref(m[1]).split('/').pop() }; }
  if (!sdt) { for (const hEl of heads) { const all = $('body *').toArray(); const i = all.indexOf(hEl); for (let k = i + 1; k < Math.min(all.length, i + 80); k++) { const e = all[k]; const n = e.tagName === 'img' ? $(e).attr('alt') : /name/i.test($(e).attr('class') || '') && $(e).children().length === 0 ? $(e).text() : ''; if (n && n.trim().length >= 2) { const nm = decode(n).trim(); sdt = { slug: slugifyName(nm), name: nm, team: '' }; break; } } if (sdt) break; } }
  // Kurzname wie auf der Spielerkarte («Nkunku» statt «Christopher Nkunku»), wenn der Spieler des Tages in der Elf steht
  if (sdt) { const inElf = elf.find(p => p.slug && p.slug === sdt.slug); if (inElf && inElf.name) sdt.name = inElf.name; }
  return { elf, sdt, diag };
}
