/* Namens- und Vereinsabgleich zwischen kicker und RLB: reine Funktionen ohne Datenbank (testbar). */
import clubSlugs from './kicker-clubs.js';

/* ---------- Namens- und Vereinsabgleich ---------- */
/** Kanonische Schreibweise: Umlaute zu ae/oe/ue (wie in kicker-Slugs), Akzente weg, nur a-z0-9 und Bindestrich. */
export const slugify = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
/** Vergleichsform eines Namensteils: ae/oe/ue zusätzlich zusammengezogen, damit "Grüll", "Gruell" und "Grull" gleich sind. */
const fold = t => t.replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u');
const tokens = s => slugify(s).split('-').filter(t => t && !/^\d+$/.test(t)).map(fold);
const stripInitials = ts => ts.filter(t => t.length > 1);
/** Passt der kicker-Spieler (Slug "dayot-upamecano", Anzeigename "Upamecano") zu unserem Namen ("Upamecano", "Luis Diaz", "Schlotterbeck N.", "L. Vazquez")? */
export function playerMatches(kSlug, kName, ourName) {
  const a = stripInitials(tokens(kSlug)), b = stripInitials(tokens(ourName)), n = stripInitials(tokens(kName));
  if (!a.length || !b.length) return false;
  if (b.join('') === a.join('') || b.join('') === n.join('')) return true;
  // Unser letzter Namensteil ist der Nachname; der muss bei kicker als Nachname vorkommen. Ein Vorname-Treffer reicht nicht.
  const la = a[a.length - 1], lb = b[b.length - 1];
  // ganzer Namensteil, nicht Wortende: «Ilic» ist nicht Milic, «Baum» nicht Nussbaum
  const surname = la === lb || n.includes(lb) || a.includes(lb);
  if (!surname) return false;
  return b.every(t => a.includes(t) || n.includes(t) || t === lb);
}
/** kicker-Vereinsslug zu unserem Vereinsnamen: feste Zuordnung (db/seed/kicker-clubs.json), Rückfall Namensvergleich. */
export const clubSlugOf = ourClub => clubSlugs[ourClub] || null;
export function clubMatches(kTeamSlug, ourClub) {
  const t = String(kTeamSlug || '').toLowerCase(); if (!t || !ourClub) return false;
  const fixed = clubSlugOf(ourClub); if (fixed) return t === fixed;
  const c = fold(slugify(ourClub)); return fold(t).includes(c);
}

/** Ähnlichkeit für Hinweise ("meinten Sie …"): Levenshtein auf dem gefalteten Nachnamen. */
export function lev(a, b) { const m = a.length, n = b.length; const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]); for (let j = 1; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[m][n]; }
export const surnameOf = name => { const t = stripInitials(tokens(name)); return t[t.length - 1] || ''; };

/**
 * Ordnet einen kicker-Spieler einem RLB-Spieler zu. Reihenfolge: gespeicherter kicker_slug → Namensabgleich (nur im selben Verein).
 * Bei mehreren Treffern entscheidet die Position (kicker-Position muss zu Grund-/Zusatzposition passen); bleibt es mehrdeutig, wird nicht zugeordnet.
 */
export function resolveKickerPlayer(kp, candidates, log) {
  // Ohne Vereinsangabe (Handy-Seite nur mit Namen): ueber alle Kandidaten nach Namen, auch bei bekannter kicker-Kennung (deren Nachnamensteil passt)
  if (!kp.team) { const nm = slugify(kp.name); const hits0 = candidates.filter(p => playerMatches(kp.slug, kp.name, p.name) || (p.kicker_slug && (p.kicker_slug === nm || p.kicker_slug.endsWith('-' + nm) || p.kicker_slug.split('-').includes(nm))));
    if (hits0.length === 1) return { player: hits0[0], via: 'name' }; if (hits0.length > 1 && log) log.push(`mehrdeutig: ${kp.name} passt auf ${hits0.map(h => h.name + ' (' + h.club + ')').join(', ')} – nicht zugeordnet`); return null; }
  const sameClub = candidates.filter(p => clubMatches(kp.team, p.club));
  const bySlug = sameClub.filter(p => p.kicker_slug && p.kicker_slug === kp.slug); if (bySlug.length === 1) return { player: bySlug[0], via: 'slug' };
  // Die kicker-Kennung gilt über Vereine hinweg: wer in der Bundesliga den Verein gewechselt hat, bleibt derselbe Spieler (clubChanged)
  if (kp.slug) { const moved = candidates.filter(p => p.kicker_slug && p.kicker_slug === kp.slug); if (moved.length === 1) return { player: moved[0], via: 'slug', clubChanged: true }; }
  let hits = sameClub.filter(p => !p.kicker_slug && playerMatches(kp.slug, kp.name, p.name));
  if (hits.length > 1 && kp.kpos) { const byPos = hits.filter(p => [p.base_pos, ...(p.extra_pos || [])].includes(kp.kpos)); if (byPos.length === 1) hits = byPos; }
  if (hits.length === 1) return { player: hits[0], via: 'name' };
  if (hits.length > 1 && log) log.push(`mehrdeutig: ${kp.name} (${kp.team}) passt auf ${hits.map(h => h.name).join(', ')} – nicht zugeordnet, bitte kicker-Namen im Kader festlegen`);
  return null;
}

