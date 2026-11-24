'use client';
import { useState, useTransition } from 'react';
import { squadsUploadAction } from '@/actions';

/* kicker sperrt den automatischen Kader-Abgleich. Stattdessen: die 18 Kaderseiten im Browser speichern («Speichern unter»,
   als .mht/.mhtml oder .html) und hier hochladen. Die Dateien werden im Browser gelesen; an den Server gehen nur
   Position, Name und kicker-Kennung der Spieler. */
const POS = { Tor: 'T', Abwehr: 'V', Mittelfeld: 'M', Sturm: 'S' };

/** HTML-Teil einer gespeicherten Seite: bei .mht/.mhtml der erste Abschnitt (auch «quoted-printable»), sonst die Datei selbst. */
function htmlOf(raw) {
  const b = (raw.match(/boundary="([^"]+)"/) || [])[1]; if (!b) return raw;
  const part = raw.split('--' + b)[1] || ''; const cut = part.search(/\r?\n\r?\n/); const head = part.slice(0, cut), body = part.slice(cut).trim();
  if (!/quoted-printable/i.test(head)) return body;
  const bytes = []; const s = body.replace(/=\r?\n/g, '');
  for (let i = 0; i < s.length; i++) { if (s[i] === '=' && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2; } else bytes.push(s.charCodeAt(i) & 0xff); }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}
/** Verein (kicker-Slug) und Spielerliste einer Kaderseite. */
export function readSquadFile(raw) {
  const html = htmlOf(raw);
  const loc = (raw.match(/^Snapshot-Content-Location:\s*(\S+)/m) || [])[1] || (html.match(/rel="canonical" href="([^"]+)"/) || [])[1] || '';
  const club = (loc.match(/kicker\.\w+\/([^/]+)\/kader\//) || [])[1] || null;
  const saison = (loc.match(/\/kader\/[^/]+\/(\d{4}-\d{2})/) || [])[1] || null;
  const doc = new DOMParser().parseFromString(html, 'text/html'); const list = [];
  for (const h of doc.querySelectorAll('h2.kick__section-headline--tableheadline')) {
    const pos = POS[(h.textContent || '').trim()]; if (!pos) continue;
    let t = h.nextElementSibling; if (t && t.tagName !== 'TABLE') t = t.querySelector('table'); if (!t) continue;
    for (const a of t.querySelectorAll('a[href*="/spieler/"]')) {
      const m = (a.getAttribute('href') || '').match(/(?:kicker\.\w+)?\/([^/]+)\/spieler\//); if (!m) continue;
      const last = ((a.querySelector('strong') || {}).textContent || a.textContent || '').trim(); const first = ((a.querySelector('span') || {}).textContent || '').trim();
      if (!list.some(x => x[3] === m[1])) list.push([pos, last, first, m[1]]);
    }
  }
  return { club, saison, list };
}

export default function SquadUpload({ slugs, season }) {
  const [files, setFiles] = useState([]); const [msg, setMsg] = useState(null); const [pending, start] = useTransition();
  const pick = async e => { setMsg(null); const out = [];
    for (const f of [...e.target.files]) { try { const r = readSquadFile(await f.text()); out.push({ name: f.name, ...r, fehler: !r.club ? 'Verein nicht erkannt' : !slugs.includes(r.club) ? `«${r.club}» ist kein Verein dieser Saison` : r.saison && r.saison !== season ? `Saison ${r.saison} statt ${season}` : r.list.length < 16 ? `nur ${r.list.length} Spieler gelesen` : null }); } catch (err) { out.push({ name: f.name, club: null, list: [], fehler: 'nicht lesbar: ' + err.message }); } }
    setFiles(out); };
  const gut = files.filter(f => !f.fehler); const squads = Object.fromEntries(gut.map(f => [f.club, f.list])); const n = Object.keys(squads).length;
  const fehlen = slugs.filter(s => !squads[s]);
  return (<details style={{ marginTop: 8 }} open><summary><b>Gespeicherte kicker-Kaderseiten hochladen</b> <span className="mini">der Weg, solange kicker den automatischen Abgleich sperrt</span></summary>
    <p className="mini" style={{ marginTop: 6 }}>Bei kicker je Verein die Seite «Kader» öffnen und im Browser speichern (Chrome: Menü › Speichern unter › «Webseite, eine Datei»; auch «nur HTML» geht). Dann alle Dateien hier auswählen. Mit allen 18 Vereinen bucht die App auch die Abgänge; mit weniger werden nur Zugänge, Wechsel und Positionen nachgeführt.</p>
    <input type="file" multiple accept=".mht,.mhtml,.html,.htm" aria-label="Kaderseiten auswählen" onChange={pick} />
    {files.length > 0 && <>
      <ul className="mini" style={{ paddingLeft: 18, margin: '6px 0' }}>{files.map(f => <li key={f.name} className={f.fehler ? 'delta down' : ''}>{f.club || f.name}: {f.fehler ? `${f.fehler} (${f.name})` : `${f.list.length} Spieler`}</li>)}</ul>
      {n > 0 && n < slugs.length && <p className="mini">Es fehlen noch: {fehlen.join(', ')}</p>}
      <div className="row"><button className="sm komm" disabled={pending || n === 0} onClick={() => start(async () => setMsg(await squadsUploadAction(squads)))}>{pending ? 'übernimmt …' : `${n} Kader übernehmen`}</button>{msg && <span className={'mini ' + (msg.ok ? '' : 'delta down')}>{msg.msg}</span>}</div></>}
  </details>);
}
