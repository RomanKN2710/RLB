'use client';
import { useFormState } from 'react-dom';
import { changePasswordAction } from '@/actions';
import { Msg } from '@/components/ui';

export default function PasswordForm() {
  const [state, action] = useFormState(changePasswordAction, null);
  return (
    <form action={action} className="stack">
      <label>Neues Passwort (min. 8 Zeichen)<br /><input type="password" name="password" minLength={8} required autoComplete="new-password" /></label>
      <label>Wiederholen<br /><input type="password" name="password2" minLength={8} required autoComplete="new-password" /></label>
      <Msg state={state} />
      <div><button>Speichern</button></div>
    </form>
  );
}
