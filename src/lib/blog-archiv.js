/* Blog-Archiv: alle Einträge des Aufstellungs-Blogs (rotisseryleaguebundesliga.blogspot.com) dauerhaft in der
   Datenbank. Der Blog ist von Vercel aus nicht lesbar (401/429), darum werden die Einträge per Copy-Paste oder
   als Textexport eingespielt. Jeder Eintrag wird klassifiziert (Aufstellung, Gebot, Verträge/Keeper, Team, Sonstiges),
   einem Manager und – anhand der Deadlines – einer Runde zugeordnet. */
import { createHash } from 'node:crypto';
import { q, one } from './db';

export async function ensureTable() {
  await q(`create table if not exists blog_posts (
    id serial primary key, posted_at timestamptz, author text, title text not null, body text not null,
    kind text not null, manager_id int references managers(id), round_number int, source text,
    hash text not null unique, created_at timestamptz not null default now())`);
}

const MONTHS = { januar: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };
/** Bürgerliche Namen/Adressen der Manager, wie sie in weitergeleiteten Mails vorkommen. */
const ALIASES = { 'Röfe': ['Rolf Stauffer', 'Stauffer', 'Roefe'], 'Dani': ['Daniel Allenspach', 'Allenspach'], 'Pädi': ['Patrick Duss', 'Duss', 'Paedi'], 'Mark': ['Mark Fehlmann', 'Fehlmann', 'Markadona'], 'David': ['David Lenz'], 'Roman': ['Roman Knipprath', 'Knipprath'], 'Arbi': ['Berisha', 'berishaa'], 'René': ['Rene'] };
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const hasName = (t, n) => new RegExp('(?<!\\p{L})' + esc(n) + '(?!\\p{L})', 'iu').test(t || '');

/** Textexport (### Titel / Datum: … | Autor: … / Text / ---) oder Copy-Paste aus dem Blog ("Eingestellt von X um HH:MM"). */
export function parseBlogText(text, { defaultDate = null } = {}) {
  const t = String(text || '').replace(/\r/g, '').replace(/ /g, ' ');
  const posts = [];
  if (/^###\s+.+\n\s*Datum:/m.test(t)) {
    for (const s of t.split(/\n---\n/)) {
      const sec = s.trim(); if (!sec.startsWith('###')) continue;
      const lines = sec.split('\n'); const title = lines[0].replace(/^###\s*/, '').trim();
      const dm = lines[1].match(/Datum:\s*(\S+)\s*\|\s*Autor:\s*(.+)/);
      posts.push({ title, posted_at: dm ? dm[1] : null, author: dm ? dm[2].trim() : null, body: lines.slice(2).join('\n').trim() });
    }
    return posts;
  }
  // Copy-Paste: Datumszeilen ("Freitag, 11. September 2026") setzen das Datum, "Eingestellt von X um HH:MM" schliesst einen Post ab
  let curDate = defaultDate; let buf = [];
  for (const raw of t.split('\n')) {
    const line = raw.trim();
    const dm = line.match(/^(?:[A-Za-zäöü]+,\s*)?(\d{1,2})\.\s*([A-Za-zäöü]+)\s+(\d{4})$/) || (m => m && [m[0], m[2], m[1], m[3]])(line.match(/^(?:[A-Za-zäöü]+,\s*)?([A-Za-zäöü]+)\s+(\d{1,2}),\s*(\d{4})$/));
    if (dm && MONTHS[dm[2].toLowerCase()]) { curDate = `${dm[3]}-${String(MONTHS[dm[2].toLowerCase()]).padStart(2, '0')}-${String(dm[1]).padStart(2, '0')}`; continue; }
    const em = line.match(/^Eingestellt von\s+(.+?)\s+um\s+(\d{1,2}):(\d{2})/i);
    if (em) {
      const lines = buf.map(x => x.replace(/\s+$/, '')); while (lines.length && !lines[0].trim()) lines.shift(); while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
      if (lines.length) { const title = lines[0].trim(); const body = lines.slice(1).join('\n').replace(/^\n+/, '').trim();
        posts.push({ title, author: em[1].trim(), posted_at: curDate ? `${curDate}T${em[2].padStart(2, '0')}:${em[3]}:00+02:00` : null, body: body || title }); }
      buf = []; continue;
    }
    if (/^(Keine Kommentare|\d+ Kommentare?|Diesen Post per E-Mail versenden|BlogThis!|Auf X teilen|In Facebook freigeben|Auf Pinterest teilen)/i.test(line)) continue;
    buf.push(raw);
  }
  return posts;
}

/** Art, Manager und Runde eines Eintrags bestimmen. rounds: reguläre Runden mit deadline (aufsteigend). */
export function classify(p, managers, rounds) {
  const title = p.title || ''; const body = p.body || '';
  const posLines = (body.match(/^\s*(\d+\s*[.)]?\s*)?(T|V|M|S|V\/M|M\/V|M\/S|S\/M|TW|ST)\s*[|,]?\s+\p{L}/gmu) || []).length;
  let kind = 'sonstiges';
  if (/keeper|vertr[äa]g/i.test(title)) kind = 'keeper';
  else if (/gebot|biete/i.test(title) || /^(Gebot|Biete|Ich biete)/im.test(body.slice(0, 200))) kind = 'gebot';
  else if (/^Team\s+\S+(\s+\d\d\/\d\d)?$/i.test(title.trim())) kind = 'team';
  else if (posLines >= 8 || /aufstellung|runde|spieltag|^\S+\s+R\d/i.test(title) && (posLines >= 4 || /keine wechsel|für|anstelle|update/i.test(body))) kind = 'aufstellung';
  else if (/^test\b/i.test(title)) kind = 'sonstiges';
  let manager = null;
  for (const m of managers) if (hasName(title, m.name)) { manager = m; break; }
  if (!manager) { const first = body.split('\n').slice(0, 3).join(' '); for (const m of managers) if (hasName(first, m.name)) { manager = m; break; } }
  if (!manager) { for (const m of managers) if ((ALIASES[m.name] || []).some(a => hasName(body, a))) { manager = m; break; } }
  if (!manager) { const hits = managers.filter(m => hasName(body, m.name)); if (hits.length === 1) manager = hits[0]; }
  if (!manager && p.author) { for (const m of managers) if (hasName(p.author, m.name)) { manager = m; break; } }
  // Massgebliches Datum: bei weitergeleiteten Gebots-Mails das Datum der Mail ("Von: …, Freitag, 4. September 2026, 12:13")
  let when = p.posted_at ? new Date(p.posted_at).getTime() : null;
  const vm = body.match(/^(?:Von|Gesendet):.*?(\d{1,2})\.\s*([A-Za-zäöü]+)\s+(\d{4}),?(?:\s*um)?\s*(\d{1,2}):(\d{2})/m);
  if (vm && MONTHS[vm[2].toLowerCase()]) when = new Date(`${vm[3]}-${String(MONTHS[vm[2].toLowerCase()]).padStart(2, '0')}-${String(vm[1]).padStart(2, '0')}T${vm[4].padStart(2, '0')}:${vm[5]}:00+02:00`).getTime();
  let round = null;
  if (when && (kind === 'aufstellung' || kind === 'gebot')) round = rounds.find(r => r.deadline && new Date(r.deadline).getTime() >= when) || null;
  return { kind, manager_id: manager ? manager.id : null, round_number: round ? round.number : null };
}

