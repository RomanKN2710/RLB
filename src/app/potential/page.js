import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { potential } from '@/lib/potential';
import { fmtRp } from '@/components/ui';

export const dynamic = 'force-dynamic';

/* Potential-Tabelle: beste Elf im Nachhinein je Runde, laufend aus den gespeicherten kicker-Werten. */
export default async function Potential() {
  const u = await requireUser(); const sd = await D.season(null); const b = sd.base; const me = u.manager_id;
  const P = await potential(sd);
  if (!P.rounds.length) return <div className="card">Noch keine gewertete Runde.</div>;
  const catSum = t => R.CATS.map(([c]) => t[c]);
  return (<>
    <div className="card"><div className="eyebrow">Spielerei</div><h2>Manager-Potential</h2>
      <p className="mini">Was wäre gewesen, hätte jeder Manager jede Runde im Nachhinein die beste zulässige Elf aus seinem damaligen Kader gestellt? «Beste» heisst grösste Kategoriensumme (Punkte + Zu-null + Assists + Tore − Karten + Team der Runde + Starts), Positionen wie damals gültig, Wechselkosten ausser Acht. Rangpunkte hängen von den anderen ab, darum zwei Sichten. Stand nach {P.rounds[P.rounds.length - 1].label}, rechnet sich mit jedem kicker-Import neu.</p></div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">Sicht 1</div><h2>Potential-Tabelle</h2><p className="mini">Alle zehn gleichzeitig mit ihrer besten Elf: die Rangfolge der Kaderstärke.</p>
        <div className="tbl"><table><thead><tr><th>#</th><th className="l">Manager</th><th>Rangpunkte</th><th>echt</th><th>Δ Rang</th>{R.CATS.map(([c, l]) => <th key={c} title={l}>{l.slice(0, 3)}</th>)}</tr></thead><tbody>
          {P.potentialTable.map(r => { const a = P.actual.find(x => x.manager_id === r.manager_id); const d = a.rank - r.rank; return <tr key={r.manager_id} className={r.manager_id === me ? 'me' : ''}><td>{r.rank}</td><td className="l"><b>{b.managerName[r.manager_id]}</b></td><td><b>{fmtRp(r.total)}</b></td><td className="muted">{fmtRp(a.total)} ({a.rank}.)</td><td className={d > 0 ? 'delta up' : d < 0 ? 'delta down' : 'muted'}>{d > 0 ? '+' + d : d}</td>{catSum(r.tot).map((v, i) => <td key={i}>{v}</td>)}</tr>; })}
        </tbody></table></div></div>
      <div className="card"><div className="eyebrow">Sicht 2</div><h2>Verpasste Rangpunkte</h2><p className="mini">Jeder allein mit bester Elf, die anderen wie gespielt: was die eigene Aufstellungswahl gekostet hat.</p>
        <div className="tbl"><table><thead><tr><th className="l">Manager</th><th>echt</th><th>allein optimal</th><th>verpasst</th><th>Rang</th></tr></thead><tbody>
          {b.managerIds.map(m => P.alone[m]).map((x, i) => ({ ...x, m: b.managerIds[i] })).sort((a, c) => c.gain - a.gain).map(x => <tr key={x.m} className={x.m === me ? 'me' : ''}><td className="l"><b>{b.managerName[x.m]}</b></td><td>{fmtRp(x.actualRp)}</td><td>{fmtRp(x.rp)}</td><td className={x.gain > 0 ? 'delta down' : 'muted'}>{x.gain > 0 ? '−' + fmtRp(x.gain) : '0'}</td><td>{x.actualRank}. → {x.rank}.</td></tr>)}
        </tbody></table></div></div>
    </div>
    <div className="card"><div className="eyebrow">Je Runde</div><h2>Beste Elf im Nachhinein</h2><p className="mini">Kategoriensumme echt → optimal; Spieler, die nicht in der echten Elf standen, sind markiert.</p>
      {P.details.map(({ round, det }) => { const i = sd.upto.indexOf(round); const lu = sd.datas[i].lineups; return <details key={round.id}><summary><b>{round.label}</b> <span className="mini">{b.managerIds.map(m => `${b.managerName[m]} ${det[m].delta > 0 ? '+' + det[m].delta : det[m].delta}`).join(' · ')}</span></summary>
        <div className="grid2" style={{ marginTop: 8 }}>{b.managerIds.map(m => { const x = det[m]; const real = lu[m]?.entries || {}; const sumA = R.CATS.map(([c]) => x.actual[c]).join('/'); const sumO = R.CATS.map(([c]) => x.optimal[c]).join('/');
          return <div key={m} className={m === me ? 'me' : ''}><b>{b.managerName[m]}</b> <span className="mini">{sumA} → {sumO} ({x.delta > 0 ? '+' + x.delta : x.delta})</span>
            <div className="small">{['T', 'V', 'M', 'S'].map(pos => <div key={pos}><span className="muted">{pos}</span> {x.picks.filter(p => p.pos === pos).map(p => <span key={p.pid} style={{ marginRight: 6, fontWeight: real[p.pid] ? 400 : 700, textDecoration: real[p.pid] ? 'none' : 'underline' }}>{b.players[p.pid]?.name}</span>)}</div>)}</div></div>; })}</div></details>; })}
    </div>
  </>);
}
