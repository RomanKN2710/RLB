'use client';
import { useFormState } from 'react-dom';
import { useState } from 'react';
import { submitBidAction, withdrawBidAction } from '@/actions';
import { Msg } from '@/components/ui';

export default function BidForm({ pool = [], clubs, kader, lineup, budget, hasBid, mine, minBid }) {
  const [name, setName] = useState(mine?.player_name || ''); const [pos, setPos] = useState(mine?.pos || 'M'); const [club, setClub] = useState(mine?.club || clubs[0]);
  const norm = s => String(s || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const hits = name.length >= 2 ? pool.filter(p => norm(p.name).includes(norm(name))).slice(0, 8) : [];
  const exact = pool.find(p => norm(p.name) === norm(name) && p.club === club);
  const pick = p => { setName(p.name); if (p.pos) setPos(p.pos); if (p.club) setClub(p.club); };
  const [state, action] = useFormState(submitBidAction, null);
  const [wstate, waction] = useFormState(async () => withdrawBidAction(), null);
  return (
    <details open={!hasBid}><summary>{hasBid ? 'Gebot ersetzen' : 'Gebot abgeben'} <span className="mini">Kaufbudget CHF {budget}</span></summary>
      <form action={action} className="stack" style={{ marginTop: 8 }}>
        <div className="row">
          <span style={{ position: 'relative' }}><input name="player_name" placeholder="Spielername (wie bei kicker)" required value={name} onChange={e => setName(e.target.value)} autoComplete="off" />
            {hits.length > 0 && !exact && <div className="dropdown">{hits.map(p => <div key={p.slug} className="dd-item" onMouseDown={() => pick(p)}>{p.positions || p.pos || '?'} <b>{p.name}</b> <span className="mini">{p.club} · {p.games} Einsätze</span></div>)}</div>}</span>
          <select name="pos" value={pos} onChange={e => setPos(e.target.value)}>{['T', 'V', 'M', 'S'].map(x => <option key={x}>{x}</option>)}</select>
          <select name="club" value={club} onChange={e => setClub(e.target.value)}>{clubs.map(c => <option key={c}>{c}</option>)}</select>
          {exact ? <span className="pill ok">im Pool: {exact.positions || exact.pos} {exact.club}</span> : name.length >= 2 ? <span className="pill grey">nicht im Pool (frei eingetippt)</span> : null}
          <label className="mini">CHF <input type="number" name="price" min={minBid} max={budget} step="1" defaultValue={mine?.price || minBid} required /></label>
        </div>
        <div className="row">
          <label className="mini">Entlassen (Pflicht) <select name="release" defaultValue={mine?.release_player_id || ''} required><option value="">– wählen –</option>{kader.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
          <label className="mini">Eventualauftrag: gratis einwechseln für <select name="swap" defaultValue={mine?.swap_out_player_id || ''}><option value="">– nein –</option>{lineup.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        </div>
        <Msg state={state || wstate} />
        <div className="row"><button>Verdeckt abgeben</button>{hasBid && <button formAction={waction} className="sec">Gebot zurückziehen</button>}</div>
        <p className="mini">Ganze Franken, min. {minBid}. Der entlassene Spieler zählt ab dieser Runde nicht mehr, falls du den Zuschlag erhältst; sonst bleibt alles unverändert. Ein Eventualauftrag setzt den Neueinkauf gratis an die Stelle des gewählten Spielers.</p>
      </form>
    </details>
  );
}
