/* Gebote aus eingefuegtem Text (Blog-Posts der weitergeleiteten Gebots-Mails). Pro Manager ein Post, darin ein oder
   mehrere Gebote in Reihenfolge ("Biete für max. 3 Spieler: …", "19.- für Doué", "M Dinkci, Bremen CHF 2.00",
   "Mensah, Köln, V, 3 und entlasse Lerma. Ihn gleich für Bensebaini einwechseln"), die Entlassungen (je Gebot oder als
   Reihenfolge) und Eventualauftraege ("wechsle ich für Suzuki ein"). Reine Funktionen ohne Datenbank; Entlassung und
   Eventualauftrag werden gegen den Kader des Managers aufgeloest, der Gebotsspieler bleibt Text (Name, Verein, Position). */
import { norm } from './rules.js';
import { splitBlocks, findPlayer, words, posList, CLUBWORDS, SIG, dateLine, zurich } from './aufstellungstext.js';

// Vereinsworte -> Vereins-Kennung der App (norm: Umlaute zusammengezogen)
const CLUB = { bvb: 'Dortmund', dortmund: 'Dortmund', hsv: 'Hamburg', hamburg: 'Hamburg', hamburger: 'Hamburg', bayern: 'Bayern', munchen: 'Bayern', union: 'Union', berlin: 'Union', frankfurt: 'Frankfurt', eintracht: 'Frankfurt', sge: 'Frankfurt', leipzig: 'Leipzig', rb: 'Leipzig', rbl: 'Leipzig', bremen: 'Bremen', werder: 'Bremen', stuttgart: 'Stuttgart', vfb: 'Stuttgart', freiburg: 'Freiburg', scf: 'Freiburg', augsburg: 'Augsburg', fca: 'Augsburg', koln: 'Köln', hoffenheim: 'Hoffenheim', tsg: 'Hoffenheim', leverkusen: 'Leverkusen', bayer: 'Leverkusen', mainz: 'Mainz', elversberg: 'Elversberg', paderborn: 'Paderborn', schalke: 'Schalke', s04: 'Schalke', gladbach: 'Gladbach', monchengladbach: 'Gladbach' };
const NUMWORD = { einen: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, funf: 5, fuenf: 5 };
const isBidLike = t => /\b(gebote?|biete|bieten)\b/i.test(t);
export { isBidLike };

/** Preis in einer Zeile finden: "CHF 12", "12 CHF", "Fr. 5.-", "12.-", "2-", "…, V, 3 und entlasse", "… 3" am Ende. Liefert {price, rest}. */
function takePrice(line) {
  const pats = [/(?:CHF|Fr\.?|SFr\.?)\s*(\d{1,3})(?:[.,]\d{1,2})?\s*(?:\.?-{1,2})?/i, /(\d{1,3})(?:[.,]\d{1,2})?\s*(?:\.?-{1,2})?\s*(?:CHF|Fr\.?|Franken)\b/i, /(\d{1,3})(?:[.,]\d{1,2})?\s*\.?-{1,2}(?=\s|$|\.|,)/, /,\s*(\d{1,3})\s*(?=(?:und|für|fuer)\b)/i, /(?:^|\s)(\d{1,3})\s*$/];
  for (const re of pats) { const m = line.match(re); if (m) { const n = Number(m[1]); if (n >= 1 && n <= 200) return { price: n, rest: (line.slice(0, m.index) + ' ' + line.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim() }; } }
  return null;
}

/** Spielerangabe zerlegen: "M Nwaneri (Dortmund)", "Doué Guena, Leverkusen", "Brackelmann (V, Augsburg)", "Nwaneri (M, BVB)" -> {name, club, pos}. */
export function playerSpec(raw) {
  let s = String(raw || '').replace(/^[\s\-–•*:]+/, '').replace(/^\d+[.)]\s*/, '').trim();
  let pos = null, club = null;
  // Klammern: Position und/oder Verein
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => { for (const t of inner.split(/[,\/\s]+/).filter(Boolean)) { if (!pos && /^[TVMS]$/i.test(t)) pos = t.toUpperCase(); else if (CLUB[norm(t)]) club = CLUB[norm(t)]; } return ' '; });
  const toks = s.split(/[\s,;]+/).filter(Boolean); const rest = [];
  for (const t of toks) {
    const n = norm(t);
    if (!pos && /^[TVMS]$/i.test(t)) { pos = t.toUpperCase(); continue; }
    if (!pos && posList(t).length === 1 && t.length <= 3 && !/^[a-z]/.test(t) && t !== t.toLowerCase()) { pos = posList(t)[0]; continue; }
    if (CLUB[n]) { club = club || CLUB[n]; continue; }
    if (CLUBWORDS.has(n) || /^(fc|sc|sv|fsv|vfl|tsg|borussia|\d+)$/i.test(t)) continue;
    rest.push(t);
  }
  const name = rest.join(' ').replace(/[.:;,]+$/, '').trim();
  return { name, club, pos };
}

