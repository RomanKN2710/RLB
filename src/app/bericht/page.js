import { requireUser } from '@/lib/auth';
import { q } from '@/lib/db';
import { ensureTable, md2html } from '@/lib/bericht';
import { fmtDt } from '@/components/ui';
import { BerichtTools } from './BerichtTools';

export const dynamic = 'force-dynamic';

/* Spieltagsberichte: automatisch nach Abschluss jeder Runde erstellt und an alle Manager gemailt. */
export default async function Bericht() {
  const u = await requireUser(); await ensureTable();
  const rows = await q("select r.id, r.label, r.number, r.status, p.text, p.created_at, p.sent_at, p.sent_to, p.error, p.model from rounds r left join reports p on p.round_id=r.id where r.status='final' order by r.number desc");
  const admin = u.role === 'admin';
  return (<>
    <div className="card"><div className="eyebrow">Spieltagsbericht</div><h2>Berichte</h2>
      <p className="mini">Nach Abschluss einer Runde entsteht der Bericht automatisch aus Aufstellungen, kicker-Werten, Tabelle, Potential und Blog und geht als eine Mail an alle Manager, mit der Bitte, die eigenen Werte zu kontrollieren.</p>
      {!rows.length && <p className="mini">Noch keine abgeschlossene Runde.</p>}</div>
    {rows.map((r, i) => <div key={r.id} className="card">
      <div className="row" style={{ justifyContent: 'space-between' }}><h2 style={{ margin: 0 }}>{r.label}</h2>
        <span className="mini">{r.text ? `erstellt ${fmtDt(r.created_at)}` : 'Bericht fehlt'}{r.sent_at ? ` · Mail ${fmtDt(r.sent_at)} an ${(r.sent_to || []).length} Empfänger` : r.text ? ' · noch nicht versendet' : ''}{r.error && <span className="delta down"> · {r.error}</span>}</span></div>
      {r.text ? <details open={i === 0}><summary className="mini">{i === 0 ? 'Bericht' : 'Bericht anzeigen'}</summary><div className="bericht" dangerouslySetInnerHTML={{ __html: md2html(r.text) }} /></details>
        : <p className="mini">{admin ? 'Noch kein Bericht. Er wird beim Abschluss der Runde erstellt; falls das fehlgeschlagen ist, hier neu anstossen.' : 'Der Bericht wird erstellt.'}</p>}
      {admin && <BerichtTools roundId={r.id} hasText={!!r.text} sent={!!r.sent_at} />}
    </div>)}
  </>);
}
