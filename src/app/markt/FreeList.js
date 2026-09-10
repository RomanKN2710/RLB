'use client';
import { useState } from 'react';

export default function FreeList({ pool }) {
  const [qs, setQs] = useState(''); const [club, setClub] = useState(''); const [pos, setPos] = useState('');
  const clubs = [...new Set(pool.map(p => p.club).filter(Boolean))].sort();
  const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const rows = pool.filter(p => (!qs || norm(p.name).includes(norm(qs))) && (!club || p.club === club) && (!pos || (p.positions || p.pos || '').includes(pos))).slice(0, 60);
  return (<div>
    <div className="row" style={{ marginBottom: 8 }}>
      <input placeholder="Name suchen" value={qs} onChange={e => setQs(e.target.value)} />
      <select value={club} onChange={e => setClub(e.target.value)}><option value="">alle Vereine</option>{clubs.map(c => <option key={c}>{c}</option>)}</select>
      <select value={pos} onChange={e => setPos(e.target.value)}><option value="">alle Positionen</option>{['T', 'V', 'M', 'S'].map(x => <option key={x}>{x}</option>)}</select>
    </div>
    {pool.length === 0 ? <div className="mini">Pool noch leer: füllt sich mit dem ersten kicker-Import.</div> :
      <div className="tbl"><table><thead><tr><th className="l">Pos (kicker / gespielt)</th><th className="l">Spieler</th><th className="l">Verein</th><th>Einsätze</th><th>zuletzt</th></tr></thead>
        <tbody>{rows.map(p => <tr key={p.slug}><td className="l">{p.positions || p.pos || '?'}</td><td className="l">{p.name}</td><td className="l">{p.club || '–'}</td><td>{p.games}</td><td>{p.last ? `ST ${p.last}` : ''}</td></tr>)}</tbody></table>
        {rows.length === 60 && <div className="mini">nur die ersten 60 Treffer, bitte filtern</div>}</div>}
  </div>);
}
