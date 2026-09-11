/* Aufstellungen aus eingefuegtem Text: der Blog (Copy-Paste), ein Chat oder eine Mail. Pro Manager ein
   Post/Block, darin die Spieler in beliebiger Schreibweise: "1 T Zentner Mainz", "V\tSvensson\tDortmund",
   "Latte Lath (M)", Position auf eigener Zeile, Tippfehler ("Ulrich", "Gregrotisch"). Reine Funktionen
   ohne Datenbank; die Zuordnung laeuft gegen den Kader des jeweiligen Managers. */
import { norm, positionsOf, posProblems } from './rules';

const POSMAP = { t: 'T', tw: 'T', tor: 'T', torwart: 'T', goalie: 'T', v: 'V', iv: 'V', av: 'V', lv: 'V', rv: 'V', abw: 'V', abwehr: 'V', verteidiger: 'V', verteidigung: 'V', m: 'M', mf: 'M', zm: 'M', dm: 'M', om: 'M', lm: 'M', rm: 'M', mittelfeld: 'M', s: 'S', st: 'S', sturm: 'S', stuermer: 'S', sturmer: 'S', a: 'S', angriff: 'S', la: 'S', ra: 'S' };
// Vereinsworte, die hinter dem Spielernamen stehen koennen ("Kim Bayern München", "Moore Köln")
const CLUBWORDS = new Set(['bayern', 'muenchen', 'munchen', 'union', 'berlin', 'hsv', 'hamburg', 'hamburger', 'frankfurt', 'eintracht', 'dortmund', 'borussia', 'bvb', 'leipzig', 'rb', 'bremen', 'werder', 'stuttgart', 'vfb', 'freiburg', 'augsburg', 'koeln', 'koln', 'hoffenheim', 'tsg', 'leverkusen', 'bayer', 'mainz', 'elversberg', 'paderborn', 'schalke', 'gladbach', 'moenchengladbach', 'monchengladbach', 'fc', 'sc', 'sv', 'fsv', 'vfl', 'fca']);
const words = s => String(s || '').split(/[^\p{L}\p{N}.'-]+/u).filter(Boolean);
/** Positionsangabe "V/M" -> ['V','M'] */
const posList = s => String(s || '').split(/[\/|,]/).map(x => POSMAP[norm(x)]).filter(Boolean);

/** Einen Schnipsel ("V: Anton", "3 V/M Caci Mainz", "Anton (M)", "El Aynaoui (M, Leipzig)") in {pos:[...], name} zerlegen. */
function chunkOf(raw, clubWords) {
  let s = raw.replace(/^[\s\-–•*·>#]+/, '').replace(/^\d+[.)]?\s+/, '').trim(); let pos = [];
  const suf = s.match(/\(\s*([A-Za-zÄÖÜäöü\/]{1,12})\b[^)]*\)\s*$/); if (suf && posList(suf[1]).length) { pos = posList(suf[1]); s = s.slice(0, suf.index).trim(); }
  else s = s.replace(/\([^)]*\)/g, ' ').trim();
  const pre = s.match(/^([A-Za-zÄÖÜäöü\/]{1,12})\s*[:.)\-–\t ]\s*(.+)$/); if (pre && !pos.length && posList(pre[1]).length && pre[1].length <= 3 + (pre[1].includes('/') ? 2 : 0)) { pos = posList(pre[1]); s = pre[2].trim(); }
  const name = words(s).filter(w => !clubWords.has(norm(w)) && !/^\d+$/.test(w)).join(' ').replace(/[:;,.]+$/, '').trim();
  return { pos, name };
}

// Editierdistanz mit Buchstabendrehern als ein Schritt ("Gregrotisch" -> "Gregoritsch" = 2)
const lev = (a, b) => { const m = a.length, n = b.length; if (!m || !n) return Math.max(m, n); const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) { const c = a[i - 1] === b[j - 1] ? 0 : 1; d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
    if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1); } return d[m][n]; };

