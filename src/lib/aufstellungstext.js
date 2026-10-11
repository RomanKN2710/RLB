/* Aufstellungen aus eingefuegtem Text: der Blog (Copy-Paste), ein Chat oder eine Mail. Pro Manager ein
   Post/Block, darin die Spieler in beliebiger Schreibweise: "1 T Zentner Mainz", "V\tSvensson\tDortmund",
   "Latte Lath (M)", Position auf eigener Zeile, Tippfehler ("Ulrich", "Gregrotisch"). Reine Funktionen
   ohne Datenbank; die Zuordnung laeuft gegen den Kader des jeweiligen Managers. */
import { norm, positionsOf, posProblems, fitPositions } from './rules';

const POSMAP = { t: 'T', tw: 'T', tor: 'T', torwart: 'T', goalie: 'T', v: 'V', iv: 'V', av: 'V', lv: 'V', rv: 'V', abw: 'V', abwehr: 'V', verteidiger: 'V', verteidigung: 'V', m: 'M', mf: 'M', zm: 'M', dm: 'M', om: 'M', lm: 'M', rm: 'M', mittelfeld: 'M', s: 'S', st: 'S', sturm: 'S', stuermer: 'S', sturmer: 'S', a: 'S', angriff: 'S', la: 'S', ra: 'S' };
// Vereinsworte, die hinter dem Spielernamen stehen koennen ("Kim Bayern München", "Moore Köln")
const CLUBWORDS = new Set(['bayern', 'muenchen', 'munchen', 'union', 'berlin', 'hsv', 'hamburg', 'hamburger', 'frankfurt', 'eintracht', 'dortmund', 'borussia', 'bvb', 'leipzig', 'rb', 'bremen', 'werder', 'stuttgart', 'vfb', 'freiburg', 'augsburg', 'koeln', 'koln', 'hoffenheim', 'tsg', 'leverkusen', 'bayer', 'mainz', 'elversberg', 'paderborn', 'schalke', 'gladbach', 'moenchengladbach', 'monchengladbach', 'fc', 'sc', 'sv', 'fsv', 'vfl', 'fca']);
// Fuellwoerter in Wechselzeilen ("X kommt rein für Y", "Y wird ausgewechselt")
const FILLER = new Set(['kommt', 'kommen', 'rein', 'raus', 'wird', 'werden', 'ersetzt', 'eingewechselt', 'ausgewechselt', 'spielt', 'wechsle', 'wechsel', 'tausche', 'tausch', 'neu']);
const words = s => String(s || '').split(/[^\p{L}\p{N}.'-]+/u).filter(Boolean);
/** Positionsangabe "V/M" -> ['V','M'] */
const posList = s => String(s || '').split(/[\/|,]/).map(x => POSMAP[norm(x)]).filter(Boolean);

/** Einen Schnipsel ("V: Anton", "3 V/M Caci Mainz", "Anton (M)", "El Aynaoui (M, Leipzig)") in {pos:[...], name} zerlegen. */
function chunkOf(raw, clubWords) {
  let s = raw.replace(/^[\s\-–•*·>#]+/, '').replace(/^\d+[.)]?\s+/, '').trim(); let pos = [];
  const suf = s.match(/\(\s*([A-Za-zÄÖÜäöü\/]{1,12})\b[^)]*\)\s*$/); if (suf && posList(suf[1]).length) { pos = posList(suf[1]); s = s.slice(0, suf.index).trim(); }
  else s = s.replace(/\([^)]*\)/g, ' ').trim();
  const pre = s.match(/^([A-Za-zÄÖÜäöü\/]{1,12})\s*[:.)\-–\t ]\s*(.+)$/); if (pre && !pos.length && posList(pre[1]).length && pre[1].length <= 3 + (pre[1].includes('/') ? 2 : 0)) { pos = posList(pre[1]); s = pre[2].trim(); }
  const name = words(s).filter(w => !clubWords.has(norm(w)) && !FILLER.has(norm(w)) && !/^\d+[.)]?$/.test(w)).join(' ').replace(/[:;,.]+$/, '').trim();
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
  if (chunkParts.length <= 3) { const fuzzy = kader.filter(p => parts(p).some(t => chunkParts.some(c => c.length >= 5 && lev(c, t) <= (Math.min(c.length, t.length) >= 8 || (Math.min(c.length, t.length) >= 6 && c[0] === t[0]) ? 2 : 1)))); if (fuzzy.length) return { hits: fuzzy, how: 'ähnlich' }; }
  return { hits: [], how: '' };
}

