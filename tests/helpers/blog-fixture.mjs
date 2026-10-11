/* Testdaten für den Blog-Import: Manager und Kader aus den Seeds (Runde 1 und 2) plus die später gekauften Spieler,
   die in den Blog-Posts vorkommen, sowie alle archivierten Blog-Einträge. blogger() baut daraus den Text, wie er
   beim Markieren und Kopieren der Blog-Seite entsteht (neuester Post oben, Datumszeilen, «Eingestellt von …»). */
import fs from 'node:fs';
const read = f => JSON.parse(fs.readFileSync(new URL('../../db/seed/' + f, import.meta.url), 'utf8'));
const R1 = read('runde1.json'), R2 = read('runde2.json');
export const managers = R1.managers.map((n, i) => ({ id: i + 1, name: n }));
export const mid = n => managers.find(m => m.name === n).id;
const kader = {}; managers.forEach(m => kader[m.id] = []);
const add = (mgr, name, pos, club, extra = []) => { if (kader[mid(mgr)].some(p => p.name === name)) return; kader[mid(mgr)].push({ id: `${mgr}-${name}`.toLowerCase().replace(/[^a-z0-9]+/g, '-'), name, base_pos: pos, extra_pos: extra, club, alias: [] }); };
R1.players.filter(p => p.status === 'active').forEach(p => { const [b, ...e] = String(p.pos).split('/'); add(p.manager, p.name, b, p.club, e); });
(R2.kaeufe || []).forEach(k => add(k.manager, k.name, k.pos, k.club));
[['Arbi', 'Musiala', 'M', 'Bayern'], ['Arbi', 'Mensah', 'V', 'Köln'], ['Arbi', 'Mokwa', 'S', 'Elversberg', ['M']], ['Arbi', 'Lemperle', 'S', 'Hoffenheim', ['M']], ['Arbi', 'Doan', 'M', 'Frankfurt'], ['Mike', 'Katic', 'V', 'Schalke'], ['Mike', 'Diaby', 'S', 'Leverkusen'],
 ['René', 'Fellhauer', 'M', 'Augsburg'], ['Roman', 'Avdullahu', 'M', 'Hoffenheim'], ['Roman', 'Ibrahimovic', 'M', 'Bayern'], ['Pädi', 'Grüll', 'M', 'Bremen'], ['Dani', 'Fabio Silva', 'M', 'Dortmund'], ['Dani', 'Banzuzi', 'M', 'Leipzig'], ['Roman', 'Medina', 'V', 'Leverkusen'], ['Roman', 'Davies', 'V', 'Bayern'], ['Röfe', 'Karaman', 'M', 'Schalke'], ['Mark', 'Gutierrez', 'V', 'Bayern']]
  .forEach(([m, n, p, c, e]) => add(m, n, p, c, e || []));
for (const [m, n, e] of [['Pädi', 'Caci', ['M']], ['Pädi', 'Mwéne', ['M']], ['Arbi', 'Ryerson', ['M']], ['Roman', 'Beier', ['M', 'V']]]) { const p = kader[mid(m)].find(x => x.name === n); if (p) p.extra_pos = e; }
export { kader };
export const kaderOf = id => kader[id];
export const posts = read('blog-2026-08-09.json').concat(read('blog-2026-09-21.json'));
export const postsBetween = (from, to) => posts.filter(p => p.posted_at > from && p.posted_at < to);
const DAYS = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'], MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
export function blogger(list, { dates = true } = {}) {
  const s = [...list].sort((a, b) => new Date(b.posted_at) - new Date(a.posted_at)); let lastDay = null; const out = [];
  for (const p of s) { const d = new Date(p.posted_at); const loc = new Date(d.getTime() + 2 * 3600e3); const day = loc.toISOString().slice(0, 10);
    if (dates && day !== lastDay) { out.push(`${DAYS[loc.getUTCDay()]}, ${loc.getUTCDate()}. ${MON[loc.getUTCMonth()]} ${loc.getUTCFullYear()}`, ''); lastDay = day; }
    out.push(p.title, '', p.body, '', `Eingestellt von ${p.author} um ${loc.toISOString().slice(11, 16)}`, 'Keine Kommentare:', ''); }
  return out.join('\n');
}
/** Einzelner Post zum Einfügen in blogger() */
export const post = (title, body, { time = '12:00', day = '2026-10-16', author = 'MARKADONA' } = {}) => ({ title, body, author, posted_at: `${day}T${time}:00+02:00` });
