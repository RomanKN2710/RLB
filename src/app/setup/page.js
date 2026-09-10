import { redirect } from 'next/navigation';
import { anyUsers } from '@/lib/auth';
/** Ersteinrichtung: Wenn noch kein Benutzer existiert, Hinweis auf npm run db:seed. */
export default async function Setup() { if (await anyUsers()) redirect('/login'); return <div className="card login"><h2>Ersteinrichtung</h2><p className="small">Noch kein Benutzer vorhanden. Bitte lokal <code>npm run db:migrate</code> und <code>npm run db:seed</code> ausführen (legt Admin aus ADMIN_EMAIL/ADMIN_PASSWORD an und importiert Runde 1).</p></div>; }
