/* Admin-Handbuch als PDF bauen: docs/handbuch/slides/*.html (Reihenfolge laut deck.json) -> docs/handbuch/rlb-admin-handbuch.pdf.
   Die App liefert das PDF unter /api/handbuch an angemeldete Admins aus (Link auf Admin › Hilfe).
   Aufruf: npm run handbuch   (braucht Playwright mit Chromium; sonst PLAYWRIGHT_MODULE=/pfad/zu/playwright/index.mjs setzen)

   Folien aendern: die passende Datei unter docs/handbuch/slides/ bearbeiten (eine <section> je Folie, 1920×1080,
   alle Stile inline), Bilder liegen unter docs/handbuch/img/. Danach dieses Skript laufen lassen und das PDF committen. */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const DIR = path.join(process.cwd(), 'docs', 'handbuch');
const OUT = path.join(DIR, 'rlb-admin-handbuch.pdf');
const deck = JSON.parse(fs.readFileSync(path.join(DIR, 'deck.json'), 'utf8'));

async function loadPlaywright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright/index.mjs'].filter(Boolean);
  for (const t of tries) { try { return await import(t.startsWith('/') ? pathToFileURL(t).href : t); } catch (e) { /* naechster Versuch */ } }
  throw new Error('Playwright nicht gefunden – «npm i -D playwright» oder PLAYWRIGHT_MODULE setzen');
}

const sections = deck.order.map(id => {
  const file = path.join(DIR, 'slides', `${id}.html`);
  if (!fs.existsSync(file)) throw new Error(`Folie fehlt: ${file}`);
  return fs.readFileSync(file, 'utf8');
}).join('\n');

const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${deck.title}</title>
<link rel="stylesheet" href="fonts/fonts.css">
<style>
@page { size: 1920px 1080px; margin: 0 }
html, body { margin: 0; padding: 0; background: #ffffff }
section { width: 1920px; height: 1080px; position: relative; overflow: hidden; box-sizing: border-box; break-after: page }
section * { margin: 0; box-sizing: border-box }
section ol, section ul { padding-left: 1.3em }
section li { margin-bottom: 0.35em }
section aside { display: none }
section img { display: block }
section table { border-collapse: collapse; width: 100% }
section th, section td { padding: 0.35em 0.6em; border-bottom: 1px solid #C9D2C9; text-align: left; vertical-align: top }
section th { font-weight: 600; color: #5E6B60; text-transform: uppercase; letter-spacing: 0.06em; font-size: 0.85em }
x-icon { display: inline-block; flex: none; font: 700 28px 'IBM Plex Sans', Arial, sans-serif; line-height: 32px; text-align: center }
x-icon::before { content: '\\2713' }
</style></head><body>
${sections}
</body></html>`;

const tmp = path.join(DIR, '.build.html');
fs.writeFileSync(tmp, html);
const { chromium } = await loadPlaywright();
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  const missing = await page.evaluate(() => [...document.images].filter(i => !i.complete || !i.naturalWidth).map(i => i.getAttribute('src')));
  if (missing.length) throw new Error('Bilder fehlen: ' + missing.join(', '));
  // Vorschaubilder einzelner Folien (zum Pruefen): HANDBUCH_PREVIEW=ordner node scripts/handbuch.mjs
  if (process.env.HANDBUCH_PREVIEW) { fs.mkdirSync(process.env.HANDBUCH_PREVIEW, { recursive: true }); const ids = deck.order;
    for (const id of ids) await page.locator(`section#${id}`).screenshot({ path: path.join(process.env.HANDBUCH_PREVIEW, `${id}.png`) }); }
  await page.pdf({ path: OUT, width: '1920px', height: '1080px', printBackground: true, preferCSSPageSize: true });
} finally { await browser.close(); fs.rmSync(tmp, { force: true }); }
console.log(`${OUT} – ${deck.order.length} Folien, ${(fs.statSync(OUT).size / 1024 / 1024).toFixed(1)} MB`);
