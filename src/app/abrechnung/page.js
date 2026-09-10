import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { chf } from '@/components/ui';
import PaidForm from './PaidForm';

export default async function Abrechnung() {
  const u = await requireUser(); const admin = u.role === 'admin';
  const sd = await D.season(null); const b = sd.base; const aus = await D.auslagen(sd);
  const pott = b.managerIds.reduce((a, m) => a + aus[m].total, 0); const bbq = R.BBQ_PER_MANAGER * b.managerIds.length; const net = pott - bbq;
  const goals = {}; sd.datas.forEach(d => Object.entries(d.results).forEach(([pid, r]) => { if (r.tore) goals[pid] = (goals[pid] || 0) + r.tore; }));
  const top = Object.entries(goals).sort((a, c) => c[1] - a[1]).slice(0, 10);
  const ledger = await D.ledgerAll();
  return (<>
    <div className="card"><div className="eyebrow">Abrechnung</div><h2>Auslagen pro Manager (in den Pott)</h2>
      <div className="tbl"><table><thead><tr><th className="l">Manager</th><th>Draft</th><th>Vertrags-auflösung</th><th>Käufe</th><th>Wechsel</th><th>Trades</th><th>Sonstiges</th><th>Gutschrift</th><th>Auslagen</th><th>Bezahlt</th><th>Offen</th></tr></thead>
        <tbody>{b.managers.map(m => { const a = aus[m.id]; return <tr key={m.id} className={m.id === u.manager_id ? 'me' : ''}><td className="l">{m.name}</td><td>{chf(a.draft)}</td><td>{chf(a.vertrag)}</td><td>{chf(a.kaeufe)}</td><td>{chf(a.wechsel)}</td><td>{chf(a.trade)}</td><td>{chf(a.sonst)}</td><td>{a.gutschrift ? '−' + chf(a.gutschrift) : '–'}</td><td><b>{chf(a.total)}</b></td><td>{admin ? <PaidForm managerId={m.id} paid={a.paid} /> : chf(a.paid)}</td><td className={a.open > 0 ? 'delta down' : ''}>{chf(a.open)}</td></tr>; })}
          <tr><td className="l"><b>Total</b></td><td colSpan={7}></td><td><b>{chf(pott)}</b></td><td></td><td></td></tr></tbody></table></div>
      <p className="mini">Draft = Phase-1-Preise (4.3.1), Ersatzbank belastet den Pott nicht (4.3.2). Wechsel = 50 % des Werts jedes Einwechselspielers (5.1). Käufe (7.4). Trades je 5 (6). Vertragsauflösung 20 (4.3.3). Gutschrift = Wert eines Spielers, der die Bundesliga verlassen hat (7.4); wird dem Kaufbudget gutgeschrieben und von den Auslagen abgezogen. Draft-Kosten sind fest gebucht (Buchung «draft»).</p></div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">Ziff. 9</div><h2>Pott (provisorisch)</h2><div className="kv"><b>Einzahlungen</b><span>{chf(pott)}</span><b>BBQ (20 × {b.managerIds.length})</b><span>−{bbq}</span><b>Verteilbar</b><span><b>{chf(net)}</b></span>
        {R.PAYOUT.map(([r, pc]) => <span key={r} style={{ display: 'contents' }}><b>Rang {r} ({pc} %)</b><span>{b.managerName[(sd.table.find(x => x.rank === r) || {}).manager_id] || '–'} · {(net * pc / 100).toFixed(0)}</span></span>)}
        <b>Torschützenkönig (5 %)</b><span>{(net * .05).toFixed(0)}</span><b>Spieler des Jahres (5 %)</b><span>{(net * .05).toFixed(0)}</span></div></div>
      <div className="card"><div className="eyebrow">Sonderpreise</div><h2>Torschützen</h2><ul className="clean">{top.length ? top.map(([pid, g]) => <li key={pid}>{b.players[pid]?.name} <span className="muted">({b.managerName[b.players[pid]?.manager_id]})</span> · {g}</li>) : <li className="muted">noch keine Tore</li>}</ul>
        <h3 style={{ marginTop: 12 }}>Spieler des Tages</h3><div className="small">{sd.rounds.filter(r => r.sdt).map(r => `${r.label}: ${r.sdt}`).join(' · ') || '–'}</div></div>
    </div>
    <div className="card"><div className="eyebrow">Buchungen</div><h2>Gebühren &amp; Gutschriften</h2><div className="tbl"><table><thead><tr><th className="l">Runde</th><th className="l">Manager</th><th className="l">Art</th><th>CHF</th><th className="l">Text</th></tr></thead><tbody>{ledger.length ? ledger.map(l => <tr key={l.id}><td className="l">{l.round_label || '–'}</td><td className="l">{l.manager_name}</td><td className="l">{l.type}</td><td>{chf(l.amount)}</td><td className="l mini">{l.text}</td></tr>) : <tr><td colSpan={5} className="l muted">keine</td></tr>}</tbody></table></div></div>
  </>);
}