export const hashOf = p => createHash('sha1').update(`${p.title}\n${p.posted_at || ''}\n${p.body}`).digest('hex');

/** Einträge einspielen (idempotent über hash). Gibt {neu, vorhanden, log} zurück. */
export async function importPosts(posts, managers, rounds, source = 'paste') {
  await ensureTable(); let neu = 0, vorhanden = 0; const log = [];
  for (const p of posts) {
    if (!p.title || !p.body) continue;
    const c = classify(p, managers, rounds); const h = hashOf(p);
    const r = await q(`insert into blog_posts(posted_at,author,title,body,kind,manager_id,round_number,source,hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9) on conflict(hash) do nothing returning id`,
      [p.posted_at || null, p.author || null, p.title, p.body, c.kind, c.manager_id, c.round_number, source, h]);
    if (r.length) { neu++; log.push(`${p.posted_at ? p.posted_at.slice(0, 10) : '?'} «${p.title}» → ${c.kind}${c.manager_id ? ', ' + managers.find(m => m.id === c.manager_id).name : ''}${c.round_number ? ', Runde ' + c.round_number : ''}`); } else vorhanden++;
  }
  return { neu, vorhanden, log };
}

export async function allPosts() { await ensureTable(); return q('select * from blog_posts order by posted_at desc nulls last, id desc'); }
export async function setPostMeta(id, { kind, manager_id, round_number }) { await ensureTable(); await q('update blog_posts set kind=$2, manager_id=$3, round_number=$4 where id=$1', [id, kind, manager_id || null, round_number || null]); }
export async function deletePost(id) { await ensureTable(); await q('delete from blog_posts where id=$1', [id]); }
export const KINDS = { aufstellung: 'Aufstellung', gebot: 'Gebot', keeper: 'Verträge/Keeper', team: 'Team', sonstiges: 'Sonstiges' };
