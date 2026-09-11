import { getUser } from '@/lib/auth';
import { readBlog } from '@/lib/blog';
import { fmtDt } from '@/components/ui';

export const dynamic = 'force-dynamic';

/* Rohansicht des Aufstellungs-Blogs: zeigt, was die App von Vercel aus im Blog liest (Posts und Kommentare).
   Grundlage fuer den automatischen Aufstellungs-Import nach der Deadline. */
export default async function Blog() {
  const u = await getUser(); if (!u || u.role !== 'admin') return null;
  let data, err = null; try { data = await readBlog(); } catch (e) { err = e.message; }
  return (<div className="card"><div className="eyebrow">Admin</div><h2>Aufstellungs-Blog · Rohansicht</h2>
    <p className="mini">Quelle: {process.env.BLOG_URL || 'https://rotisseryleaguebundesliga.blogspot.com'} (öffentliche Blogger-Feeds). Diese Seite zeigt unverändert, was die App dort liest.</p>
    {err && <div className="err">Blog nicht lesbar: {err}</div>}
    {data && <>
      <h3>{data.posts.length} Posts</h3>
      {data.posts.map(p => <details key={p.id} open={p === data.posts[0]}><summary><b>{p.title || '(ohne Titel)'}</b> · {p.author} · {p.published ? fmtDt(p.published) : ''}</summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{p.text}</pre></details>)}
      <h3>{data.comments.length} Kommentare</h3>
      {data.comments.map((c, i) => <div key={c.id || i} style={{ borderTop: '1px solid var(--line)', padding: '6px 0' }}><div className="mini"><b>{c.author}</b> · {c.published ? fmtDt(c.published) : ''} · zu: {c.title}</div>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, margin: 0 }}>{c.text}</pre></div>)}
    </>}
  </div>);
}
