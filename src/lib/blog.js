/* Aufstellungs-Blog (Blogger): Die Manager geben ihre Aufstellungen im Blog ab. Von Vercel aus sind die
   oeffentlichen Blogger-Feeds erreichbar (Posts und Kommentare als JSON), ohne Bot-Schutz. */
const BLOG = () => (process.env.BLOG_URL || 'https://rotisseryleaguebundesliga.blogspot.com').replace(/\/$/, '');

async function feed(path) {
  const url = `${BLOG()}${path}${path.includes('?') ? '&' : '?'}alt=json&max-results=50`;
  const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Blog ${url}: HTTP ${r.status}`);
  const j = await r.json();
  return (j.feed?.entry || []).map(e => ({
    id: e.id?.$t || '', title: e.title?.$t || '', published: e.published?.$t || '', updated: e.updated?.$t || '',
    author: (e.author || []).map(a => a.name?.$t).filter(Boolean).join(', '),
    html: e.content?.$t || e.summary?.$t || '',
    link: (e.link || []).find(l => l.rel === 'alternate')?.href || '',
    inReplyTo: (e.link || []).find(l => l.rel === 'related')?.href || '',
  }));
}
export const htmlToText = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** Neueste Posts und Kommentare des Blogs, als Text. */
export async function readBlog() {
  const posts = await feed('/feeds/posts/default');
  let comments = []; try { comments = await feed('/feeds/comments/default'); } catch (e) { comments = [{ title: 'Kommentar-Feed', html: 'Fehler: ' + e.message }]; }
  return { posts: posts.map(p => ({ ...p, text: htmlToText(p.html) })), comments: comments.map(c => ({ ...c, text: htmlToText(c.html) })) };
}
