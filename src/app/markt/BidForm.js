'use client';
import { useState, useTransition } from 'react';
import { submitBidsAction, withdrawBidAction } from '@/actions';
import { Msg } from '@/components/ui';

/* Gebotsformular (Ziff. 7.1): ein oder mehrere Gebote. Je Gebot: Spieler in Reihenfolge (Alternativen), «höchstens N Spieler»,
   Entlassungen in Reihenfolge und auf Wunsch Eventualaufträge (gratis einwechseln, 1. Zuschlag ersetzt den ersten …).
   Entspricht dem, was Manager per Mail schreiben: «Gebot Nr. 2: in folgender Reihenfolge auf maximal einen Spieler …». */
const norm = s => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
const emptyBid = (clubs, minBid) => ({ name: '', pos: 'M', club: clubs[0], price: minBid });
const emptyGroup = (clubs, minBid) => ({ maxWins: 1, bids: [emptyBid(clubs, minBid)], releases: [''], swaps: [], eventual: false });

/** Gespeicherte Gebote (Zeilen der Tabelle bids) in Gruppen für das Formular zurückverwandeln. */
function fromSaved(mine, clubs, minBid) {
  if (!mine?.length) return [emptyGroup(clubs, minBid)];
  const by = {}; for (const r of [...mine].sort((a, z) => a.priority - z.priority)) (by[r.gruppe || 1] ||= []).push(r);
  return Object.values(by).map(rows => { const f = rows[0]; const maxWins = Number(f.max_wins) || 1;
    const releases = (f.release_order && f.release_order.length ? f.release_order : [f.release_player_id]).filter(Boolean);
    const swaps = (f.swap_order && f.swap_order.length ? f.swap_order : [...new Set(rows.map(r => r.swap_out_player_id).filter(Boolean))]);
    return { maxWins, bids: rows.map(r => ({ name: r.player_name, pos: r.pos, club: r.club, price: Number(r.price) })),
      releases: releases.length ? releases : [''], swaps, eventual: swaps.length > 0 }; });
}

function PlayerInput({ value, onPick, onType, pool }) {
  const [focus, setFocus] = useState(false);
  const hits = value.length >= 2 ? pool.filter(p => norm(p.name).includes(norm(value)) || (p.first && norm(p.first + ' ' + p.name).includes(norm(value)))).slice(0, 8) : [];
  return (<span style={{ position: 'relative', flex: '1 1 180px', minWidth: 160 }}>
    <input placeholder="Spielername (wie bei kicker)" value={value} onChange={e => onType(e.target.value)} onFocus={() => setFocus(true)} onBlur={() => setTimeout(() => setFocus(false), 150)} autoComplete="off" style={{ width: '100%' }} />
    {focus && hits.length > 0 && <div className="dropdown">{hits.map(p => <div key={p.slug} className="dd-item" onMouseDown={() => { onPick(p); setFocus(false); }}>{p.positions || p.pos || '?'} <b>{p.name}</b> <span className="mini">{p.club} · {p.games} Einsätze</span></div>)}</div>}
  </span>);
}

