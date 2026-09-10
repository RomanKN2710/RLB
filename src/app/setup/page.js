import { redirect } from 'next/navigation';
import { anyUsers } from '@/lib/auth';
import { schemaReady } from '@/lib/db';

/** Ersteinrichtung: zeigt an, woran es hakt, solange es noch keinen Benutzer gibt. */
export default async function Setup() {
  const ready = await schemaReady();
  if (ready && await anyUsers()) redirect('/login');
  return (
    <div className="card login">
      <h2>Ersteinrichtung</h2>
      {!ready
        ? <p className="small">Die Datenbank ist noch leer – die Tabellen fehlen. Einmal <code>/api/setup?key=CRON_SECRET</code> im Browser aufrufen; das legt das Schema an und importiert Runde 1, den Spielerpool und das Admin-Konto aus <code>ADMIN_EMAIL</code>/<code>ADMIN_PASSWORD</code>.</p>
        : <p className="small">Das Schema steht, aber es gibt noch kein Benutzerkonto. <code>ADMIN_EMAIL</code> und <code>ADMIN_PASSWORD</code> im Projekt setzen, dann <code>/api/setup?key=CRON_SECRET&amp;admin=reset</code> aufrufen.</p>}
      <p className="mini">Der Schlüssel ist der Wert von <code>CRON_SECRET</code> aus den Environment Variables.</p>
    </div>
  );
}
