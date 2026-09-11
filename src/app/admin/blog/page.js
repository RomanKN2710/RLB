import { getUser } from '@/lib/auth';
import { readBlog } from '@/lib/blog';
import { fmtDt } from '@/components/ui';

export const dynamic = 'force-dynamic';

/* Rohansicht des Aufstellungs-Blogs: zeigt, was die App von Vercel aus im Blog liest (Posts und Kommentare).
   Grundlage fuer den automatischen Aufstellungs-Import nach der Deadline. */
export default async function Blog() {
  const u = await getUser(); if (!u || u.role !== 'admin') return null;
  let data, err = null; try { data = await readBlog(); } catch (e) { err = e.message; }
  const dt = s => { const d = new Date(s); return isNaN(d) ? s : fmtDt(d); };
  const pre = { whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 };
  return (<div className="card"><div className="eyebrow">Admin</div><h2>Aufstellungs-Blog · Rohansicht</h2>
    <p className="mini">Quelle: {process.env.BLOG_URL || 'https://rotisseryleaguebundesliga.blogspot.com'}. Diese Seite zeigt unverändert, was die App dort liest.</p>
    {err && <div className="err">Blog nicht lesbar: {err}</div>}
    {data && <>
      <p className="mini">Gelesen über: <b>{data.via === 'feed' ? 'Blogger-Feed' : 'HTML-Seite'}</b>{data.feedError && ` (Feed nicht verfügbar: ${data.feedError})`}{data.title && ` · Seitentitel: ${data.title}`}</p>
      <h3>{data.posts.length} Posts</h3>
      {data.posts.map((p, i) => <details key={p.id || p.link || i} open={i === 0}><summary><b>{p.title || '(ohne Titel)'}</b> · {p.author} · {p.published ? dt(p.published) : ''}</summary>
        <pre style={pre}>{p.text}</pre>
        {p.comments?.length > 0 && <><div className="mini" style={{ marginTop: 6 }}><b>{p.comments.length} Kommentare</b></div>
          {p.comments.map((c, j) => <div key={j} style={{ borderTop: '1px solid var(--line)', padding: '4px 0' }}><div className="mini"><b>{c.author}</b> · {c.published}</div><pre style={pre}>{c.text}</pre></div>)}</>}
      </details>)}
      {data.comments.length > 0 && <><h3>{data.comments.length} Kommentare (Feed)</h3>
        {data.comments.map((c, i) => <div key={c.id || i} style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }}><div className="mini"><b>{c.author}</b> · {c.published ? dt(c.published) : ''} · zu: {c.title}</div><pre style={pre}>{c.text}</pre></div>)}</>}
      {data.looseComments?.length > 0 && <><h3>Kommentarblöcke ausserhalb der Posts</h3>{data.looseComments.map((t, i) => <pre key={i} style={pre}>{t}</pre>)}</>}
      {data.bodyText && <details><summary className="mini">Gesamter Seitentext (Rückfall, zur Kontrolle)</summary><pre style={pre}>{data.bodyText}</pre></details>}
    </>}
  </div>);
}