const NOISE = /^(hi|hallo|hoi|salut|public|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|januar|februar|maerz|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b|aufstellung|auswechslung|einwechslung|runde|spieltag|wechsel|system|update|sollte|erhalte|falls/i;
const SIG = /^(freundliche gr|viele gr|liebe gr|vielen dank|besten dank|danke|gruss|grüss|gruess|merci|lg\b|mfg|vg\b|this e-?mail|---|uploaded image|eingestellt von)/i;
const UI = /^(Keine Kommentare|\d+ Kommentare?|Kommentar veröffentlichen|Diesen Post per E-Mail versenden|BlogThis!|Auf X teilen|Auf Twitter teilen|In Facebook freigeben|Auf Pinterest teilen|Labels?:|Neuerer Post|Älterer Post|Startseite|Abonnieren|Posts? kommentieren|Share|Teilen)\b/i;
const ENDE = /^Eingestellt von\b.*?\bum\s+(\d{1,2}):(\d{2})/i;
const MONTHS = { januar: 1, january: 1, februar: 2, february: 2, maerz: 3, marz: 3, march: 3, april: 4, mai: 5, may: 5, juni: 6, june: 6, juli: 7, july: 7, august: 8, september: 9, oktober: 10, october: 10, november: 11, dezember: 12, december: 12 };
/** Datumszeile des Blogs ("Freitag, 18. September 2026" oder "Friday, September 18, 2026") -> "2026-09-18" */
function dateLine(l) {
  const de = l.match(/^(?:\p{L}+,\s*)?(\d{1,2})\.\s*(\p{L}+)\s+(\d{4})$/u), en = l.match(/^(?:\p{L}+,\s*)?(\p{L}+)\s+(\d{1,2}),\s*(\d{4})$/u);
  const [d, mo, y] = de ? [de[1], de[2], de[3]] : en ? [en[2], en[1], en[3]] : []; const m = mo && MONTHS[norm(mo)];
  return m ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}
/** Zeitpunkt in Zuerich (Sommer-/Winterzeit) als Date */
function zurich(date, hh, mm) {
  const guess = new Date(`${date}T${String(hh).padStart(2, '0')}:${mm}:00Z`);
  const off = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Zurich', timeZoneName: 'shortOffset' }).formatToParts(guess).find(x => x.type === 'timeZoneName')?.value.match(/([+-]\d+)/);
  return new Date(guess.getTime() - (off ? Number(off[1]) : 1) * 3600e3);
}

/** Text in Posts/Bloecke teilen: Blog-Posts enden mit "Eingestellt von … um …" (Blog: neuester Post oben);
    sonst gilt jede kurze Zeile mit Managernamen als Blockanfang (Chat/Mail: Reihenfolge wie geschrieben).
    Liefert die Bloecke in zeitlicher Reihenfolge (aeltester zuerst), damit ein «Update» den frueheren Post ergaenzt. */
function splitBlocks(lines, managers, kaderOf) {
  const mgrByNorm = {}; managers.forEach(m => { mgrByNorm[norm(m.name)] = m; });
  const mgrIn = line => { const found = new Set(); words(line).forEach(w => { const m = mgrByNorm[norm(w)]; if (m) found.add(m); }); return [...found]; };
  const blocks = [];
  if (lines.some(l => ENDE.test(l))) {
    let cur = [], curDate = null, sawDate = false;
    for (const line of lines) {
      const d = dateLine(line); if (d) { curDate = d; sawDate = true; continue; }
      const e = line.match(ENDE); if (e) { if (cur.some(Boolean)) blocks.push({ lines: cur, at: curDate ? zurich(curDate, e[1], e[2]) : null, time: `${e[1].padStart(2, '0')}:${e[2]}` }); cur = []; }
      else if (!UI.test(line)) cur.push(line);
    }
    const out = blocks.map(bl => {
      const nonEmpty = bl.lines.filter(Boolean);
      // Manager: zuerst im Titel (erste Zeilen), sonst der einzige Managername im ganzen Post (Signatur)
      let mgr = null, title = '';
      for (const l of nonEmpty.slice(0, 3)) { if (/^public$/i.test(l)) continue; const ms = mgrIn(l); if (ms.length === 1) { mgr = ms[0]; title = l; break; } }
      if (!mgr) { const all = new Set(); nonEmpty.forEach(l => mgrIn(l).forEach(m => all.add(m))); if (all.size === 1) mgr = [...all][0]; else if (all.size > 1) return { ...bl, manager: null, title: nonEmpty[0] || '', unclear: [...all].map(m => m.name) }; }
      return { ...bl, manager: mgr, title: title || nonEmpty[0] || '' };
    });
    // Der Blog zeigt den neuesten Post oben: mit Datum nach Zeit sortieren, sonst die Reihenfolge umdrehen
    if (sawDate && out.every(b => b.at)) return out.map((b, i) => ({ b, i })).sort((x, y) => x.b.at - y.b.at || y.i - x.i).map(x => x.b);
    return out.reverse();
  }
  let cur = null;
  for (const line of lines) {
    if (!line) { if (cur) cur.lines.push(''); continue; }
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

/* ---------- Wechsel erkennen ---------- */
// "X für Y", "X anstelle Y", "X statt Y", "X ersetzt Y", "X kommt für Y": X kommt rein, Y geht raus
const IN_FIRST = /(?:^|\s+)(?:kommt\s+(?:rein\s+)?)?(?:für|fuer|anstelle(?:\s+von)?|anstatt|statt|ersetzt|f|for|instead\s+of|replaces)\s+/i;
// "Y wird durch X ersetzt", "Y durch X": Y geht raus, X kommt rein
const DURCH = /\s+(?:wird\s+)?(?:ersetzt\s+)?durch\s+/i;
// "Y -> X", "Y → X", "Y gegen X", "Y <-> X": Richtung nicht ganz eindeutig, darum spaeter am Kader pruefen
const ARROW = /\s*(?:<->|↔|->|→|=>|⇒)\s*|\s+>\s+|\s+gegen\s+/i;
const NOCHANGE = /^(?:keine?|0)\s+(?:wechsel|änderung(?:en)?|aenderung(?:en)?|auswechslung(?:en)?|einwechslung(?:en)?)\b|^(?:unverändert|unveraendert|gleiche\s+aufstellung|alles\s+wie|wie\s+(?:in\s+der\s+)?(?:vorrunde|letzte|bisher|gehabt|letzter))/i;
const HEAD = /^(?:(\d+|eine?|zwei|drei|vier|fünf|fuenf)\s+)?(einwechslung(?:en)?|auswechslung(?:en)?|wechsel(?:\s+(?:gegenüber|gegenueber|zu|zur|zum|vs\.?)\s+[\p{L}.]+)?|änderung(?:en)?|aenderung(?:en)?|update|korrektur|startaufstellung|aufstellung|startelf|system|zugänge?|zugaenge?|abgänge?|abgaenge?|ersatzbank|bankspieler|bank|ersatz|reserve)(?![\p{L}])\s*:?\s*/iu;
const SHORT = /^(rein|raus|in|out|ein|aus)\s*:?\s*$/i;
// "X raus, Y rein", "raus: X rein: Y", "IN: X OUT: Y"
const KEYTOK = /(?:^|\s)(raus|rein|(?:in|out|ein|aus)(?=\s*:))(?=[\s:,;.!]|$)\s*:?/i;
const modeOf = w => { const n = norm(w); return /^(ersatzbank|bankspieler|bank|ersatz|reserve)$/.test(n) ? 'bench' : /^(einwechslung|zugang|zugange|rein|in|ein)/.test(n) ? 'in' : /^(auswechslung|abgang|abgange|raus|out|aus)/.test(n) ? 'out' : /^(wechsel|anderung|update|korrektur)/.test(n) ? 'sub' : /^system/.test(n) ? 'skip' : 'lineup'; };
const CHUNK_SPLIT = /\s*[,;|]\s*(?![^(]*\))|\s+[\/–]\s+|\s+-\s+|\s+(?:u|und|&)\s+/;

/** Eine Zeile in Ereignisse zerlegen: Spielerliste, Wechselpaar, nur rein, nur raus, keine Aenderung. */
function lineEvents(line, mode) {
  // "Davies (für Gosens)" -> "Davies für Gosens", "Musiala (rein)" -> "Musiala rein"
  line = line.replace(/\(\s*((?:für|fuer|statt|anstatt|anstelle|raus|rein)\b[^)]*)\)/gi, ' $1 ').replace(/\s+/g, ' ').trim();
  if (NOCHANGE.test(line)) return [{ t: 'nochange' }];
  const short = line.match(SHORT); if (short) return [{ t: 'mode', mode: modeOf(short[1]) }];
  if (/^\+\s*\S/.test(line)) return lineEvents(line.replace(/^\+\s*/, ''), 'in');
  // "X raus, Y rein" / "raus X rein Y"
  if (KEYTOK.test(line)) {
    const parts = line.split(new RegExp(KEYTOK.source, 'gi')); const ins = [], outs = [];
    const prefix = !parts[0].trim();
    for (let i = 1; i < parts.length; i += 2) { const names = (prefix ? parts[i + 1] : parts[i - 1]) || ''; if (names.replace(/[\s,;.!]/g, '')) (modeOf(parts[i]) === 'in' ? ins : outs).push(names); }
    if (ins.length || outs.length) return [{ t: 'pair', ins: ins.join(', '), outs: outs.join(', ') }];
  }
  if (DURCH.test(line)) { const [a, ...rest] = line.split(DURCH); return [{ t: 'pair', ins: rest.join(' '), outs: a }]; }
  if (IN_FIRST.test(line)) { const parts = line.split(IN_FIRST); return parts.length > 2 ? [{ t: 'chain', parts }] : [{ t: 'pair', ins: parts[0], outs: parts[1] }]; }
  if (ARROW.test(line)) { const [a, ...rest] = line.split(ARROW); if (rest.join('').trim()) return [{ t: 'pair', ins: rest.join(', '), outs: a, unsure: true }]; }
  if (mode === 'in' || mode === 'out') return [{ t: mode, seg: line }];
  if (mode === 'sub') return [{ t: 'subline', seg: line }];
  return [{ t: 'list', seg: line }];
}

/**
 * Text in Manager-Bloecke teilen und Spieler zuordnen.
 * managers: [{id, name}], kaderOf: managerId -> [{id, name, base_pos, extra_pos, alias}]
 * opts: {clubs, roundNumbers, roundLabel, baseOf(managerId) -> {entries}|null (Vorrunde, fuer reine Wechsel-Posts),
 *        goneOf(managerId) -> [Spieler, die nicht mehr im Kader sind], eventualOf(managerId) -> [{inId, outId}] (gewonnene Gebote
 *        mit Eventualauftrag), notBefore (Deadline der Vorrunde), deadline}
 * Liefert {blocks: [{managerId, name, title, entries, found, unmatched, ambiguous, problems, notes, ok, art}], missing, unclear, skipped}
 */
export function parseLineupText(text, managers, kaderOf, opts = {}) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map(l => l.replace(/ /g, ' ').trim());
  const clubWords = new Set([...CLUBWORDS, ...(opts.clubs || []).flatMap(c => words(c).map(norm))]);
  const raw = splitBlocks(lines, managers, kaderOf);
  const unclear = [], skipped = [];
  const per = {};   // managerId -> zeitlich geordnete, ausgewertete Posts
  const fmtAt = d => d ? d.toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  for (const b of raw) {
    if (!b.manager) { if (b.unclear) unclear.push(`«${b.title}»: mehrere Managernamen (${b.unclear.join(', ')})`); continue; }
    const tag = `${b.manager.name}: «${b.title}»${b.at ? ' (' + fmtAt(b.at) + ')' : ''}`;
    // Gebots-Posts gehoeren nicht hierher (Eventualauftraege laufen ueber die Gebote)
    if (/\b(gebote?|biete)\b/i.test(b.title) || /^(fw|fwd|wg|aw)\s*:/i.test(b.title)) { skipped.push(`${tag} – Gebot`); continue; }
    const m = b.title.match(/(?:runde|spieltag|\br)\s*(\d+)|(\d+)\.\s*spieltag/i); const rn = m && Number(m[1] || m[2]);
    if (rn && opts.roundNumbers?.length && !opts.roundNumbers.includes(rn)) { skipped.push(`${tag} – Post für Runde ${rn}`); continue; }
    if (b.at && opts.notBefore && b.at <= new Date(opts.notBefore)) { skipped.push(`${tag} – vor der Deadline der Vorrunde gepostet`); continue; }
    const r = readBlock(b, kaderOf(b.manager.id) || [], (opts.goneOf && opts.goneOf(b.manager.id)) || [], clubWords, managers);
    if (b.at && opts.deadline && b.at > new Date(opts.deadline)) r.notes.push(`«${b.title}» nach der Deadline gepostet (${fmtAt(b.at)})`);
    (per[b.manager.id] = per[b.manager.id] || { manager: b.manager, posts: [] }).posts.push({ ...r, title: b.title });
  }
  const out = [];
  for (const { manager, posts } of Object.values(per)) {
    const kader = kaderOf(manager.id) || []; const gone = (opts.goneOf && opts.goneOf(manager.id)) || [];
    const byId = Object.fromEntries([...gone, ...kader].map(p => [p.id, p]));
    const notes = [], unmatched = [], ambiguous = [], titles = []; let state = null, art = null; const marks = {}; const explicit = new Set();
    for (const r of posts) {
      unmatched.push(...r.unmatched); ambiguous.push(...r.ambiguous); notes.push(...r.notes);
      if (r.kind === 'leer') continue;
      titles.push(r.title);
      const baseE = (opts.baseOf && opts.baseOf(manager.id))?.entries || {};
      if (r.kind === 'voll') { state = {}; for (const [pid, e] of Object.entries(r.list)) state[pid] = { pos: e.pos }; art = 'voll'; }
      else {
        // Nur Wechsel (oder «keine Wechsel»): auf den vorherigen Post dieser Runde oder die Vorrunde anwenden
        if (!state) { if (!Object.keys(baseE).length) { notes.push(`«${r.title}» nennt nur Wechsel, aber es gibt keine Vorrunden-Aufstellung`); continue; }
          state = {}; for (const [pid, e] of Object.entries(baseE)) state[pid] = { pos: e.pos }; art = art || 'vorrunde'; }
        if (r.kind === 'keine') { notes.push(`«${r.title}»: keine Wechsel – Aufstellung wie bisher`); continue; }
        art = art === 'voll' || art === 'voll+wechsel' ? 'voll+wechsel' : 'wechsel';
      }
      const voll = r.kind === 'voll'; const ref = Object.keys(baseE).length ? baseE : state;
      if (voll) { const expl = new Set(Object.entries(r.list).filter(([, e]) => e.explicit).map(([pid]) => pid)); expl.forEach(pid => explicit.add(pid)); }
      // Elf-Liste zuerst: stehen genau 11 Spieler im Post, gilt diese Liste; die Wechselzeilen darunter erklaeren nur noch
      if (voll && Object.keys(r.list).length === 11) {
        for (const w of r.subs) { const ignored = [];
          w.ins.forEach(i => { if (state[i.p.id]) { if (w.outs.length) marks[i.p.id] = `für ${w.outs.map(o => o.p.name).join(', ')}`; } else ignored.push(i.p.name + ' rein'); });
          w.outs.forEach(o => { if (state[o.p.id] && !w.ins.some(i => i.p.id === o.p.id)) ignored.push(o.p.name + ' raus'); });
          if (ignored.length) notes.push(`Wechselzeile «${[...w.ins, ...w.outs].map(x => x.raw?.trim() || x.p.name).join(' / ')}» nicht angewendet (${ignored.join(', ')}) – die Elf-Liste im Post zählt`); }
        continue; }
      for (let w of r.subs) {
        // Richtung unklar ("A - B", "A -> B", "A gegen B"): wer in der Vorrunde spielte, geht raus
        if (w.unsure) { const inRef = w.ins.some(i => ref[i.p.id]), outRef = w.outs.some(o => ref[o.p.id]); if (inRef && !outRef) w = { ins: w.outs, outs: w.ins }; }
        const freed = [];
        for (const o of w.outs) { if (w.ins.some(i => i.p.id === o.p.id)) continue;
          if (state[o.p.id]) { freed.push(state[o.p.id].pos); delete state[o.p.id]; } else if (!voll) notes.push(`${o.p.name} soll raus, stand aber nicht in der Aufstellung`); }
        w.ins.forEach((i, k) => {
          if (state[i.p.id]) { const np = i.want.find(x => positionsOf(i.p).includes(x)); if (np) state[i.p.id].pos = np; if (!voll) notes.push(`${i.p.name} stand schon in der Aufstellung`); else if (w.outs.length) marks[i.p.id] = `für ${w.outs.map(o => o.p.name).join(', ')}`; return; }
          const allowed = positionsOf(i.p); const cand = [...i.want, freed[k], ...freed].filter(Boolean);
          state[i.p.id] = { pos: cand.find(x => allowed.includes(x)) || i.p.base_pos };
          marks[i.p.id] = w.outs.length ? `für ${w.outs.map(o => o.p.name).join(', ')}` : 'neu';
        });
      }
    }
    if (!state) { out.push({ managerId: manager.id, name: manager.name, title: posts.map(p => p.title).join(' + '), entries: {}, found: [], unmatched, ambiguous, problems: ['Keine Spieler erkannt', ...ambiguous.map(a => `«${a.raw.trim()}» ist mehrdeutig: ${a.options.join(' oder ')}`)], notes, ok: false, art: null }); continue; }
    // Gewonnene Gebote mit Eventualauftrag: der Neue ersetzt den genannten Spieler, auch wenn der Post ihn noch nicht kennt
    for (const ev of (opts.eventualOf && opts.eventualOf(manager.id)) || []) {
      const np = byId[ev.inId]; if (!np || state[ev.inId] || !state[ev.outId]) continue;
      const pos = state[ev.outId].pos; if (!positionsOf(np).includes(pos)) continue;
      delete state[ev.outId]; state[ev.inId] = { pos }; marks[ev.inId] = `Eventualauftrag für ${byId[ev.outId]?.name || ev.outId}`;
    }
    // Spieler, die nicht mehr im Kader sind (entlassen, verkauft): fallen raus, die Pruefung meldet die Luecke
    const kaderIds = new Set(kader.map(p => p.id));
    for (const pid of Object.keys(state)) if (!kaderIds.has(pid)) { notes.push(`${byId[pid]?.name || pid} ist nicht mehr im Kader – fällt raus`); delete state[pid]; }
    // Spieler mit mehreren Positionen: immer die Position, mit der die Elf regelkonform ist
    const fit = fitPositions(state, byId, explicit);
    if (fit) for (const [pid, pos] of Object.entries(fit.changes)) { const was = state[pid].pos; state[pid].pos = pos; notes.push(`${byId[pid].name} als ${pos} statt ${was} aufgestellt${explicit.has(pid) ? '' : ' (keine Positionsangabe im Post)'} – so stimmt die Zahl je Position`); marks[pid] = marks[pid] ? marks[pid] + `, als ${pos}` : `als ${pos}`; }
    const found = Object.entries(state).map(([pid, e]) => ({ name: byId[pid]?.name || pid, pos: e.pos, note: marks[pid] || '' })).sort((a, z) => 'TVMS'.indexOf(a.pos) - 'TVMS'.indexOf(z.pos));
    const problems = posProblems(state, byId);
    // Zu viele Spieler: zeigen, wer gegenueber der Vorrunde dazukam (meist ein nicht erkannter Wechsel)
    const baseAll = (opts.baseOf && opts.baseOf(manager.id))?.entries;
    if (Object.keys(state).length > 11 && baseAll) { const neu = Object.keys(state).filter(pid => !baseAll[pid]).map(pid => byId[pid]?.name || pid); if (neu.length) problems.push(`neu gegenüber der Vorrunde: ${neu.join(', ')} – wer geht dafür raus? (z. B. «X für Y» schreiben)`); }
    if (ambiguous.length) problems.unshift(...ambiguous.map(a => `«${a.raw.trim()}» ist mehrdeutig: ${a.options.join(' oder ')}`));
    if (art === 'wechsel' || art === 'vorrunde') notes.unshift(art === 'vorrunde' ? 'Keine Wechsel: Aufstellung der Vorrunde' : 'Nur Wechsel gepostet: Aufstellung der Vorrunde mit diesen Wechseln');
    out.push({ managerId: manager.id, name: manager.name, title: titles.join(' + ') || posts.map(p => p.title).join(' + '), entries: state, found, unmatched: [...new Set(unmatched)], ambiguous, problems, notes: [...new Set(notes)], ok: problems.length === 0, art });
  }
  return { blocks: out, missing: managers.filter(m => !per[m.id]).map(m => m.name), unclear, skipped };
}

/** Einen Post lesen: Spielerliste und Wechsel getrennt erfassen. */
function readBlock(b, kader, gone, clubWords, managers) {
  const list = {}, subs = [], unmatched = [], ambiguous = [], notes = [];
  let noChange = false, stop = false, mode = 'lineup', pending = [], subCol = -1;
  const m = b.title.match(/(?:runde|spieltag|\br)\s*(\d+)|(\d+)\.\s*spieltag/i);
  const resolve = (chunkRaw, quiet) => {
    if (words(chunkRaw).length === 1 && posList(chunkRaw.trim()).length) return { pos: posList(chunkRaw.trim()), none: true };
    const { pos, name } = chunkOf(chunkRaw, clubWords); if (!name || norm(name).length < 3) return { pos, none: true };
    let { hits, how } = findPlayer(name, kader); if (!hits.length) ({ hits, how } = findPlayer(name, gone));
    if (hits.length === 1) return { p: hits[0], want: pos, how, raw: chunkRaw };
    if (hits.length > 1) { if (!quiet) ambiguous.push({ raw: chunkRaw, options: hits.map(h => h.name) }); return { pos, none: true }; }
    if (!quiet && words(name).length <= 3 && !/\d|@/.test(name) && !NOISE.test(name) && !words(name).some(w => managers.some(mm => norm(mm.name) === norm(w)))) unmatched.push(name);
    return { pos, none: true };
  };
  // Segment -> Spieler; eine reine Positionsangabe ("Hlozec, Hoffenheim, S") gilt fuer den Spieler davor
  const players = (seg, quiet) => { const res = [];
    for (const c of String(seg || '').split(CHUNK_SPLIT).filter(Boolean)) { const r = resolve(c, quiet);
      if (r.p) { if (!r.want.length && pending.length) { r.want = pending; } pending = []; res.push(r); }
      else if (r.pos?.length && res.length && !res[res.length - 1].want.length) res[res.length - 1].want = r.pos;
      else if (r.pos?.length) pending = r.pos; }
    return res; };
  const addList = r => { const e = list[r.p.id]; const allowed = positionsOf(r.p); const np = r.want.find(x => allowed.includes(x));
    if (!e) { list[r.p.id] = { pos: np || r.p.base_pos, explicit: !!np }; if (r.want.length && !np) notes.push(`${r.p.name}: ${r.want.join('/')} nicht erlaubt (${allowed.join('/')}), als ${r.p.base_pos}`); else if (r.how === 'ähnlich') notes.push(`«${r.raw.trim()}» als ${r.p.name} gelesen`); }
    else if (np && e.pos !== np) { e.pos = np; e.explicit = true; } };
  for (let line of b.lines) {
    if (stop) continue;
    if (!line) { mode = 'lineup'; continue; }
    if (/^pos\b/i.test(line)) { subCol = line.split(/\s*[|\t]\s*/).findIndex((c, i) => i > 0 && /wechsel|für|fuer|statt|raus|ersetzt|^out$|^for$/i.test(c)); continue; }   // Tabellenkopf, evtl. mit Spalte «Wechsel»
    if (dateLine(line) || /^public$/i.test(line)) continue;
    if (SIG.test(line)) { stop = true; continue; }                 // Grussformel, Signatur, Mail-Disclaimer: ab hier nichts mehr
    if (line === b.title && m) continue;                             // Titel mit Rundennummer
    const h = line.match(HEAD); let lm = mode;
    if (h) { const md = modeOf(h[2]); const rest = line.slice(h[0].length).trim();
      if (md === 'skip') continue;
      if (md === 'bench') { mode = 'bench'; continue; }                // Ersatzbank: gehoert nicht zur Elf
      if (!rest || !/\p{L}{3}/u.test(rest)) { if (!h[1]) mode = md; continue; }   // reine Ueberschrift ("Wechsel:", "Eine Auswechslung")
      line = rest; lm = md === 'lineup' ? mode : md; }
    if (mode === 'bench') continue;
    if (posList(line).length && words(line).length === 1) { pending = posList(line); continue; }   // Position auf eigener Zeile
    // Tabellenzeile mit Eintrag in der Spalte «Wechsel»: der dort genannte Spieler geht raus
    if (subCol > 0 && /[|\t]/.test(line)) { const cells = line.split(/\s*[|\t]\s*/); const sub = (cells[subCol] || '').replace(/^(?:für|fuer|statt|anstelle|anstatt|for|f)\s+/i, '').trim();
      if (sub) { handle({ t: 'pair', ins: cells.filter((_, i) => i !== subCol).join(' | '), outs: sub }, lm); continue; } }
    lineEvents(line, lm).forEach(ev => handle(ev, lm));
  }
  function handle(ev, md) {
    if (ev.t === 'mode') { mode = ev.mode; return; }
    if (ev.t === 'nochange') { noChange = true; return; }
    if (ev.t === 'list') { players(ev.seg).forEach(addList); return; }
    // Zeile im Wechsel-Abschnitt ohne «für»: "A - B", "A / B", "A (B)", auch mehrere durch Komma getrennt.
    // Richtung offen: wer in der Vorrunde spielte, geht raus (siehe parseLineupText)
    if (ev.t === 'subline') { let any = false;
      for (const seg of ev.seg.split(/\s*[,;]\s*(?![^(]*\))/)) { const m2 = seg.match(/^(.+?)\s*\(([^)]+)\)\s*$/) || seg.match(/^(.+?)\s*(?:\s[-–—]\s|\/|\t)\s*(.+)$/);
        if (m2) { const a = players(m2[1], true), z = players(m2[2], true); if (a.length && z.length) { subs.push({ ins: a, outs: z, unsure: true }); any = true; continue; } }
        players(seg).forEach(addList); }
      return; }
    if (ev.t === 'in') { const ins = players(ev.seg); if (ins.length) subs.push({ ins, outs: [] }); return; }
    if (ev.t === 'out') { const outs = players(ev.seg, true); if (outs.length) subs.push({ ins: [], outs }); return; }
    if (ev.t === 'pair') { const ins = players(ev.ins); const outs = players(ev.outs, true);
      if (ins.length || outs.length) subs.push({ ins, outs, unsure: !!ev.unsure }); return; }
    // mehrere Wechsel in einer Zeile ("Führich f Ebnoutalib, Kofane f Schick"): zwischen zwei «für» gehoeren die ersten
    // Spieler zum vorigen Wechsel (so viele, wie dort reinkommen), der Rest kommt beim naechsten rein
    if (ev.t === 'chain') { const P = ev.parts.map((seg, k) => players(seg, k > 0)); let ins = P[0];
      for (let k = 1; k < P.length; k++) { const last = k === P.length - 1; const n = last ? P[k].length : Math.max(1, Math.min(ins.length, P[k].length - 1));
        const outs = P[k].slice(0, n); if (ins.length || outs.length) subs.push({ ins, outs }); ins = P[k].slice(n); }
      if (ins.length) subs.push({ ins, outs: [] }); }
  }
  // Getrennt genannte Ein- und Auswechslungen ("Einwechslung: X" / "Auswechslung: Y") zu einem Wechsel zusammenfassen
  const onlyIn = subs.filter(w => !w.outs.length), onlyOut = subs.filter(w => !w.ins.length);
  if (onlyIn.length && onlyOut.length) { const merged = { ins: onlyIn.flatMap(w => w.ins), outs: onlyOut.flatMap(w => w.outs) }; for (const w of [...onlyIn, ...onlyOut]) subs.splice(subs.indexOf(w), 1); subs.push(merged); }
  // Ein Post mit (fast) vollstaendiger Elf ist eine Aufstellung; sonst eine Liste von Wechseln zur bisherigen Aufstellung
  const listed = new Set([...Object.keys(list), ...subs.flatMap(w => w.ins.map(i => i.p.id))]);
  let kind = listed.size >= 7 ? 'voll' : subs.length ? 'wechsel' : noChange ? 'keine' : Object.keys(list).length ? 'voll' : 'leer';
  return { kind, list, subs, unmatched, ambiguous, notes };
}
