'use client';
import useFormState from '@/components/useFormAction';   // behält die Eingaben, auch wenn die Aktion einen Fehler meldet
import { changePasswordAction } from '@/actions';
import { Msg } from '@/components/ui';
import SubmitButton from '@/components/SubmitButton';

export default function PasswordForm() {
  const [state, action, pending] = useFormState(changePasswordAction, null);
  return (
    <form onSubmit={action} className="stack">
      <label>Aktuelles Passwort<br /><input type="password" name="current" required autoComplete="current-password" /></label>
      <label>Neues Passwort (min. 8 Zeichen)<br /><input type="password" name="password" minLength={8} required autoComplete="new-password" /></label>
      <label>Wiederholen<br /><input type="password" name="password2" minLength={8} required autoComplete="new-password" /></label>
      <Msg state={state} />
      <div><SubmitButton pending={pending} busy="Speichert …">Speichern</SubmitButton></div>
    </form>
  );
}
