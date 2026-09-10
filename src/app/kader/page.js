import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { q } from '@/lib/db';
import { chf, fmtDt } from '@/components/ui';
import { Propose as TradePropose, Actions as TradeActions } from './TradePanel';
import AdminPlayerTools from './AdminPlayerTools';

export default async function Kader() {
  const u = await requireUser(); const admin = u.role === 'admin';
  const b = await D.base(); const open = await D.openRound();
  // kicker-Kader: Position laut kicker und ob der Spieler noch in einem Bundesliga-Kader steht
  const { playerMatches, clubMatches } = await import('@/lib/kicker'); const clubSlugs = (await import('../../../db/seed/kicker-clubs.json')).default;
  const squad = await q('select slug,name,club,squad_pos,in_squad from bl_players where in_squad or left_at is not null');
  const kinfo = {}; for (const p of b.playersArr) { if (p.status !== 'active') continue; const same = squad.filter(r => r.club === p.club && playerMatches(r.slug, r.name, p.name)); const clubKnown = squad.some(r => r.club === p.club); const any = same.length ? same : clubKnown ? [] : squad.filter(r => playerMatches(r.slug, r.name, p.name)); const hit = any.length === 1 ? any[0] : same[0]; if (hit) kinfo[p.id] = { pos: hit.squad_pos, club: hit.club, in: hit.in_squad }; }
  const sd = await D.season(null, b); const aus = await D.auslagen(sd);
  const budgets = {}; for (const m of b.managerIds) budgets[m] = await D.budgetLeft(m);
  const trades = await q('select t.*, f.name as from_name, o.name as to_name from trades t join managers f on f.id=t.from_manager join managers o on o.id=t.to_manager order by t.created_at desc');
  const transfers = await D.transfersAll();
  const order = { T: 0, V: 1, M: 2, S: 3 };
  const pname = id => (b.players[id] || {}).name || id;
  return (<>
    <div className="grid2">
      <div className="card"><div className="eyebrow">Ziff. 6</div><h2>Trades</h2>
        <div className="tbl"><table><thead><tr><th className="l">Manager</th><th className="l">gibt</th><th className="l">erhält</th><th className="l">Status</th><th className="l"></th></tr></thead><tbody>
          {trades.length ? trades.map(t => { const uninv = b.managerIds.filter(m => m !== t.from_manager && m !== t.to_manager); return (
            <tr key={t.id}><td className="l">{t.from_name} → {t.to_name}</td><td className="l">{t.give.map(pname).join(', ')}</td><td className="l">{t.get_.map(pname).join(', ')}</td>
              <td className="l"><span className={`pill ${t.status === 'done' ? 'ok' : t.status === 'proposed' ? 'open' : 'grey'}`}>{{ proposed: 'offen', done: 'vollzogen', rejected: 'abgelehnt', reverted: 'rückgängig' }[t.status]}</span>{t.status === 'done' && <div className="mini">Vetos {(t.vetos || []).length}/{uninv.length}{(t.vetos || []).length > 0 && ': ' + t.vetos.map(m => b.managerName[m]).join(', ')}</div>}</td>
              <td className="l"><TradeActions trade={{ id: t.id, status: t.status, from: t.from_manager, to: t.to_manager, vetos: t.vetos || [] }} me={u.manager_id} admin={admin} /></td></tr>); }) : <tr><td colSpan={5} className="l muted">keine</td></tr>}
        </tbody></table></div>
        {u.manager_id && <div style={{ marginTop: 10 }}><TradePropose me={u.manager_id} managers={b.managers.filter(m => m.id !== u.manager_id).map(m => ({ id: m.id, name: m.name }))} players={b.playersArr.filter(p => p.status === 'active').map(p => ({ id: p.id, manager_id: p.manager_id, label: `${p.base_pos} ${p.name} (${p.price})` }))} fee={R.TRADE_FEE} /></div>}
      </div>
      <div className="card"><div className="eyebrow">Historie</div><h2>Transfers</h2><div className="tbl"><table><thead><tr><th className="l">Runde</th><th className="l">Manager</th><th className="l">Art</th><th className="l">Spieler</th><th>CHF</th><th className="l">Notiz</th></tr></thead><tbody>{transfers.slice(0, 40).map(t => <tr key={t.id}><td className="l">{t.round_label || '–'}</td><td className="l">{t.manager_name}</td><td className="l">{t.type}</td><td className="l">{t.player_name}</td><td>{Number(t.price)}</td><td className="l mini">{t.note}</td></tr>)}</tbody></table></div></div>
    </div>
    <div className="grid3">{b.managers.map(m => { const ps = b.playersArr.filter(p => p.manager_id === m.id && p.status === 'active').sort((a, c) => (a.slot > c.slot ? 1 : a.slot < c.slot ? -1 : 0) || order[a.base_pos] - order[c.base_pos] || a.name.localeCompare(c.name)); return (
      <div key={m.id} className="card" style={m.id === u.manager_id ? { borderColor: 'var(--accent)' } : {}}><div className="row between"><h3>{m.name} <span className="mini">{ps.length}/22</span></h3><span className="mini">Kaufbudget {budgets[m.id]} · Auslagen {chf(aus[m.id].total)}</span></div>
        <div className="tbl"><table><tbody>{ps.map(p => <tr key={p.id}><td className="l muted">{R.positionsOf(p).join('/')}{kinfo[p.id] && kinfo[p.id].pos && !R.positionsOf(p).includes(kinfo[p.id].pos) && <span className="badge" title="Position laut kicker-Kader (Grundposition bleibt die Draft-Position; Zusatzposition nur per Spielbericht, Ziff. 5.2)">k:{kinfo[p.id].pos}</span>}</td><td className="l">{p.name}{kinfo[p.id] && !kinfo[p.id].in && <span className="badge j" title="laut kicker in keinem Bundesliga-Kader mehr">Abgang?</span>}{kinfo[p.id] && kinfo[p.id].in && kinfo[p.id].club !== p.club && <span className="badge" title="Verein laut kicker">→ {kinfo[p.id].club}</span>}{p.jugend && <span className="badge j">J</span>}{p.contract && <span className="badge v">{p.contract}</span>}{p.source !== 'draft' && <span className="badge">{p.source}</span>}</td><td className="l muted">{p.club}</td><td>{Number(p.price)}</td>{admin && <td className="l"><AdminPlayerTools player={{ id: p.id, name: p.name, base_pos: p.base_pos, extra_pos: p.extra_pos, contract: p.contract, contract_mandatory: p.contract_mandatory, jugend: p.jugend, price: Number(p.price) }} /></td>}</tr>)}</tbody></table></div></div>); })}</div>
  </>);
}
