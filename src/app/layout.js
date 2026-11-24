import './globals.css';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { logoutAction } from '@/actions';
import { maybeSync } from '@/lib/oldb';
import { waitUntil } from '@vercel/functions';
import { openRound } from '@/lib/data';
import { fmtDt } from '@/components/ui';
import RlbLogo from '@/components/RlbLogo';
import Nav from '@/components/Nav';

export const metadata = { title: 'RLB Managerspiel 26/27', description: 'Rotissery League Bundesliga' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  const user = await getUser();
  let open = null;
  // Spielplan-Sync im Hintergrund: die Seite wartet nicht darauf (ein hängender Dienst hält sonst jede Seite auf)
  if (user) { try { waitUntil(maybeSync(60)); } catch { /* ausserhalb von Vercel: ohne Hintergrundlauf */ maybeSync(60).catch(() => {}); } open = await openRound(); }
  return (
    <html lang="de"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" /></head>
      <body>
        <header>
          <div className="bar">
            <div className="brand"><RlbLogo height={38} wordmark={false} /><div><h1>RLB Managerspiel</h1><small>Rotissery League Bundesliga · Saison 2026/27</small></div></div>
            <div className="grow" />
            {open && <span className="mini">Offen: <b>{open.label}</b> · Deadline {fmtDt(open.deadline)}</span>}
            {user && <span className="small user-line">{user.name}{user.manager_name && user.manager_name !== user.name ? ` · ${user.manager_name}` : ''}{user.role === 'admin' ? ' · Admin' : ''}</span>}
            {user && <form action={logoutAction}><button className="sec sm">Abmelden</button></form>}
          </div>
          {user && <Nav admin={user.role === 'admin'} />}
        </header>
        <main>{children}</main>
      </body></html>
  );
}
