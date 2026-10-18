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
// @version      1.2
// @description  Sendet kicker-Aufstellungsseiten und die Elf des Tages an das RLB Managerspiel – die Werte werden sofort importiert
// @match        https://www.kicker.de/*
// @match        https://www.kicker.ch/*
// @grant        GM_xmlhttpRequest
// @grant        GM.xmlHttpRequest
// @connect      ${host}
// @run-at       document-idle
// ==/UserScript==
(function () {
  // Aufstellungsseiten und Elf des Tages (auch Handy-Adressen); der Server prueft die Seite und ordnet sie dem Spieltag zu
  if (!/\\/aufstellung\\/?$|elf-des-tages|elf-der-woche/i.test(location.pathname) && !/Elf des Tages/i.test(document.title)) return;
  var ZIEL = ${JSON.stringify(url)};
  var box = document.createElement('div');
  box.style.cssText = 'position:fixed;bottom:12px;left:12px;right:12px;z-index:2147483647;background:#1E6B3A;color:#fff;padding:12px 14px;border-radius:8px;font:15px/1.35 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.35);white-space:pre-wrap';
  var txt = document.createElement('div'); box.appendChild(txt);
  var btn = document.createElement('button'); btn.textContent = 'nochmals senden'; btn.style.cssText = 'margin-top:8px;padding:6px 10px;border:0;border-radius:6px;background:#fff;color:#1E6B3A;font:14px system-ui;display:none'; box.appendChild(btn);
  box.addEventListener('click', function (e) { if (e.target !== btn) box.remove(); });
  function show(t, bad) { txt.textContent = 'RLB: ' + t; box.style.background = bad ? '#8B1E1E' : '#1E6B3A'; btn.style.display = bad ? 'inline-block' : 'none'; }
  // Quelltext ausduennen (Skripte, Styles, Bilder-Daten): das Handy sendet sonst mehrere MB, die der Server abweist
  function quelltext() {
    var h = document.documentElement.outerHTML;
    return h.replace(/<!--[\\s\\S]*?-->/g, '').replace(/<(script|style|noscript|svg|iframe|template)\\b[\\s\\S]*?<\\/\\1>/gi, '').replace(/<link\\b[^>]*>/gi, '').replace(/<picture\\b[\\s\\S]*?<\\/picture>/gi, '')
      .replace(/\\s(srcset|data-srcset|data-src|sizes)="[^"]*"/gi, '').replace(/src="data:[^"]*"/gi, 'src=""');
  }
  function senden() {
    show('sende Seite …'); btn.style.display = 'none';
    var ziel = ZIEL + '&url=' + encodeURIComponent(location.href); var body = quelltext();
    var fertig = function (status, text) { if (status >= 200 && status < 300) { show(text); setTimeout(function () { box.remove(); }, 15000); } else show((text || ('Senden fehlgeschlagen (HTTP ' + status + ')')), true); };
    var gm = (typeof GM_xmlhttpRequest === 'function') ? GM_xmlhttpRequest : (typeof GM !== 'undefined' && GM && typeof GM.xmlHttpRequest === 'function') ? GM.xmlHttpRequest : null;
    if (gm) gm({ method: 'POST', url: ziel, headers: { 'Content-Type': 'text/plain' }, data: body, timeout: 90000,
      onload: function (r) { fertig(r.status, r.responseText); }, onerror: function () { fertig(0, 'Senden fehlgeschlagen (keine Verbindung)'); }, ontimeout: function () { fertig(0, 'Zeitüberschreitung – nochmals senden'); } });
    else fetch(ziel, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: body }).then(function (r) { return r.text().then(function (t) { fertig(r.status, t); }); }).catch(function (e) { fertig(0, 'Senden fehlgeschlagen: ' + e); });
  }
  btn.addEventListener('click', function (e) { e.stopPropagation(); senden(); });
  document.body.appendChild(box);
  senden();
})();
`;
  return new NextResponse(script, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' } });
}
