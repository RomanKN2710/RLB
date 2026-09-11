/* Aufstellungs-Blog (Blogger): Die Manager geben ihre Aufstellungen im Blog ab. Von Vercel aus ist der Blog
   erreichbar. Bevorzugt werden die Blogger-Feeds (JSON) gelesen; sind die Feeds abgeschaltet (HTTP 401),
   wird die HTML-Seite selbst gelesen. */
import * as cheerio from 'cheerio';
const BLOG = () => (process.env.BLOG_URL || 'https://rotisseryleaguebundesliga.blogspot.com').replace(/\/$/, '');
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36';

async function feed(path) {
  const url = `${BLOG()}${path}${path.includes('?') ? '&' : '?'}alt=json&max-results=50`;
  const r = await fetch(url, { cache: 'no-store', headers: { accept: 'application/json', 'user-agent': UA } });
  if (!r.ok) throw new Error(`Blog ${url}: HTTP ${r.status}`);
  const j = await r.json();
  return (j.feed?.entry || []).map(e => ({
    id: e.id?.$t || '', title: e.title?.$t || '', published: e.published?.$t || '', updated: e.updated?.$t || '',
    author: (e.author || []).map(a => a.name?.$t).filter(Boolean).join(', '),
    html: e.content?.$t || e.summary?.$t || '',
    link: (e.link || []).find(l => l.rel === 'alternate')?.href || '',
  }));
}
export const htmlToText = h => String(h || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d|dd|dt)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();

/** HTML-Seite des Blogs lesen: Posts (.post) mit Titel, Datum, Text und den Kommentaren darunter. */
export function parseBlogHtml(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, iframe').remove();
  const txt = el => htmlToText($(el).html() || '');
  const posts = [];
  const postEls = $('.post-outer, .post, article').toArray().filter(el => !$(el).parents('.post-outer, .post, article').length);
  for (const el of postEls) {
    const e = $(el);
    const title = e.find('.post-title, .entry-title, h3, h2').first().text().trim();
    const link = e.find('.post-title a, .entry-title a, a.timestamp-link').first().attr('href') || '';
    const published = e.find('abbr.published, .published, time').first().attr('title') || e.find('abbr.published, .published, time').first().attr('datetime') || e.closest('.date-outer').find('.date-header').text().trim() || '';
    const author = e.find('.post-author .fn, .author .fn, .post-author').first().text().replace(/^\s*(von|by)\s*/i, '').trim();
    const body = e.find('.post-body, .entry-content').first();
    const comments = e.find('.comment, .comments-content .comment-block, #comments-block dt, .comment-thread li').toArray().map(c => ({
      author: $(c).find('.comment-author, .user, cite, .fn').first().text().trim(),
      published: $(c).find('.comment-timestamp, .datetime, abbr').first().text().trim(),
      text: txt($(c).find('.comment-content, .comment-body, p').first().length ? $(c).find('.comment-content, .comment-body').first() : c),
    })).filter(c => c.text);
    posts.push({ title, link, published, author, text: body.length ? txt(body) : txt(e), comments });
  }
  // Kommentare, die nicht innerhalb eines Posts stehen (Blogger setzt sie oft in einen eigenen Block)
  const loose = $('#comments, .comments').toArray().filter(el => !$(el).parents('.post-outer, .post, article').length).map(el => txt(el)).filter(Boolean);
  return { posts, looseComments: loose, bodyText: htmlToText($('body').html() || '').slice(0, 30000), title: $('title').text().trim() };
}

/** Neueste Posts und Kommentare des Blogs, als Text. Feed zuerst, sonst HTML. */
export async function readBlog() {
  try {
    const posts = await feed('/feeds/posts/default');
    let comments = []; try { comments = await feed('/feeds/comments/default'); } catch (e) { comments = [{ title: 'Kommentar-Feed', html: 'Fehler: ' + e.message }]; }
    return { via: 'feed', posts: posts.map(p => ({ ...p, text: htmlToText(p.html), comments: [] })), comments: comments.map(c => ({ ...c, text: htmlToText(c.html) })) };
  } catch (feedErr) {
    const url = `${BLOG()}/`;
    const r = await fetch(url, { cache: 'no-store', headers: { accept: 'text/html', 'user-agent': UA, 'accept-language': 'de-CH,de;q=0.9' }, redirect: 'follow' });
    if (!r.ok) throw new Error(`${feedErr.message}; Seite ${url}: HTTP ${r.status}`);
    const parsed = parseBlogHtml(await r.text());
    return { via: 'html', feedError: feedErr.message, ...parsed, comments: [] };
  }
}
