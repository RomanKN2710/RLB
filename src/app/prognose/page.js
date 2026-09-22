import { requireUser } from '@/lib/auth';
import * as D from '@/lib/data';
import { prognose } from '@/lib/prognose';
import { fmtRp } from '@/components/ui';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const pct = p => p < 0.005 ? '<1 %' : `${Math.round(p * 100)} %`;
export default async function Prognose() {
  const u = await requireUser(); const sd = await D.season(null);
  const total = sd.rounds.filter(r => r.type === 'regulaer').length || 34;
  const P = prognose(sd, { totalRounds: total });
  if (!P) return <div className="card"><h2>Saisonprognose</h2><p className="mini">Ab zwei gewerteten Spieltagen.</p></div>;
  const name = id => sd.base.managerName[id]; const n = P.rows.length;
  const col = k => k === 0 ? 'var(--komm)' : k < 4 ? 'var(--accent)' : k === n - 1 ? 'var(--bad)' : `hsl(150 10% ${60 + k * 3}%)`;
  return (<>
    <div className="card"><div className="eyebrow">Hochrechnung</div><h2>Saisonprognose nach {P.played} von {total} Spieltagen</h2>
      <p className="mini">{P.sims.toLocaleString('de-CH')} simulierte Saisons: Für jede der {P.remaining} ausstehenden Runden zieht jeder Manager zufällig eine seiner bisherigen Runden. Daraus ergeben sich Endtabelle und Wahrscheinlichkeiten. Nach wenigen Spieltagen ist das eher Kaffeesatz als Wissenschaft, wird aber jede Woche schärfer.</p>
      <div className="tbl"><table><thead><tr><th>#</th><th className="l">Manager</th><th>jetzt</th><th>Erwartete RP</th><th>Meister</th><th>Preisgeld (1–4)</th><th>Letzter</th><th>Median-Platz</th><th className="l">Platzverteilung</th></tr></thead>
        <tbody>{P.rows.map((r, i) => <tr key={r.manager_id} className={r.manager_id === u.manager_id ? 'me' : ''}><td>{i + 1}</td><td className="l"><b>{name(r.manager_id)}</b></td><td>{r.curRank}. ({fmtRp(r.curRp)})</td><td><b>{r.expRp.toFixed(1)}</b></td><td>{pct(r.p1)}</td><td>{pct(r.pTop4)}</td><td>{pct(r.pLast)}</td><td>{r.median}.</td>
          <td className="l"><div className="prog-bar" title={r.dist.map((p, k) => `${k + 1}. Platz: ${pct(p)}`).join(' · ')}>{r.dist.map((p, k) => <span key={k} style={{ width: `${p * 100}%`, background: col(k) }} />)}</div></td></tr>)}</tbody></table></div>
      <p className="mini">Balken: Anteil der Simulationen je Endplatz – <span style={{ color: 'var(--komm)' }}>■</span> Platz 1, <span style={{ color: 'var(--accent)' }}>■</span> Plätze 2–4, grau Mittelfeld, <span style={{ color: 'var(--bad)' }}>■</span> letzter Platz.</p>
    </div>
  </>);
}
