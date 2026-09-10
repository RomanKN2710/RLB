'use client';
import { useState, useTransition } from 'react';
import { saveLineupAction } from '@/actions';
import { POSRULE, SWAP_PCT } from '@/lib/rules';
import { chf, Msg } from '@/components/ui';

export default function LineupEditor({ roundId, managerId, players, initial, prevEntries, freeIn, isFirst }) {
  const [entries, setEntries] = useState(initial || {});
  const [msg, setMsg] = useState(null);
  const [pending, start] = useTransition();
  const byId = Object.fromEntries(players.map(p => [p.id, p]));
  const cnt = { T: 0, V: 0, M: 0, S: 0 }; Object.entries(entries).forEach(([pid, e]) => { const pos = e.pos || byId[pid]?.base_pos; if (cnt[pos] !== undefined) cnt[pos]++; });
  const n = Object.keys(entries).length; const bad = Object.entries(POSRULE).filter(([k, [lo, hi]]) => cnt[k] < lo || cnt[k] > hi).map(([k]) => k);
  const free = new Set(freeIn || []);
  const swaps = isFirst || !prevEntries ? [] : Object.keys(entries).filter(pid => !(pid in prevEntries) && !free.has(pid)).map(pid => ({ name: byId[pid]?.name, cost: (byId[pid]?.price || 0) * SWAP_PCT }));
  const swapTotal = swaps.reduce((a, x) => a + x.cost, 0);
  const toggle = p => setEntries(e => { const c = { ...e }; if (c[p.id]) delete c[p.id]; else c[p.id] = { pos: p.base_pos }; return c; });
  const setPos = (pid, pos) => setEntries(e => ({ ...e, [pid]: { pos } }));
  const order = { T: 0, V: 1, M: 2, S: 3 };
  const sorted = players.slice().sort((a, b) => order[a.base_pos] - order[b.base_pos] || (a.slot > b.slot ? 1 : -1) || a.name.localeCompare(b.name));
  const save = () => start(async () => { const r = await saveLineupAction(roundId, managerId, entries); setMsg(r); });
  return (<div className="stack">
    <div className="row between"><div className="posgrid">{Object.entries(POSRULE).map(([k, [lo, hi]]) => <span key={k} className={bad.includes(k) ? 'bad' : 'ok'}>{k} <b>{cnt[k]}</b> <span className="muted">({lo}–{hi})</span></span>)}<span className={n === 11 ? 'ok' : 'bad'}><b>{n}</b>/11</span></div>
      <div className="mini">{isFirst ? 'Grundaufstellung: kostenlos' : <>Wechselkosten: <b>CHF {chf(swapTotal)}</b>{swaps.length > 0 && ` (${swaps.map(s => `${s.name} ${chf(s.cost)}`).join(', ')})`}</>}</div></div>
    <div className="tbl"><table>
      <thead><tr><th className="l">Auf.</th><th className="l">Pos</th><th className="l">Spieler</th><th className="l">Verein</th><th>Wert</th></tr></thead>
      <tbody>{sorted.map(p => { const e = entries[p.id]; const on = !!e; const wasIn = prevEntries && p.id in prevEntries; return (
        <tr key={p.id} className={on ? '' : 'off'}>
          <td className="l"><input type="checkbox" checked={on} onChange={() => toggle(p)} /></td>
          <td className="l">{on ? (p.positions.length > 1 ? <select value={e.pos} onChange={ev => setPos(p.id, ev.target.value)}>{p.positions.map(x => <option key={x}>{x}</option>)}</select> : e.pos) : <span className="muted">{p.positions.join('/')}</span>}</td>
          <td className="l"><b>{p.name}</b>{p.jugend && <span className="badge j" title="Jugendspieler">J</span>}{p.contract && <span className="badge v">{p.contract}</span>}{!isFirst && on && !wasIn && !free.has(p.id) && <span className="badge" title="neu aufgestellt: kostenpflichtig">neu</span>}{free.has(p.id) && <span className="badge j">Eventualauftrag</span>}</td>
          <td className="l muted">{p.club}</td><td>{p.price}</td></tr>); })}</tbody>
    </table></div>
    <Msg state={msg} />
    <div className="row"><button onClick={save} disabled={pending}>{pending ? 'Speichern…' : 'Aufstellung speichern'}</button><span className="mini">Speichern ist bis zur Deadline beliebig oft möglich; es gilt der letzte Stand.</span></div>
  </div>);
}
