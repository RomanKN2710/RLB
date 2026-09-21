import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ensureTable, md2html } from '@/lib/bericht';
import { fmtDt } from '@/components/ui';
import { BerichtTools } from './BerichtTools';

export const dynamic = 'force-dynamic';

/* Spieltagsberichte: automatisch nach Abschluss jeder Runde erstellt und an alle Manager gemailt. */
export default async function Bericht() {
  const u = await requireUser(); await ensureTable();
  const rows = await q("select r.id, r.label, r.number, r.status, p.text, p.facts, p.created_at, p.error, p.model from rounds r left join reports p on p.round_id=r.id where r.status='final' order by r.number desc");
  const fmt = n => Number.isInteger(n) ? String(n) : Number(n).toFixed(1);
  const admin = u.role === 'admin';
  return (<>
    <div className="card"><div className="eyebrow">Spieltagsbericht</div><h2>Berichte</h2>
      <p className="mini">Nach Abschluss einer Runde entsteht der Bericht automatisch aus Aufstellungen, kicker-Werten, Tabelle, Potential und Blog: die Lage, das Rennen um die Spitze und den letzten Platz, ein Abschnitt je Manager. Bitte kontrolliert dabei eure eigenen Werte in der Runde und meldet Abweichungen den Admins.</p>
      {!rows.length && <p className="mini">Noch keine abgeschlossene Runde.</p>}</div>
    {rows.map((r, i) => <div key={r.id} className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{r.label}</h2>
        <span className="mini">{r.text ? `erstellt ${fmtDt(r.created_at)}` : 'Bericht fehlt'}{r.error && <span className="delta down"> · {r.error}</span>}</span></div>
      {r.text ? <details open={i === 0}><summary className="mini">{i === 0 ? 'Bericht' : 'Bericht anzeigen'}</summary><div className="bericht" dangerouslySetInnerHTML={{ __html: md2html(r.text) }} />
        {r.facts?.tabelle && <div className="grid2" style={{ marginTop: 12 }}>
          <div><div className="eyebrow">Tabelle nach {r.label}</div><div className="tbl"><table><thead><tr><th>#</th><th className="l">Manager</th><th>RP</th><th>Pkt</th><th>0</th><th>A</th><th>T</th><th>K</th><th>TdR</th><th>St</th></tr></thead><tbody>{r.facts.tabelle.map(t => <tr key={t.manager} className={u.manager_id && t.manager === u.manager_name ? 'me' : ''}><td>{t.rang}</td><td className="l"><b>{t.manager}</b></td><td><b>{fmt(t.rangpunkte)}</b></td><td>{t.Punkte}</td><td>{t['Zu-null']}</td><td>{t.Assists}</td><td>{t.Tore}</td><td>{t.Karten}</td><td>{t['Team der Runde']}</td><td>{t.Starts}</td></tr>)}</tbody></table></div></div>
          {r.facts.potential_tabelle && <div><div className="eyebrow">Potential-Tabelle</div><div className="tbl"><table><thead><tr><th>#</th><th className="l">Manager</th><th>RP optimal</th><th>echter Rang</th></tr></thead><tbody>{r.facts.potential_tabelle.map(t => <tr key={t.manager}><td>{t.rang}</td><td className="l"><b>{t.manager}</b></td><td>{fmt(t.rangpunkte)}</td><td>{t.echt_rang}.</td></tr>)}</tbody></table></div></div>}
        </div>}</details>
        : <p className="mini">{admin ? 'Noch kein Bericht. Er wird beim Abschluss der Runde erstellt; falls das fehlgeschlagen ist, hier neu anstossen.' : 'Der Bericht wird erstellt.'}</p>}
      {admin && <BerichtTools roundId={r.id} hasText={!!r.text} />}
    </div>)}
  </>);
}
