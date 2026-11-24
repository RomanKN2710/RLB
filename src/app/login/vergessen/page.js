import Link from 'next/link';
import { mailReady } from '@/lib/mail';
import ResetRequestForm from './ResetRequestForm';
export const dynamic = 'force-dynamic';
/* Passwort vergessen: Link per Mail (wenn der Mailversand eingerichtet ist), sonst der Weg über einen Admin. */
export default function Vergessen() {
  return (<div className="card login"><div className="eyebrow">Passwort vergessen</div><h2>Neues Passwort setzen</h2>
    {mailReady() ? <ResetRequestForm /> : <p className="small">Bitte einen Admin um ein neues Startpasswort bitten. Du ersetzt es beim nächsten Anmelden durch ein eigenes.</p>}
    <p className="mini"><Link href="/login">Zurück zur Anmeldung</Link></p></div>);
}
