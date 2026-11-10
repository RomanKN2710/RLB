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
  // Klammern: Position und/oder Verein («(M, BVB)»). Freitext («(kann auch als M eingesetzt werden)») ist ein Hinweis des Managers,
  // keine Positionsangabe: Zusatzpositionen gibt es nur ueber die kicker-Startelf (Ziff. 5.2)
  let also = null;
  s = s.replace(/\(([^)]*)\)/g, (_, inner) => { const toks = inner.split(/[,\/\s]+/).filter(Boolean);
    const spec = toks.every(t => /^[TVMS]$/i.test(t) || CLUB[norm(t)] || CLUBWORDS.has(norm(t)) || /^(fc|sc|sv|fsv|vfl|tsg|borussia|\d+)$/i.test(t));
    if (!spec) { const m = inner.match(/\b(?:als|auf)\s+([TVMS])\b/i) || inner.match(/\b([TVMS])\b/); if (m) also = m[1].toUpperCase(); return ' '; }
    for (const t of toks) { if (!pos && /^[TVMS]$/i.test(t)) pos = t.toUpperCase(); else if (CLUB[norm(t)]) club = CLUB[norm(t)]; } return ' '; });
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
  return also && also !== pos ? { name, club, pos, also } : { name, club, pos };
}

/** Gebots-Post eines Managers lesen. kader: aktive Spieler des Managers (fuer Entlassung und Eventualauftrag). */
function readBidPost(lines, kader, title = '') {
  const bids = [], releases = [], notes = [], unmatched = []; let maxWins = null, mode = 'bid', stop = false, fallback = null; let seg = null, relTarget = null, pendingSwap = null, sinceRelease = 0, lastRel = null;   // seg: Gebot, zu dem Folgezeilen gehoeren
  const clean = lines.map(l => l.replace(/ /g, ' ').replace(/\s+/g, ' ').trim()); let titleSeen = false;
  const resolve = (name, quiet) => { const { hits } = findPlayer(name, kader); if (hits.length === 1) return hits[0]; if (hits.length > 1) notes.push(`«${name}» ist mehrdeutig: ${hits.map(h => h.name).join(' oder ')}`); else if (!quiet) unmatched.push(name); return null; };
  const releaseNames = txt => String(txt).replace(/\([^)]*\)/g, ' ').split(/\s*[,;]\s*|\s+(?:und|&|oder)\s+/).map(x => playerSpec(x).name).filter(n => n && norm(n).length >= 3 && !/^(in|der|die|folgender|folgende|reihenfolge|ich|dafur|dafuer|entlasse|entlassen|entlassung)$/i.test(n));
  // Eventualauftrag: zuerst «für X» im Satz lesen (X bis Komma, Verein oder «ein»), sonst alle Kadernamen im Satz suchen –
  // ohne Spieler, deren Namensteile im Gebotsspieler vorkommen («Fabio Viera» darf nicht «Fabio Silva» treffen)
  const swapOf = (sentence, bidNames) => {
    const fm = sentence.match(/\b(?:für|fuer)\s+(?:[TVMS]\s+)?([\p{L}' .-]+?)(?=\s*,|\s+(?:ein|einwechseln|einsetzen|einzuwechseln|rein|ersetzt|aus|raus|in)\b|\s*[.!;]|\s*$)/iu);
    // «Ich entlasse Nicolas und wechsle den neuen Torhüter für ihn ein»: «ihn» ist der eben Entlassene
    if (fm && /^(?:ihn|ihm|diesen|den)$/i.test(fm[1].trim())) return lastRel ? [lastRel] : [];
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
    const parts = raw.replace(/\b(?:runde|spieltag|r)\s*\d+\b/gi, ' ').replace(/\b\d+\.\s*spieltag\b/gi, ' ').split(/(?<=\p{L}\p{L}[.!])\s+(?=\p{L})/u)
      // «Ich entlasse X und wechsle den neuen Spieler für Y ein»: Entlassung und Eventualauftrag sind zwei Aussagen
      .flatMap(x => /entlass/i.test(x) ? x.split(/\s+und\s+(?=(?:ich\s+)?(?:wechsle|wechseln|setze|stelle|ihn|den\s+neuen|der\s+neue|diesen)\b)/i) : [x]);
    let bidLine = null;
    // «Werde 3 Spieler direkt einsetzen in Runde 9:» leitet Eventualaufträge ein (keine Gebote, keine Entlassungen)
    if (/\b(?:einsetzen|einwechseln|einwechsle|einsetze)\b[^.]*:\s*$/i.test(raw) && !/\bbiete\b/i.test(raw)) { mode = 'swap'; continue; }
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
        if (spec.also) notes.push(`${spec.name}: laut Gebot auch als ${spec.also} einsetzbar – zählt erst, wenn kicker ihn so in der Startelf führt (Ziff. 5.2)`);
        if (relTxt) { const n = releaseNames(relTxt)[0]; const p = n && resolve(n); if (p) { bid.release = p; lastRel = p; } else if (n) notes.push(`Entlassung «${n}» nicht im Kader`); }
        if (bid.release) lastRel = bid.release; bids.push(bid); seg = bid; bidLine = bid; relTarget = null; sinceRelease++; mode = 'bid'; continue;
      }
      // Eventualauftrag: "Ihn gleich für X einwechseln", "wechsle ich (ihn) für X ein", "direkt einwechseln für X", "der auch direkt T X ersetzt"
      const conditional = /^(falls|wenn|sollte|sofern)\b/i.test(sentence);
      if (conditional && /\bnicht\b/i.test(sentence)) {
        // «falls ich ihn nicht erhalte, dann Kramaric für Claude-Maurice einwechseln»: Rueckfall-Wechsel ohne Kauf (kostenpflichtig), nur von Hand
        const fm = sentence.match(/(?:dann|wird|soll|dafür|dafuer)?\s*(?:[TVMS]\s+)?([\p{L}' -]+?)\s+(?:für|fuer)\s+(?:[TVMS]\s+)?([\p{L}' -]+?)(?=\s*,|\s+(?:ein|einwechseln|einsetzen|einzuwechseln|rein|spielen)\b|\s*[.!;]|\s*$)/iu);
        const inP = fm && findPlayer(fm[1].replace(/^(?:dann|wird|soll|ich|er|ihn)\s+/i, '').replace(/.*\b(?:dann|soll|wird)\s+/i, ''), kader).hits, outP = fm && findPlayer(fm[2], kader).hits;
        if (inP && inP.length === 1 && outP && outP.length === 1 && inP[0].id !== outP[0].id) { fallback = { in: inP[0], out: outP[0] }; notes.push(`Bedingter Wechsel, nur wenn das Gebot nicht durchkommt: ${inP[0].name} für ${outP[0].name} – kein Eventualauftrag, kostenpflichtig (50 % von ${inP[0].name}), von Hand in der Aufstellung`); }
        else notes.push(`Bedingte Aufstellungsänderung, nicht übernommen: «${sentence.trim()}»`); continue; }
      // «V Machida Frankfurt anstelle V Posch Mainz», «M Onyedika (oder dann Chaibi) Frankfurt für V Caci»: links Gebot(e), rechts Spieler der Aufstellung
      const am = !/^(?:\S+\s+)?entlass/i.test(sentence) && sentence.match(/^(.*?)\s+(?:anstelle(?:\s+von)?|an\s+stelle\s+von|statt|für|fuer)\s+(.+?)\s*[.!]?$/i);
      if (am && bids.length) {
        const named = bids.filter(b => words(b.player_name).some(w => w.length >= 3 && new RegExp('(?<!\\p{L})' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?!\\p{L})', 'iu').test(am[1])));
        const outName = playerSpec(am[2].replace(/\([^)]*\)/g, ' ').replace(/\s+(?:ein|einsetzen|einwechseln|rein)$/i, '')).name; const outs = outName ? findPlayer(outName, kader).hits : [];
        if (named.length && outs.length === 1) { for (const b of named) if (!b.swapOut) b.swapOut = outs[0]; continue; }
      }
      if (mode === 'swap') continue;   // Formationshinweise («Neu ein 3-5-2») u. ä.
      if ((/einwechsel|einsetz|wechsle|wechseln|ersetz|\brein\b/i.test(sentence) || conditional) && /\b(?:für|fuer)\b|ersetzt|anstelle|statt/i.test(sentence)) {
        const cand = swapOf(sentence, bids.map(b => b.player_name));
        if (cand.length === 1) {
          const named = bids.filter(b => new RegExp('(?<!\\p{L})' + norm(b.player_name).slice(0, 5), 'i').test(norm(sentence)) || words(b.player_name).some(w => w.length >= 4 && new RegExp(w, 'i').test(sentence)));
          const generic = /\b(?:den|der|die)\s+(?:neuen?\s+)?(?:spieler|torh[üu]ter|torwart|keeper|verteidiger|mittelfeldspieler|st[üu]rmer)\b|\bneuen\s+(?:spieler|torh[üu]ter|torwart)\b|\bneueinkauf\b/i.test(sentence);
          const targets = named.length ? named : bidLine ? [bidLine] : generic ? bids.filter(b => !b.swapOut) : seg ? [seg] : bids;
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
        const inline = rh[1].trim(); if (inline) for (const n of releaseNames(inline)) { const p = resolve(n); if (!p) continue; lastRel = p; if (relTarget && !relTarget.release) { relTarget.release = p; relTarget = null; } else releases.push(p); } continue; }
      if (mode === 'release') { for (const n of releaseNames(sentence)) { const p = resolve(n, true); if (!p) continue; lastRel = p; if (relTarget && !relTarget.release) { relTarget.release = p; relTarget = null; } else releases.push(p); } continue; }
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
/** Post in Gebotsgruppen teilen: Überschriften «Gebot Nr. 2:», «Gebot 2», «2. Gebot». Liefert [{nr, lines}]; ohne Überschrift eine Gruppe. */
const GROUP_HEAD = /^\s*(?:(?:\d+\.\s*)?(?:gebot|angebot)\s*(?:nr\.?|nummer|no\.?|#)?\s*(\d+)|(\d+)\.\s*gebot)\s*[:.)\-–]?\s*$/i;
export function splitGroups(lines) {
  const segs = [{ nr: null, lines: [] }];
  for (const l of lines) { const m = String(l || '').match(GROUP_HEAD); if (m) segs.push({ nr: Number(m[1] || m[2]), lines: [] }); else segs[segs.length - 1].lines.push(l); }
  return segs.filter((sg, i) => i > 0 || segs.length === 1 || sg.lines.some(Boolean));
}
/** Gruppen zu einer Gebotsliste zusammenfügen: Reihenfolge über alle Gruppen, jede Zeile kennt ihre Gruppe. */
function joinGroups(groups) {
  const bids = [], notes = [], unmatched = [], releases = []; let fallback = null;
  groups.forEach((g, i) => { for (const x of g.bids) bids.push({ ...x, priority: bids.length + 1, gruppe: i + 1 });
    notes.push(...g.notes); unmatched.push(...g.unmatched); for (const p of g.releases) if (!releases.some(q => q.id === p.id)) releases.push(p); fallback = fallback || g.fallback; });
  const out = groups.map((g, i) => ({ gruppe: i + 1, nr: g.nr, maxWins: g.maxWins, releases: g.releases }));
  return { bids, releases, notes, unmatched: [...new Set(unmatched)], fallback, groups: out, maxWins: groups.length === 1 ? groups[0].maxWins : Math.max(...groups.map(g => g.maxWins)) };
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
    // Mehrere nummerierte Gebote in einem Post («Gebot Nr. 1», «Gebot Nr. 2»): je Gruppe eigenes Maximum, eigene Entlassungen
    // und eigener Eventualauftrag. Ohne Nummern ist der ganze Post eine Gruppe.
    const kader = kaderOf(b.manager.id) || []; const groups = []; let shared = null;
    for (const sg of splitGroups(b.lines)) {
      const r = readBidPost(sg.lines, kader, b.title);
      if (!r.bids.length) { if (r.releases.length && !shared) shared = r; continue; }   // Vorspann ohne Gebote, z. B. gemeinsame Entlassungsliste
      groups.push({ nr: sg.nr, ...r });
    }
    if (!groups.length) { if (/\d/.test(b.lines.join(' '))) unclear.push(`${b.manager.name}: «${b.title}» – kein Gebot mit Preis erkannt`); continue; }
    if (shared) for (const g of groups) if (!g.releases.length && !g.bids.some(x => x.release)) { g.releases = shared.releases; if (g.bids.length === 1) g.bids[0].release = shared.releases[0]; }
    const prev = out.find(o => o.managerId === b.manager.id);
    // Ein späterer Post mit Gebotsnummern ergänzt oder ersetzt nur die gleich nummerierten Gruppen des früheren
    let merged = groups, mergeNote = null;
    if (prev && groups.every(g => g.nr != null) && prev.rawGroups.every(g => g.nr != null)) {
      merged = [...prev.rawGroups.filter(g => !groups.some(n => n.nr === g.nr)), ...groups].sort((a, z) => a.nr - z.nr);
      mergeNote = `Ergänzt den früheren Post «${prev.title}» (Gebot Nr. ${groups.map(g => g.nr).join(', ')})`;
    }
    const r = joinGroups(merged);
    const problems = [];
    for (const g of r.groups) { const tag = r.groups.length > 1 ? `Gebot Nr. ${g.nr ?? g.gruppe}: ` : '';
      const mine = r.bids.filter(x => x.gruppe === g.gruppe);
      mine.forEach(x => { if (!x.release && !g.releases.length) problems.push(`${tag}Gebot ${x.priority} (${x.player_name}): keine Entlassung genannt`); });
      if (g.releases.length && g.releases.length < Math.min(g.maxWins, mine.length) && !mine.every(x => x.release)) problems.push(`${tag}Nur ${g.releases.length} Entlassung(en) für bis zu ${Math.min(g.maxWins, mine.length)} Käufe`); }
    const doppelt = r.groups.flatMap(g => g.releases.map(p => p.id)).filter((id, i, a) => a.indexOf(id) !== i);
    if (doppelt.length) problems.push(`Derselbe Spieler ist in mehreren Geboten zur Entlassung genannt: ${[...new Set(doppelt)].map(id => kader.find(p => p.id === id)?.name || id).join(', ')}`);
    if (at && opts.deadline && at > new Date(opts.deadline)) r.notes.push(`Nach der Deadline ${sent ? 'gesendet' : 'gepostet'} (${fmtAt(at)}, Deadline ${fmtAt(new Date(opts.deadline))}) – Gebot ungültig (Ziff. 7.1), falls die Mail nicht früher im Postfach war`);
    const block = { managerId: b.manager.id, name: b.manager.name, title: b.title, at, sentAt: sent, postedAt: b.at || null, ...r, rawGroups: merged, problems, ok: problems.length === 0, spaet: !!(at && opts.deadline && at > new Date(opts.deadline)) };
    if (prev) { out[out.indexOf(prev)] = block; block.notes.unshift(mergeNote || `Ersetzt den früheren Post «${prev.title}»`); } else out.push(block);
  }
  return { blocks: out, unclear, skipped };
}
