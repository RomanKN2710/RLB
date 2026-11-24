'use client';
import { useState } from 'react';

/* Freie Spieler mit Saisonwerten (Einsätze, Startelf, Tore, Assists, Karten laut kicker), filter- und sortierbar. */
const COLS = [['games', 'Sp', 'Einsätze'], ['starts', 'St', 'Startelf'], ['tore', 'T', 'Tore'], ['assists', 'A', 'Assists'], ['karten', 'K', 'Karten'], ['last', 'zuletzt', 'letzter Einsatz']];
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();

export default function FreeList({ pool }) {
  const [qs, setQs] = useState(''); const [club, setClub] = useState(''); const [pos, setPos] = useState(''); const [sort, setSort] = useState('games');
  const clubs = [...new Set(pool.map(p => p.club).filter(Boolean))].sort();
  const hatWerte = pool.some(p => p.starts != null);
  const cols = COLS.filter(c => hatWerte || c[0] === 'games' || c[0] === 'last');
  const all = pool.filter(p => (!qs || norm(p.name).includes(norm(qs)) || (p.first && norm(p.first + ' ' + p.name).includes(norm(qs)))) && (!club || p.club === club) && (!pos || (p.positions || p.pos || '').includes(pos)))
    .sort((a, b) => (Number(b[sort]) || 0) - (Number(a[sort]) || 0) || String(a.name).localeCompare(String(b.name)));
  const rows = all.slice(0, 60);
  return (<div>
    <div className="row" style={{ marginBottom: 8 }}>
      <input aria-label="Name suchen" placeholder="Name suchen" value={qs} onChange={e => setQs(e.target.value)} />
      <select aria-label="Verein" value={club} onChange={e => setClub(e.target.value)}><option value="">alle Vereine</option>{clubs.map(c => <option key={c}>{c}</option>)}</select>
      <select aria-label="Position" value={pos} onChange={e => setPos(e.target.value)}><option value="">alle Positionen</option>{['T', 'V', 'M', 'S'].map(x => <option key={x}>{x}</option>)}</select>
      <label className="mini">sortiert nach <select value={sort} onChange={e => setSort(e.target.value)}>{cols.map(([k, , l]) => <option key={k} value={k}>{l}</option>)}</select></label>
    </div>
    {pool.length === 0 ? <div className="mini">Pool noch leer: füllt sich mit dem ersten kicker-Import.</div> :
      <div className="tbl"><table><thead><tr><th className="l">Pos</th><th className="l">Spieler</th><th className="l">Verein</th>{cols.map(([k, h, l]) => <th key={k} title={l}><button type="button" className="thsort" aria-label={`nach ${l} sortieren`} onClick={() => setSort(k)}>{h}{sort === k ? ' ▾' : ''}</button></th>)}</tr></thead>
        <tbody>{rows.map(p => <tr key={p.slug}><td className="l">{p.positions || p.pos || '?'}</td><td className="l">{p.name}{p.first ? <span className="mini"> {p.first}</span> : null}</td><td className="l">{p.club || '–'}</td>
          {cols.map(([k]) => <td key={k} className={p[k] ? '' : 'muted'}>{k === 'last' ? (p.last ? `ST ${p.last}` : '') : (p[k] ?? '–')}</td>)}</tr>)}</tbody></table>
        <div className="legend"><b>Pos</b> laut kicker, mit Schrägstrich die schon gespielten Zusatzpositionen{hatWerte ? <> · <b>Sp</b> Einsätze · <b>St</b> Startelf · <b>T</b> Tore · <b>A</b> Assists · <b>K</b> Karten</> : null}{all.length > 60 ? ` · ${all.length} Treffer, die ersten 60 – bitte filtern` : ''}</div></div>}
  </div>);
}