/** Spieler des Kaders finden, auf den ein Name passt: exakt, alle Namensteile, ein Namensteil, zuletzt Tippfehler-tolerant. */
export function findPlayer(name, kader) {
  const n = norm(name); if (!n || n.length < 3) return { hits: [], how: '' };
  const parts = p => words(p.name).map(norm).filter(t => t.length >= 3);
  const exact = kader.filter(p => norm(p.name) === n); if (exact.length) return { hits: exact, how: 'exakt' };
  const all = kader.filter(p => { const ts = parts(p); return ts.length && ts.every(t => n.includes(t)); }); if (all.length) return { hits: all, how: 'Name' };
  const chunkParts = words(name).map(norm).filter(t => t.length >= 3);
  const some = kader.filter(p => parts(p).some(t => chunkParts.includes(t)) || (n.length >= 5 && norm(p.name).includes(n))); if (some.length) return { hits: some, how: 'Namensteil' };
  // Voller kicker-Name als Alias ("Miguel" heisst bei kicker Miguel Gutierrez): ein Aliasteil (>= 4 Zeichen) trifft
  const alias = kader.filter(p => (p.alias || []).some(t => t.length >= 4 && chunkParts.includes(t))); if (alias.length) return { hits: alias, how: 'kicker-Name' };
  // Tippfehler: ein Namensteil des Schnipsels nahe an einem Namensteil des Spielers (Ulrich/Ullrich, Gregrotisch/Gregoritsch)
  if (chunkParts.length <= 3) { const fuzzy = kader.filter(p => parts(p).some(t => chunkParts.some(c => c.length >= 5 && lev(c, t) <= (Math.min(c.length, t.length) >= 8 ? 2 : 1)))); if (fuzzy.length) return { hits: fuzzy, how: 'ähnlich' }; }
  return { hits: [], how: '' };
}

