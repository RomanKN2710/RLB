import './globals.css';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { cookies } from 'next/headers';
import { logoutAction } from '@/actions';
import { maybeSync } from '@/lib/oldb';
import { waitUntil } from '@vercel/functions';
import { openRound } from '@/lib/data';
import { q, one } from '@/lib/db';
import { fmtDt } from '@/components/ui';
import RlbLogo from '@/components/RlbLogo';
import Nav from '@/components/Nav';
import NavProgress from '@/components/NavProgress';
import { Suspense } from 'react';

export const metadata = { title: 'RLB Managerspiel 26/27', description: 'Rotissery League Bundesliga', applicationName: 'RLB Managerspiel', appleWebApp: { capable: true, title: 'RLB', statusBarStyle: 'default' }, robots: { index: false, follow: false } };
export const viewport = { themeColor: [{ media: '(prefers-color-scheme: light)', color: '#FFFFFF' }, { media: '(prefers-color-scheme: dark)', color: '#1A211D' }], width: 'device-width', initialScale: 1 };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  const user = await getUser();
  let open = null;
  // Spielplan-Sync im Hintergrund: die Seite wartet nicht darauf (ein hängender Dienst hält sonst jede Seite auf)
  if (user) { try { waitUntil(maybeSync(60)); } catch { /* ausserhalb von Vercel: ohne Hintergrundlauf */ maybeSync(60).catch(() => {}); } open = await openRound(); }
  // «Wartet auf dich»: offene Trade-Vorschläge an mich, unzulässige oder unvollständige Aufstellung der offenen Runde
  const hinweise = {};
  if (user && user.manager_id) { try {
    const t = await one("select count(*)::int as n from trades where status='proposed' and to_manager=$1", [user.manager_id]); if (t && t.n) hinweise['/kader'] = t.n === 1 ? '1 Trade-Vorschlag wartet auf dich' : `${t.n} Trade-Vorschläge warten auf dich`;
    if (open) { const lu = await one('select entries from lineups where round_id=$1 and manager_id=$2', [open.id, user.manager_id]); if (lu) { const own = await q("select id from players where manager_id=$1 and status='active'", [user.manager_id]); const ids = new Set(own.map(p => p.id)); const e = Object.keys(lu.entries || {});
        if (e.length !== 11 || e.some(pid => !ids.has(pid))) hinweise['/aufstellung'] = e.length !== 11 ? `Deine Aufstellung hat ${e.length} statt 11 Spieler` : 'In deiner Aufstellung steht ein Spieler, der nicht mehr in deinem Kader ist'; } }
  } catch { /* Hinweise sind Beigabe */ } }
  return (
    <html lang="de"><head><link rel="preconnect" href="https://fonts.googleapis.com" /><link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" /><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" /></head>
      <body>
        <Suspense fallback={null}><NavProgress /></Suspense>
        <header>
          <div className="bar">
            <div className="brand"><RlbLogo height={38} wordmark={false} /><div><h1>RLB Managerspiel</h1><small>Rotissery League Bundesliga · Saison 2026/27</small></div></div>
            <div className="grow" />
            {open && <span className="mini">Offen: <b>{open.label}</b> · Deadline {fmtDt(open.deadline)}</span>}
            {user && <span className="small user-line">{user.name}{user.manager_name && user.manager_name !== user.name ? ` · ${user.manager_name}` : ''}{user.role === 'admin' ? ' · Admin' : ''}</span>}
            {user && <form action={logoutAction}><button className="sec sm">Abmelden</button></form>}
          </div>
          {user && <Nav admin={user.role === 'admin'} hinweise={hinweise} />}
        </header>
        <main>{user && Object.keys(hinweise).length > 0 && <div className="note" style={{ margin: '0 0 12px' }}>{Object.entries(hinweise).map(([h, t]) => <div key={h}><a href={h}>{t} →</a></div>)}</div>}
          {!user && (await cookies()).get('rlb_session') && <div className="note" style={{ margin: '12px 0' }}>Deine Sitzung ist beendet (zum Beispiel nach einem Passwortwechsel oder einem neuen Startpasswort). <a href="/login">Neu anmelden</a></div>}
          {children}</main>
      </body></html>
  );
}
