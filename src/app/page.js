import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import { CATS } from '@/lib/rules';
import { fmtDt, fmtRp } from '@/components/ui';
import Chart from '@/components/Chart';

export default async function Tabelle({ searchParams }) {
  const u = await requireUser();
  const all = await D.rounds();
  const played = all.filter(r => r.deadline && new Date(r.deadline) < new Date());
  if (!played.length) return <div className="card"><h2>Noch keine gewertete Runde</h2><p className="mini">Die Tabelle erscheint, sobald die erste Deadline vorbei ist.</p></div>;
  const sel = Number(searchParams?.r) || played[played.length - 1].number;
  const sd = await D.season(sel);
  const cur = sd.upto[sd.upto.length - 1]; const curData = sd.datas[sd.datas.length - 1];
  const prev = sd.history.length > 1 ? sd.history[sd.history.length - 2].table : null;
  const prevRank = {}; if (prev) prev.forEach(r => prevRank[r.manager_id] = r.rank);
  const name = id => sd.base.managerName[id];
  const rt = curData.totals; const rr = sd.base.managerIds.map(m => ({ m, t: rt[m] })).sort((a, b) => b.t.punkte - a.t.punkte);
  return (<>
    <div className="card">
      <div className="row between"><div><div className="eyebrow">Rangliste</div><h2>Stand nach {cur.label} {cur.status === 'final' ? <span className="pill ok">final</span> : <span className="pill open">vorläufig</span>}</h2></div>
        <form className="row"><label className="small">Stand nach <select name="r" defaultValue={sel}>{played.map(r => <option key={r.id} value={r.number}>{r.label}{r.status !== 'final' ? ' (vorläufig)' : ''}</option>)}</select></label><button className="sec sm">Anzeigen</button></form></div>
      <div className="tbl"><table>
        <thead><tr><th>#</th><th className="l">Manager</th>{CATS.map(([c, l]) => <th key={c}>{l}</th>)}<th>Total</th></tr></thead>
        <tbody>{sd.table.map(r => { const d = prev ? prevRank[r.manager_id] - r.rank : 0; return (
          <tr key={r.manager_id} className={r.manager_id === u.manager_id ? 'me' : ''}><td>{r.rank} {d > 0 && <span className="delta up">▲{d}</span>}{d < 0 && <span className="delta down">▼{-d}</span>}</td><td className="l"><b>{name(r.manager_id)}</b></td>
            {CATS.map(([c]) => <td key={c}>{r.tot[c]}<div className="rp">{fmtRp(r.rp[c])} RP</div></td>)}<td><b className="disp" style={{ fontSize: 18 }}>{fmtRp(r.total)}</b></td></tr>); })}</tbody>
      </table></div>
      <p className="mini">Werte = Saisonsumme · RP = Rangpunkte pro Kategorie (Teilrangpunkte bei Gleichstand, Karten: weniger ist besser, Ziff. 8).</p>
    </div>
    <div className="grid2">
      <div className="card"><div className="eyebrow">{cur.label}</div><h2>Tageswerte</h2>
        <div className="tbl"><table><thead><tr><th className="l">Manager</th>{CATS.map(([c, l]) => <th key={c}>{l}</th>)}</tr></thead><tbody>{rr.map(r => <tr key={r.m} className={r.m === u.manager_id ? 'me' : ''}><td className="l">{name(r.m)}</td>{CATS.map(([c]) => <td key={c}>{r.t[c]}</td>)}</tr>)}</tbody></table></div>
        <div className="kv" style={{ marginTop: 10 }}><b>Deadline</b><span>{fmtDt(cur.deadline)}</span><b>Spiele</b><span>{curData.matches.filter(m => m.finished).length}/{curData.matches.length} beendet</span><b>Team der Runde</b><span>{(cur.tdr || []).join(', ') || '–'}</span><b>Spieler des Tages</b><span>{cur.sdt || '–'}</span>
          {curData.corrections.length > 0 && <><b>Korrekturen</b><span>{curData.corrections.map(k => <div key={k.id}>{name(k.manager_id)}: {k.text}</div>)}</span></>}</div>
        <p className="mini"><Link href={`/runde/${cur.id}`}>Details: Spiele, Aufstellungen, Gebote →</Link></p>
      </div>
      <div className="card"><div className="eyebrow">Verlauf</div><h2>Total Rangpunkte pro Runde</h2><Chart history={sd.history.map(h => ({ label: h.round.label.replace('Spieltag ', 'ST '), table: h.table }))} names={sd.base.managerName} me={u.manager_id} /></div>
    </div>
  </>);
}