export default function BidForm({ pool = [], clubs, kader, lineup, budget, mine, minBid, managerId, managerName, isAdminFor }) {
  const [groups, setGroups] = useState(() => fromSaved(mine, clubs, minBid));
  const [msg, setMsg] = useState(null); const [pending, start] = useTransition();
  const hasBid = !!mine?.length;
  const upd = (gi, fn) => setGroups(gs => gs.map((g, i) => i === gi ? fn({ ...g }) : g));
  const setBid = (gi, bi, patch) => upd(gi, g => ({ ...g, bids: g.bids.map((b, j) => j === bi ? { ...b, ...patch } : b) }));
  const moveBid = (gi, bi, d) => upd(gi, g => { const bids = [...g.bids]; const t = bids[bi]; bids[bi] = bids[bi + d]; bids[bi + d] = t; return { ...g, bids }; });
  const fitLists = g => { const n = Math.min(g.maxWins, g.bids.length); const releases = [...g.releases]; while (releases.length < n) releases.push(''); const swaps = g.eventual ? [...g.swaps] : []; while (g.eventual && swaps.length < n) swaps.push('');
    return { ...g, releases: releases.slice(0, Math.max(n, releases.filter(Boolean).length)), swaps: swaps.slice(0, n) }; };
  const inPool = b => pool.find(p => norm(p.name) === norm(b.name) && p.club === b.club);
  const usedRel = groups.flatMap(g => g.releases).filter(Boolean), usedSwap = groups.flatMap(g => g.swaps).filter(Boolean);
  const name = id => (kader.find(p => p.id === id) || lineup.find(p => p.id === id) || {}).label || '?';
  const summary = groups.map((g, gi) => `${groups.length > 1 ? `Gebot ${gi + 1}: ` : ''}höchstens ${g.maxWins} aus ${g.bids.filter(b => b.name).map(b => `${b.name} ${b.price}`).join(', ') || '–'}; entlässt ${g.releases.filter(Boolean).map(name).join(', ') || '–'}${g.eventual && g.swaps.filter(Boolean).length ? `; gratis für ${g.swaps.filter(Boolean).map(name).join(', ')}` : ''}`);
  const submit = () => start(async () => setMsg(await submitBidsAction({ managerId, groups: groups.map(g => ({ maxWins: g.maxWins, bids: g.bids, releases: g.releases.filter(Boolean), swaps: g.eventual ? g.swaps.filter(Boolean) : [] })) })));
  const withdraw = () => { if (confirm('Alle verdeckten Gebote dieser Runde zurückziehen?')) start(async () => { const r = await withdrawBidAction(managerId); setMsg(r); if (r.ok) setGroups([emptyGroup(clubs, minBid)]); }); };

  return (<>
    <Msg state={msg} />
    <details className="bidform" open={!hasBid}><summary>{hasBid ? 'Gebote ändern' : 'Gebot abgeben'} <span className="mini">{isAdminFor ? `für ${managerName} · ` : ''}Kaufbudget CHF {budget}</span></summary>
      <div className="stack" style={{ marginTop: 8 }}>
        {groups.map((g, gi) => <div key={gi} className="adminbox" style={{ borderStyle: 'solid' }}>
          <div className="row between"><h3 style={{ margin: 0 }}>{groups.length > 1 ? `Gebot ${gi + 1}` : 'Gebot'}</h3>{groups.length > 1 && <button type="button" className="sm sec" onClick={() => setGroups(gs => gs.filter((_, i) => i !== gi))}>Gebot entfernen</button>}</div>
          <p className="mini" style={{ margin: '4px 0' }}>Spieler in der Reihenfolge deiner Wahl. Du erhältst <label>höchstens <select value={g.maxWins} onChange={e => upd(gi, x => fitLists({ ...x, maxWins: Number(e.target.value) }))}>{g.bids.map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</select></label> Spieler aus dieser Liste; sobald das erreicht ist, fallen die weiteren weg.</p>
          {g.bids.map((b, bi) => { const hit = inPool(b);
            return <div key={bi} className="row" style={{ gap: 6, alignItems: 'center', marginBottom: 6 }}>
              <span className="mini" style={{ width: 18 }}>{bi + 1}.</span>
              <PlayerInput value={b.name} pool={pool} onType={v => setBid(gi, bi, { name: v })} onPick={p => setBid(gi, bi, { name: p.name, pos: p.pos || b.pos, club: p.club || b.club })} />
              <select value={b.pos} onChange={e => setBid(gi, bi, { pos: e.target.value })}>{['T', 'V', 'M', 'S'].map(x => <option key={x}>{x}</option>)}</select>
              <select value={b.club} onChange={e => setBid(gi, bi, { club: e.target.value })}>{clubs.map(c => <option key={c}>{c}</option>)}</select>
              <label className="mini">CHF <input type="number" min={minBid} max={budget} step="1" value={b.price} onChange={e => setBid(gi, bi, { price: Number(e.target.value) })} style={{ width: 64 }} /></label>
              {b.name.length >= 2 && (hit ? <span className="pill ok">im Pool: {hit.positions || hit.pos}</span> : <span className="pill grey">nicht im Pool</span>)}
              <span className="row" style={{ gap: 2 }}>
                <button type="button" className="sm sec" disabled={bi === 0} onClick={() => moveBid(gi, bi, -1)} title="nach oben">↑</button>
                <button type="button" className="sm sec" disabled={bi === g.bids.length - 1} onClick={() => moveBid(gi, bi, 1)} title="nach unten">↓</button>
                <button type="button" className="sm sec" disabled={g.bids.length === 1} onClick={() => upd(gi, x => fitLists({ ...x, bids: x.bids.filter((_, j) => j !== bi), maxWins: Math.min(x.maxWins, x.bids.length - 1) }))} title="entfernen">×</button></span>
            </div>; })}
          <button type="button" className="sm sec" onClick={() => upd(gi, x => ({ ...x, bids: [...x.bids, emptyBid(clubs, minBid)] }))}>+ weiterer Spieler (Alternative)</button>
          <div className="stack" style={{ marginTop: 10, gap: 6 }}>
            {g.releases.map((r, ri) => <label key={ri} className="mini">{g.releases.length > 1 ? `Entlassung beim ${ri + 1}. Zuschlag` : 'Entlassung (Pflicht)'} <select value={r} onChange={e => upd(gi, x => ({ ...x, releases: x.releases.map((y, k) => k === ri ? e.target.value : y) }))}><option value="">– wählen –</option>{kader.map(p => <option key={p.id} value={p.id} disabled={p.id !== r && usedRel.includes(p.id)}>{p.label}</option>)}</select></label>)}
            {g.releases.filter(r => r && lineup.some(p => p.id === r) && !(g.eventual && g.swaps.includes(r))).map(r => <div key={r} className="mini delta down">Achtung: {name(r)} steht in deiner Aufstellung und fehlt dort bei Zuschlag. Tipp: Eventualauftrag setzen und ihn bei «Ersetzt» wählen, dann spielt der Neue gratis an seiner Stelle.</div>)}
            <label className="mini"><input type="checkbox" checked={g.eventual} onChange={e => upd(gi, x => fitLists({ ...x, eventual: e.target.checked }))} /> Eventualauftrag: den neuen Spieler gleich gratis in die Aufstellung dieser Runde</label>
            {g.eventual && g.swaps.map((s, si) => <label key={si} className="mini">{g.swaps.length > 1 ? `${si + 1}. Zuschlag ersetzt` : 'Ersetzt'} <select value={s} onChange={e => upd(gi, x => ({ ...x, swaps: x.swaps.map((y, k) => k === si ? e.target.value : y) }))}><option value="">– wählen –</option>{lineup.map(p => <option key={p.id} value={p.id} disabled={p.id !== s && usedSwap.includes(p.id)}>{p.label}</option>)}</select></label>)}
          </div>
        </div>)}
        <div className="row"><button type="button" className="sm sec" onClick={() => setGroups(gs => [...gs, emptyGroup(clubs, minBid)])}>+ weiteres Gebot (eigene Gruppe, z. B. ein Torhüter zusätzlich)</button></div>
        <div className="note"><b>So geht es raus:</b> {summary.map((t, i) => <div key={i}>{t}</div>)}</div>
        <div className="row"><button type="button" disabled={pending} onClick={submit}>Verdeckt abgeben</button>{hasBid && <button type="button" className="sec" disabled={pending} onClick={withdraw}>Gebote zurückziehen</button>}</div>
        <p className="mini">Ganze Franken, mindestens {minBid}. Gleich hohe Gebote gewinnt der schlechter Platzierte. Pro Zuschlag wird ein Spieler entlassen, in der angegebenen Reihenfolge; ohne Zuschlag bleibt alles, wie es ist. Ein Eventualauftrag setzt den Neuen gratis an die Stelle des gewählten Spielers.</p>
      </div>
    </details>
  </>);
}