/** Gebots-Post eines Managers lesen. kader: aktive Spieler des Managers (fuer Entlassung und Eventualauftrag). */
function readBidPost(lines, kader, title = '') {
  const bids = [], releases = [], notes = [], unmatched = []; let maxWins = null, mode = 'bid', stop = false, fallback = null; let seg = null, relTarget = null, pendingSwap = null, sinceRelease = 0;   // seg: Gebot, zu dem Folgezeilen gehoeren
  const clean = lines.map(l => l.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()); let titleSeen = false;
  const resolve = (name, quiet) => { const { hits } = findPlayer(name, kader); if (hits.length === 1) return hits[0]; if (hits.length > 1) notes.push(`«${name}» ist mehrdeutig: ${hits.map(h => h.name).join(' oder ')}`); else if (!quiet) unmatched.push(name); return null; };
  const releaseNames = txt => String(txt).replace(/\([^)]*\)/g, ' ').split(/\s*[,;]\s*|\s+(?:und|&|oder)\s+/).map(x => playerSpec(x).name).filter(n => n && norm(n).length >= 3 && !/^(in|der|die|folgender|folgende|reihenfolge|ich|dafur|dafuer|entlasse|entlassen|entlassung)$/i.test(n));
  // Eventualauftrag: zuerst «für X» im Satz lesen (X bis Komma, Verein oder «ein»), sonst alle Kadernamen im Satz suchen –
  // ohne Spieler, deren Namensteile im Gebotsspieler vorkommen («Fabio Viera» darf nicht «Fabio Silva» treffen)
  const swapOf = (sentence, bidNames) => {
    const fm = sentence.match(/\b(?:für|fuer)\s+(?:[TVMS]\s+)?([\p{L}' .-]+?)(?=\s*,|\s+(?:ein|einwechseln|einsetzen|einzuwechseln|rein|ersetzt|aus|raus)\b|\s*[.!;]|\s*$)/iu);
    if (fm) { const spec = playerSpec(fm[1]); const h = spec.name ? findPlayer(spec.name, kader).hits : []; if (h.length === 1) return h; }
    const bidWords = new Set(bidNames.flatMap(n => words(n).map(norm)));
    return kader.filter(p => words(p.name).some(w => w.length >= 3 && !bidWords.has(norm(w)) && new RegExp('(?<!\\p{L})' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\p{L})', 'iu').test(sentence)) && !bidNames.some(b => norm(b) === norm(p.name))); };
  for (let raw of clean) {
    if (stop || !raw) continue;
    if (!titleSeen && raw === title) { titleSeen = true; continue; }   // Titelzeile («Fw: Gebot Runde 2») ist kein Gebot
    if (dateLine(raw) || /^(gesendet|sent|von|from|an|to|cc|betreff|subject|date|datum)\s*:/i.test(raw) || /^-{3,}|^public$/i.test(raw)) continue;
    if (SIG.test(raw) && !/entlass|biete|für|fuer/i.test(raw)) { stop = true; continue; }
    // Maximalzahl: "max. 3 Spieler", "kaufe max. 2 Spieler", "insgesamt drei Spieler", "für 1 Torhüter"
    const mm = raw.match(/(?:max\.?|maximal|insgesamt|h[öo]chstens)\s*(\d+|einen|ein|eine|zwei|drei|vier|f[üu]nf)\s*(?:spieler|torh|verteidiger|mittelfeld|st[üu]rmer)/i) || raw.match(/f[üu]r\s+(\d+|einen|ein|zwei|drei)\s+(?:spieler|torh[üu]ter|verteidiger|mittelfeldspieler|st[üu]rmer)\b/i);
    if (mm && maxWins == null) maxWins = Number(mm[1]) || NUMWORD[norm(mm[1])] || null;
    // Saetze mit Preis = Gebot; der Rest der Zeile kann Entlassung und Eventualauftrag enthalten
    const parts = raw.replace(/\b(?:runde|spieltag|r)\s*\d+\b/gi, ' ').replace(/\b\d+\.\s*spieltag\b/gi, ' ').split(/(?<=\p{L}\p{L}[.!])\s+(?=\p{L})/u);
    let bidLine = null;
    for (const sentence of parts) {
      const inRelease = mode === 'release' && !/^(?:\d+[.)]\s*)?(?:ich\s+)?(?:biete|gebote?)\b/i.test(sentence) && !/^(falls|sollte|wenn)\b/i.test(sentence);
      const hasBid = !inRelease && /\d/.test(sentence) && !/^(falls|sollte|wenn)\b/i.test(sentence) && !/entlass\w*\s*:?\s*$/i.test(sentence);
      const pr = hasBid ? takePrice(sentence) : null;
      if (pr && !/^(entlasse|entlassen|dafür|dafuer)\b/i.test(sentence.trim())) {
        // "Mensah, Köln, V, 3 und entlasse Lerma" / "Biete für M Fabio Viera HSV Fr. 12.-- entlasse M Doan Frankfurt (…)"
        let desc = pr.rest; let relTxt = null;
        const em = desc.match(/\b(?:und\s+)?entlass\w*\s*:?\s*(.+)$/i); if (em) { relTxt = em[1]; desc = desc.slice(0, em.index); }
        desc = desc.replace(/^(?:\d+[.)]\s*)?(?:ich\s+)?biete\s+(?:in\s+runde\s+\d+\s+)?(?:für|fuer)?\s*/i, '').replace(/^(?:für|fuer)\s+/i, '').replace(/\b(?:in\s+)?(?:der\s+)?folgender?\s+reihenfolge\b.*$/i, '').trim();
        let relByFuer = null; const fm = desc.match(/^(.*?)\s+(?:für|fuer)\s+(.+)$/i);
        if (fm) { const left = playerSpec(fm[1]).name, right = playerSpec(fm[2]).name; if (left && right) { const rp = findPlayer(right, kader).hits; if (rp.length === 1) { relByFuer = rp[0]; desc = fm[1]; } } else if (!left) desc = fm[2]; }
        const spec = playerSpec(desc); if (!spec.name) { notes.push(`Gebotszeile ohne Spielername: «${raw}»`); continue; }
        const bid = { priority: bids.length + 1, player_name: spec.name, club: spec.club, pos: spec.pos, price: pr.price, release: relByFuer, swapOut: pendingSwap, raw: sentence.trim() };
        if (relTxt) { const n = releaseNames(relTxt)[0]; const p = n && resolve(n); if (p) bid.release = p; else if (n) notes.push(`Entlassung «${n}» nicht im Kader`); }
        bids.push(bid); seg = bid; bidLine = bid; relTarget = null; sinceRelease++; mode = 'bid'; continue;
      }
      // Eventualauftrag: "Ihn gleich für X einwechseln", "wechsle ich (ihn) für X ein", "direkt einwechseln für X", "der auch direkt T X ersetzt"
      const conditional = /^(falls|wenn|sollte|sofern)\b/i.test(sentence);
      if (conditional && /\bnicht\b/i.test(sentence)) {
        // «falls ich ihn nicht erhalte, dann Kramaric für Claude-Maurice einwechseln»: Rueckfall-Wechsel ohne Kauf (kostenpflichtig), nur von Hand
        const fm = sentence.match(/(?:dann|wird|soll|dafür|dafuer)?\s*(?:[TVMS]\s+)?([\p{L}' -]+?)\s+(?:für|fuer)\s+(?:[TVMS]\s+)?([\p{L}' -]+?)(?=\s*,|\s+(?:ein|einwechseln|einsetzen|einzuwechseln|rein|spielen)\b|\s*[.!;]|\s*$)/iu);
        const inP = fm && findPlayer(fm[1].replace(/^(?:dann|wird|soll|ich|er|ihn)\s+/i, '').replace(/.*\b(?:dann|soll|wird)\s+/i, ''), kader).hits, outP = fm && findPlayer(fm[2], kader).hits;
        if (inP && inP.length === 1 && outP && outP.length === 1 && inP[0].id !== outP[0].id) { fallback = { in: inP[0], out: outP[0] }; notes.push(`Bedingter Wechsel, nur wenn das Gebot nicht durchkommt: ${inP[0].name} für ${outP[0].name} – kein Eventualauftrag, kostenpflichtig (50 % von ${inP[0].name}), von Hand in der Aufstellung`); }
        else notes.push(`Bedingte Aufstellungsänderung, nicht übernommen: «${sentence.trim()}»`); continue; }
      if ((/einwechsel|einsetz|wechsle|wechseln|ersetz|\brein\b/i.test(sentence) || conditional) && /\b(?:für|fuer)\b|ersetzt/i.test(sentence)) {
        const cand = swapOf(sentence, bids.map(b => b.player_name));
        if (cand.length === 1) {
          const named = bids.filter(b => new RegExp('(?<!\\p{L})' + norm(b.player_name).slice(0, 5), 'i').test(norm(sentence)) || words(b.player_name).some(w => w.length >= 4 && new RegExp(w, 'i').test(sentence)));
          const targets = named.length ? named : (bidLine || seg) && !/^(den|der|die)\s+spieler/i.test(sentence) ? [bidLine || seg] : bids;
          for (const b of targets) if (!b.swapOut) b.swapOut = cand[0];
          if (!targets.length) pendingSwap = cand[0];
        } else if (cand.length > 1) notes.push(`Eventualauftrag unklar («${sentence.trim()}»): ${cand.map(p => p.name).join(' oder ')}`);
        else notes.push(`Eventualauftrag: Spieler nicht im Kader erkannt («${sentence.trim()}»)`);
        continue;
      }
      // Entlassungs-Abschnitt
      const rh = sentence.match(/^(?:dafür\s+|dafuer\s+|und\s+|ich\s+)?entlass\w*(?:\s+ich)?(?:\s+in\s+(?:der\s+)?folgender?\s+reihenfolge)?\s*:?\s*(.*)$/i);
      // «Dafür entlasse ich:» gehoert zum Gebot direkt davor; stehen mehrere Gebote davor (Alternativen) oder heisst es «in folgender Reihenfolge», ist es eine Liste
      if (rh) { mode = 'release'; relTarget = /^(dafür|dafuer)\b/i.test(sentence) && !/reihenfolge/i.test(sentence) && sinceRelease === 1 && seg && !seg.release ? seg : null; sinceRelease = 0;
        const inline = rh[1].trim(); if (inline) for (const n of releaseNames(inline)) { const p = resolve(n); if (!p) continue; if (relTarget && !relTarget.release) { relTarget.release = p; relTarget = null; } else releases.push(p); } continue; }
      if (mode === 'release') { for (const n of releaseNames(sentence)) { const p = resolve(n, true); if (!p) continue; if (relTarget && !relTarget.release) { relTarget.release = p; relTarget = null; } else releases.push(p); } continue; }
    }
    if (!bidLine && /^(gebot|biete|ich biete|meine gebote|gebote)/i.test(raw)) mode = 'bid';
  }
  // Entlassungen ohne Gebotsbezug: je Gebot in Reihenfolge, wenn jedes Gebot fuer sich steht; sonst als Reihenfolge-Liste
  const uniq = arr => arr.filter((p, i) => arr.findIndex(x => x.id === p.id) === i);
  const rel = uniq(releases);
  const perBid = bids.filter(b => b.release).length;
  if (maxWins == null) maxWins = perBid === bids.length && bids.length ? bids.length : rel.length ? Math.min(rel.length, bids.length || 1) : 1;
  if (perBid && perBid < bids.length && rel.length) { let k = 0; for (const b of bids) if (!b.release && rel[k]) b.release = rel[k++]; }
  if (bids.length === 1 && !bids[0].release && rel.length === 1) bids[0].release = rel[0];
  return { bids, releases: rel, maxWins, notes, unmatched: [...new Set(unmatched)], fallback };
}

/**
 * Text in Manager-Posts teilen und Gebote lesen. managers: [{id,name}], kaderOf: managerId -> Kader (aktive Spieler).
 * Liefert {blocks: [{managerId, name, title, bids, releases, maxWins, notes, unmatched, problems}], unclear, skipped}
 */
const fmtAt = d => d ? new Date(d).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
/** «Gesendet: Freitag, 23. Oktober 2026 um 18:08» (weitergeleitete Mail) als Zeitpunkt, Zürcher Zeit. */
export function sentAt(lines) {
  for (const l of lines.slice(0, 12)) { const m = String(l || '').match(/^(?:gesendet|sent|date|datum)\s*:\s*(.+)$/i); if (!m) continue;
    const d = dateLine(m[1].replace(/\s+um\s+\d{1,2}:\d{2}.*$/i, '').replace(/,\s*\d{1,2}:\d{2}.*$/, '')); const t = m[1].match(/(\d{1,2}):(\d{2})/); if (d && t) return zurich(d, t[1], t[2]); }
  return null;
}
export function parseBidText(text, managers, kaderOf, opts = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' ').trim());
  const raw = splitBlocks(lines, managers, kaderOf);
  const out = [], unclear = [], skipped = [];
  for (const b of raw) {
    const head = b.lines.filter(Boolean).slice(0, 8).join('\n').replace(/\S+@\S+/g, '');
    const bidPost = isBidLike(b.title) || isBidLike(head) || /\bentlasse\b/i.test(b.lines.join('\n'));
    if (!bidPost) continue;
    if (!b.manager) { unclear.push(`«${b.title}»: ${b.unclear ? 'mehrere Managernamen (' + b.unclear.join(', ') + ')' : 'kein Managername erkennbar'}`); continue; }
    const m = b.title.match(/(?:runde|spieltag|\br)\s*(\d+)|(\d+)\.\s*spieltag/i); const rn = m && Number(m[1] || m[2]);
    if (rn && opts.roundNumbers?.length && !opts.roundNumbers.includes(rn)) { skipped.push(`${b.manager.name}: «${b.title}» – Gebot für Runde ${rn}`); continue; }
    const sent = sentAt(b.lines); const at = sent || b.at || null;
    if (at && opts.notBefore && at <= new Date(opts.notBefore)) { skipped.push(`${b.manager.name}: «${b.title}» – vor der Deadline der Vorrunde (${fmtAt(at)})`); continue; }
    const r = readBidPost(b.lines, kaderOf(b.manager.id) || [], b.title);
    if (!r.bids.length) { if (/\d/.test(b.lines.join(' '))) unclear.push(`${b.manager.name}: «${b.title}» – kein Gebot mit Preis erkannt`); continue; }
    const problems = [];
    r.bids.forEach(x => { if (!x.release && !r.releases.length) problems.push(`Gebot ${x.priority} (${x.player_name}): keine Entlassung genannt`); });
    if (r.releases.length && r.releases.length < Math.min(r.maxWins, r.bids.length) && !r.bids.every(x => x.release)) problems.push(`Nur ${r.releases.length} Entlassung(en) für bis zu ${Math.min(r.maxWins, r.bids.length)} Käufe`);
    const prev = out.find(o => o.managerId === b.manager.id);
    if (at && opts.deadline && at > new Date(opts.deadline)) r.notes.push(`Nach der Deadline ${sent ? 'gesendet' : 'gepostet'} (${fmtAt(at)}, Deadline ${fmtAt(new Date(opts.deadline))}) – Gebot ungültig (Ziff. 7.1), falls die Mail nicht früher im Postfach war`);
    const block = { managerId: b.manager.id, name: b.manager.name, title: b.title, at, sentAt: sent, postedAt: b.at || null, ...r, problems, ok: problems.length === 0, spaet: !!(at && opts.deadline && at > new Date(opts.deadline)) };
    if (prev) { out[out.indexOf(prev)] = block; block.notes.unshift(`Ersetzt den früheren Post «${prev.title}»`); } else out.push(block);
  }
  return { blocks: out, unclear, skipped };
}
