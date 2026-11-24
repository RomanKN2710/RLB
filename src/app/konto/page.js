import { requireUser } from '@/lib/auth';
import PasswordForm from './PasswordForm';
import MailPref from './MailPref';
import { one } from '@/lib/db';
import { mailReady } from '@/lib/mail';

export default async function Konto(props) {
  const searchParams = await props.searchParams;   // Next 15: asynchron
  const u = await requireUser();
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div className="eyebrow">Konto</div><h2>{u.name}</h2>
      <div className="kv"><b>E-Mail</b><span>{u.email}</span><b>Rolle</b><span>{u.role === 'admin' ? 'Admin' : 'Manager'}</span>{u.manager_name && <><b>Team</b><span>{u.manager_name}</span></>}</div>
      {u.must_change_pw && <div className="note" style={{ margin: '10px 0' }}>Bitte zuerst ein eigenes Passwort setzen. Bis dahin ist nur diese Seite erreichbar.</div>}
      <h3 style={{ marginTop: 14 }}>Passwort ändern</h3>
      <PasswordForm />
      <h3 style={{ marginTop: 18 }}>Benachrichtigungen</h3>
      <MailPref on={!((await one('select mail_off from users where id=$1', [u.id])) || {}).mail_off} ready={mailReady()} />
    </div>
  );
}