const NOISE = /^(hi|hallo|hoi|salut|public|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b|aufstellung|auswechslung|einwechslung|runde|spieltag|wechsel|system/i;
const SIG = /^(freundliche gr|viele gr|liebe gr|vielen dank|besten dank|danke|gruss|grüss|gruess|merci|lg\b|mfg|vg\b|this e-?mail|---|uploaded image|eingestellt von)/i;
const ENDE = /^Eingestellt von\b/i;

/** Text in Posts/Bloecke teilen: Blog-Posts enden mit "Eingestellt von … um …"; sonst gilt jede kurze Zeile mit Managernamen als Blockanfang. */
function splitBlocks(lines, managers, kaderOf) {
  const mgrByNorm = {}; managers.forEach(m => { mgrByNorm[norm(m.name)] = m; });
  const mgrIn = line => { const found = new Set(); words(line).forEach(w => { const m = mgrByNorm[norm(w)]; if (m) found.add(m); }); return [...found]; };
  const blocks = [];
  if (lines.some(l => ENDE.test(l))) {
    let cur = [];
    for (const line of lines) { if (ENDE.test(line)) { if (cur.length) blocks.push(cur); cur = []; } else cur.push(line); }
    if (cur.length) blocks.push(cur);
    return blocks.map(ls => {
      const nonEmpty = ls.filter(Boolean);
      // Manager: zuerst im Titel (erste Zeilen, ohne Datumszeile), sonst der einzige Managername im ganzen Post (Signatur)
      let mgr = null, title = '';
      for (const l of nonEmpty.slice(0, 3)) { if (/^\w+,\s+\w+\s+\d{1,2},\s+\d{4}$/.test(l) || /^public$/i.test(l)) continue; const ms = mgrIn(l); if (ms.length === 1) { mgr = ms[0]; title = l; break; } }
      if (!mgr) { const all = new Set(); nonEmpty.forEach(l => mgrIn(l).forEach(m => all.add(m))); if (all.size === 1) mgr = [...all][0]; else if (all.size > 1) return { manager: null, title: nonEmpty[0] || '', lines: ls, unclear: [...all].map(m => m.name) }; }
      return { manager: mgr, title: title || nonEmpty[0] || '', lines: ls };
    });
  }
  let cur = null;
  for (const line of lines) {
    if (!line) continue;
    const ms = mgrIn(line);
    if (ms.length === 1 && line.length <= 80) {
      const kader = kaderOf(ms[0].id) || [];
      const restHasPlayer = words(line).some(w => w.length >= 3 && norm(w) !== norm(ms[0].name) && findPlayer(w, kader).hits.length === 1);
      if (!restHasPlayer) { cur = { manager: ms[0], title: line, lines: [] }; blocks.push(cur); continue; }
    }
    if (cur) cur.lines.push(line);
  }
  return blocks;
}

/**
 * Text in Manager-Bloecke teilen und Spieler zuordnen.
 * managers: [{id, name}], kaderOf: managerId -> [{id, name, base_pos, extra_pos, alias}], opts: {clubs, roundNumbers, roundLabel}
 * Liefert {blocks: [{managerId, name, title, entries, found, unmatched, ambiguous, problems, notes, ok}], missing, unclear}
 */
export function parseLineupText(text, managers, kaderOf, opts = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' ').trim());
  const clubWords = new Set([...CLUBWORDS, ...(opts.clubs || []).flatMap(c => words(c).map(norm))]);
  const raw = splitBlocks(lines, managers, kaderOf);
  const out = []; const unclear = [];
  for (const b of raw) {
    if (!b.manager) { if (b.unclear) unclear.push(`«${b.title}»: mehrere Managernamen (${b.unclear.join(', ')})`); continue; }
    const kader = kaderOf(b.manager.id) || []; const entries = {}; const found = [], unmatched = [], ambiguous = [], notes = [];
    const m = b.title.match(/(?:runde|spieltag|r)\s*(\d+)|(\d+)\.\s*spieltag/i); const rn = m && Number(m[1] || m[2]);
    if (rn && opts.roundNumbers?.length && !opts.roundNumbers.includes(rn)) notes.push(`Titel nennt Runde ${rn}, importiert wird ${opts.roundLabel || 'Runde ' + opts.roundNumbers[0]}`);
    let pending = []; let stop = false;
    for (let line of b.lines) {
      if (!line || stop) continue;
      if (SIG.test(line)) { stop = true; continue; }                 // Grussformel, Signatur, Mail-Disclaimer: ab hier nichts mehr
      if (/^(system|aufstellung|startaufstellung|wechsel|einwechslung|auswechslung|pos\b)/i.test(line) && !/[,\t]/.test(line.replace(/^\S+\s*:?/, '')) && words(line).length <= 4) continue;
      line = line.split(/\s+(?:für|fuer|anstelle|anstatt|statt|ersetzt)\s+|\s+f\s+/i)[0];   // "X für Y": Y ist der ersetzte Spieler
      if (posList(line).length && words(line).length === 1) { pending = posList(line); continue; }   // Position auf eigener Zeile (naechste Zeile ist der Spieler)
      const chunks = line.split(/\s*[,;|]\s*(?![^(]*\))|\s+[\/–]\s+|\s+-\s+|\s+(?:u|und|&)\s+/).filter(Boolean);
      for (const rawChunk of chunks) {
        const { pos, name } = chunkOf(rawChunk, clubWords); if (!name || norm(name).length < 3) continue;
        const want = pos.length ? pos : pending; pending = [];
        const { hits, how } = findPlayer(name, kader);
        const neu = hits.filter(h => !entries[h.id]);
        if (hits.length && !neu.length) {                                      // schon aufgestellt (Wechselzeile wiederholt den Namen): allenfalls Position nachtragen
          const p = hits[0]; const np = want.find(x => positionsOf(p).includes(x)); const f = found.find(x => x.name === p.name);
          if (np && entries[p.id].pos !== np) { entries[p.id].pos = np; if (f) f.pos = np; }
          else if (want.length && !np && f && !f.note) f.note = `${want.join('/')} nicht erlaubt (${positionsOf(p).join('/')}), als ${entries[p.id].pos}`;
          continue; }
        if (neu.length === 1) { const p = neu[0]; const allowed = positionsOf(p); const usePos = want.find(x => allowed.includes(x)) || p.base_pos;
          entries[p.id] = { pos: usePos }; found.push({ raw: rawChunk, name: p.name, pos: usePos, how, note: want.length && !want.some(x => allowed.includes(x)) ? `${want.join('/')} nicht erlaubt (${allowed.join('/')}), als ${p.base_pos}` : how === 'ähnlich' ? `als «${rawChunk.trim()}» geschrieben` : '' }); }
        else if (neu.length > 1) ambiguous.push({ raw: rawChunk, options: neu.map(h => h.name) });
        else if (words(name).length <= 3 && !/\d|@/.test(name) && !NOISE.test(name) && !words(name).some(w => managers.some(m => norm(m.name) === norm(w)))) unmatched.push(name);
      }
    }
    const byId = Object.fromEntries(kader.map(p => [p.id, p]));
    const problems = posProblems(entries, byId);
    if (ambiguous.length) problems.unshift(...ambiguous.map(a => `«${a.raw.trim()}» ist mehrdeutig: ${a.options.join(' oder ')}`));
    out.push({ managerId: b.manager.id, name: b.manager.name, title: b.title, entries, found, unmatched, ambiguous, problems, notes, ok: problems.length === 0 });
  }
  // Ein Manager mehrfach im Text: der letzte Block mit Spielern gilt (ein leerer verdraengt keinen gefuellten)
  const last = {}; out.forEach(o => { if (o.found.length || !last[o.managerId]) last[o.managerId] = o; });
  return { blocks: Object.values(last), missing: managers.filter(m => !last[m.id]).map(m => m.name), unclear };
}
