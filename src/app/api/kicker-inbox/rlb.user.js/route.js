import { NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
export const dynamic = 'force-dynamic';

/* Fertiges Tampermonkey-Skript (nur für eingeloggte Admins): App-Adresse und Schlüssel sind eingesetzt.
   Öffnet man diese Adresse in einem Browser mit Tampermonkey, erscheint direkt der Installationsdialog. */
export async function GET(req) {
  const u = await getUser(); if (!u || u.role !== 'admin') return new NextResponse('Bitte zuerst als Admin anmelden.', { status: 403 });
  if (!process.env.CRON_SECRET) return new NextResponse('CRON_SECRET ist in Vercel nicht gesetzt.', { status: 500 });
  const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || new URL(req.url).host;
  const url = `https://${host}/api/kicker-inbox?key=${process.env.CRON_SECRET}`;
  const script = `// ==UserScript==
// @name         RLB kicker-Sender
// @namespace    rlb
// @version      1.0
// @description  Sendet kicker-Aufstellungsseiten und die Elf des Tages an das RLB Managerspiel
// @match        https://www.kicker.de/*
// @match        https://www.kicker.ch/*
// @grant        GM_xmlhttpRequest
// @connect      ${host}
// ==/UserScript==
(function () {
  if (!/\\/aufstellung$|\\/elf-des-tages\\//.test(location.pathname)) return;
  var hinweis = document.createElement('div');
  hinweis.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:99999;background:#1E6B3A;color:#fff;padding:12px 14px;border-radius:8px;font:15px system-ui;box-shadow:0 4px 16px rgba(0,0,0,.35)';
  hinweis.textContent = 'RLB: sende Seite …';
  document.body.appendChild(hinweis);
  GM_xmlhttpRequest({
    method: 'POST', url: ${JSON.stringify(url)},
    headers: { 'Content-Type': 'text/plain' }, data: document.documentElement.outerHTML,
    onload: function (r) { hinweis.textContent = 'RLB: ' + r.responseText; setTimeout(function () { hinweis.remove(); }, 8000); },
    onerror: function () { hinweis.textContent = 'RLB: Senden fehlgeschlagen'; }
  });
})();
`;
  return new NextResponse(script, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
}
