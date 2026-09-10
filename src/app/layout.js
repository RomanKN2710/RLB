import './globals.css';
import Link from 'next/link';
import { getUser } from '@/lib/auth';
import { logoutAction } from '@/actions';
import { maybeSync } from '@/lib/oldb';
import { openRound } from '@/lib/data';
import { fmtDt } from '@/components/ui';

export const metadata = { title: 'RLB Managerspiel 26/27', description: 'Rotissery League Bundesliga' };
export const dynamic = 'force-dynamic';

export default async function RootLayout({ children }) {
  const user = await getUser();
  let open = null;
  if (user) { await maybeSync(60); open = await openRound(); }
  return (
    <html lang="de"><head><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&display=swap" /></head>
      <body>
        <header>
          <div className="bar">
            <div className="brand"><h1>RLB Managerspiel</h1><small>Rotissery League Bundesliga · Saison 2026/27</small></div>
            <div className="grow" />
            {open && <span className="mini">Offen: <b>{open.label}</b> · Deadline {fmtDt(open.deadline)}</span>}
            {user && <span className="small">{user.name}{user.manager_name ? ` · ${user.manager_name}` : ''}{user.role === 'admin' ? ' · Admin' : ''}</span>}
            {user && <form action={logoutAction}><button className="sec sm">Abmelden</button></form>}
          </div>
          {user && <nav>
            <Link href="/">Tabelle</Link>
            <Link href="/aufstellung">Aufstellung</Link>
            <Link href="/markt">Transfermarkt</Link>
            <Link href="/kader">Kader &amp; Trades</Link>
            <Link href="/statistik">Statistik</Link>
            <Link href="/abrechnung">Abrechnung</Link>
            <Link href="/regeln">Regeln</Link>
            <Link href="/konto">Konto</Link>
            {user.role === 'admin' && <Link href="/admin">Admin</Link>}
          </nav>}
        </header>
        <main>{children}</main>
      </body></html>
  );
}
