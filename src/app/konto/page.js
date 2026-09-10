import { requireUser } from '@/lib/auth';
import PasswordForm from './PasswordForm';

export default async function Konto({ searchParams }) {
  const u = await requireUser();
  return (
    <div className="card" style={{ maxWidth: 480 }}>
      <div className="eyebrow">Konto</div><h2>{u.name}</h2>
      <div className="kv"><b>E-Mail</b><span>{u.email}</span><b>Rolle</b><span>{u.role === 'admin' ? 'Admin' : 'Manager'}</span>{u.manager_name && <><b>Team</b><span>{u.manager_name}</span></>}</div>
      {(searchParams?.first || u.must_change_pw) && <div className="note" style={{ margin: '10px 0' }}>Bitte zuerst ein eigenes Passwort setzen.</div>}
      <h3 style={{ marginTop: 14 }}>Passwort ändern</h3>
      <PasswordForm />
    </div>
  );
}
