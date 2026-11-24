import Link from 'next/link';
import NewPasswordForm from './NewPasswordForm';
export const dynamic = 'force-dynamic';
/* Neues Passwort über den Link aus der Mail (/login/neu?token=…) */
export default function Neu({ searchParams }) {
  const token = String(searchParams?.token || '');
  return (<div className="card login"><div className="eyebrow">Passwort vergessen</div><h2>Neues Passwort</h2>
    {token ? <NewPasswordForm token={token} /> : <p className="small">Der Link ist unvollständig. Bitte den Link aus der Mail ganz kopieren oder einen neuen anfordern.</p>}
    <p className="mini"><Link href="/login/vergessen">Neuen Link anfordern</Link> · <Link href="/login">Zur Anmeldung</Link></p></div>);
}
