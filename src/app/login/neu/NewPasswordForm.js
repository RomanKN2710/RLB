'use client';
import useFormState from '@/components/useFormAction';   // behält die Eingaben, auch wenn die Aktion einen Fehler meldet
import { resetWithTokenAction } from '@/actions';
import { Msg } from '@/components/ui';
import SubmitButton from '@/components/SubmitButton';
export default function NewPasswordForm({ token }) {
  const [state, action, pending] = useFormState(resetWithTokenAction, null);
  if (state?.ok) return <div className="okmsg">{state.msg} <a href="/login">Jetzt anmelden</a></div>;
  return (<form onSubmit={action} className="stack">
    <input type="hidden" name="token" value={token} />
    <label>Neues Passwort (min. 8 Zeichen)<br /><input type="password" name="password" minLength={8} required autoComplete="new-password" style={{ width: '100%' }} /></label>
    <label>Wiederholen<br /><input type="password" name="password2" minLength={8} required autoComplete="new-password" style={{ width: '100%' }} /></label>
    <Msg state={state} />
    <SubmitButton pending={pending} busy="Speichert …">Passwort setzen</SubmitButton></form>);
}
