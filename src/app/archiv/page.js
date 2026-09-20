import { getUser } from '@/lib/auth';
import * as D from '@/lib/data';
import * as R from '@/lib/rules';
import { q } from '@/lib/db';
import { allPosts, KINDS } from '@/lib/blog-archiv';
import { fmtDt } from '@/components/ui';
import { BlogImport, PostMeta } from './ArchivTools';

export const dynamic = 'force-dynamic';

/* Archiv: alle Blog-Einträge, Kader und Aufstellungen je Runde – die Datenbasis, gegen die App und Excel geprüft werden. */
export default async function Archiv({ searchParams }) {
  const u = await getUser(); if (!u) return null; const admin = u.role === 'admin';
  const b = await D.base(); const rounds = (await D.rounds()).filter(r => r.type === 'regulaer');
  const posts = await allPosts();
  const lus = await q('select l.*, r.number from lineups l join rounds r on r.id=l.round_id');
  const played = rounds.filter(r => r.deadline && new Date(r.deadline) < new Date());
  const sel = Number(searchParams?.runde) || (played.length ? played[played.length - 1].number : rounds[0]?.number);
  const round = rounds.find(r => r.number === sel);
  const kaderOf = m => b.playersArr.filter(p => p.manager_id === m && (p.valid_from ?? 0) <= sel && (p.valid_to == null || p.valid_to >= sel)).sort((a, c) => (a.slot === c.slot ? 0 : a.slot === 'stamm' ? -1 : 1) || 'TVMS'.indexOf(a.base_pos) - 'TVMS'.indexOf(c.base_pos) || a.name.localeCompare(c.name));
  const pre = { whiteSpace: 'pre-wrap', fontSize: 12, margin: '4px 0 0' };
  const PostBox = ({ p }) => <details><summary><b>{p.title}</b> · {p.posted_at ? fmtDt(p.posted_at) : 'ohne Datum'}{p.author && ` · ${p.author}`}</summary><pre style={pre}>{p.body}</pre>{admin && <PostMeta post={{ id: p.id, kind: p.kind, manager_id: p.manager_id, round_number: p.round_number }} managers={b.managers.map(m => ({ id: m.id, name: m.name }))} rounds={rounds.map(r => ({ number: r.number, label: r.label }))} kinds={KINDS} />}</details>;
  const other = posts.filter(p => p.kind !== 'aufstellung' && p.kind !== 'gebot');
  return (<>
    <div className="card"><div className="eyebrow">Archiv</div><h2>Blog, Kader und Aufstellungen</h2>
      <p className="mini">{posts.length} Blog-Einträge gespeichert. Aufstellungs- und Gebotsposts sind der Runde zugeordnet, deren Deadline als nächste folgte (bei weitergeleiteten Gebots-Mails zählt das Mail-Datum). Die Kader zeigen, wer in der gewählten Runde spielberechtigt war (inkl. Käufe ab dieser Runde, ohne bereits Entlassene).</p>
      <div className="row" style={{ flexWrap: 'wrap', gap: 4 }}>{rounds.filter(r => r.number <= (played[played.length - 1]?.number || 0) + 10).map(r => <a key={r.id} className={`btn sm ${r.number === sel ? '' : 'sec'}`} href={`/archiv?runde=${r.number}`}>{r.label}</a>)}</div>
      {admin && <BlogImport />}</div>
    {round && <div className="card"><h2>{round.label} · Deadline {fmtDt(round.deadline)}</h2>
      <div className="tbl"><table><thead><tr><th className="l">Manager</th><th className="l">Blog-Einträge zur Runde</th><th className="l">Aufstellung in der App</th><th className="l">Kader ({'Stamm + Bank'})</th></tr></thead><tbody>
        {b.managers.map(m => { const ps = posts.filter(p => p.manager_id === m.id && p.round_number === sel); const lu = lus.find(l => l.manager_id === m.id && l.number === sel); const kader = kaderOf(m.id);
          const elf = lu ? Object.entries(lu.entries).map(([pid, e]) => ({ pid, pos: e.pos, name: b.players[pid]?.name || pid })).sort((a, c) => 'TVMS'.indexOf(a.pos) - 'TVMS'.indexOf(c.pos) || a.name.localeCompare(c.name)) : [];
          const probs = lu ? R.posProblems(lu.entries, b.players) : [];
          return (<tr key={m.id} style={{ verticalAlign: 'top' }}><td className="l"><b>{m.name}</b></td>
            <td className="l">{ps.length ? ps.map(p => <div key={p.id}><span className="badge">{KINDS[p.kind]}</span> <PostBox p={p} /></div>) : <span className="mini">kein Eintrag (bisherige Aufstellung gilt, Ziff. 5.1)</span>}</td>
            <td className="l small">{lu ? <>{['T', 'V', 'M', 'S'].map(pos => <div key={pos}><span className="muted">{pos}</span> {elf.filter(e => e.pos === pos).map(e => e.name).join(', ')}</div>)}{lu.free_in?.length > 0 && <div className="mini">gratis eingewechselt: {lu.free_in.map(pid => b.players[pid]?.name || pid).join(', ')}</div>}{probs.length > 0 && <div className="mini delta down">{probs.join('; ')}</div>}<div className="mini">gespeichert {fmtDt(lu.updated_at)}</div></> : <span className="mini">keine</span>}</td>
            <td className="l small"><details><summary>{kader.length} Spieler</summary>{kader.map(p => <div key={p.id}>{R.positionsOf(p).join('/')} {p.name} <span className="muted">{p.club} · {Number(p.price)}</span>{p.slot === 'bank' && <span className="badge j">Bank</span>}{p.contract && <span className="badge v">{p.contract}</span>}{p.source !== 'draft' && <span className="badge">{p.source}</span>}</div>)}</details></td></tr>); })}
      </tbody></table></div>
      {posts.some(p => p.round_number === sel && !p.manager_id) && <><h3>Nicht zugeordnete Einträge dieser Runde</h3>{posts.filter(p => p.round_number === sel && !p.manager_id).map(p => <PostBox key={p.id} p={p} />)}</>}
    </div>}
    <div className="card"><h2>Weitere Einträge</h2><p className="mini">Verträge/Keeper, Teams und Sonstiges – unabhängig von der Runde.</p>
      {['keeper', 'team', 'sonstiges'].map(k => other.some(p => p.kind === k) && <div key={k}><h3>{KINDS[k]}</h3>{other.filter(p => p.kind === k).map(p => <div key={p.id}>{p.manager_id && <span className="badge v">{b.managerName[p.manager_id]}</span>} <PostBox p={p} /></div>)}</div>)}
      {posts.length === 0 && <p className="mini">Noch keine Einträge. Der Admin kann den Blog-Text oben einfügen.</p>}</div>
  </>);
}
