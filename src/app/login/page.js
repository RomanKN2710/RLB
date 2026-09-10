'use client';
import { useFormState } from 'react-dom';
import { loginAction } from '@/actions';
import { Msg } from '@/components/ui';

export default function Login() {
  const [state, action] = useFormState(loginAction, null);
  return (
    <div className="card login">
      <div className="eyebrow">Anmelden</div><h2>RLB Managerspiel</h2>
      <form action={action} className="stack">
        <label>E-Mail<br /><input type="email" name="email" required autoComplete="username" style={{ width: '100%' }} /></label>
        <label>Passwort<br /><input type="password" name="password" required autoComplete="current-password" style={{ width: '100%' }} /></label>
        <Msg state={state} />
        <button>Anmelden</button>
      </form>
      <p className="mini">Konten werden vom Admin angelegt. Passwort vergessen: Admin setzt ein neues Startpasswort.</p>
    </div>
  );
}
