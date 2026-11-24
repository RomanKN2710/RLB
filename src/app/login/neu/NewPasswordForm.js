'use client';
import { useFormState } from 'react-dom';
import { resetWithTokenAction } from '@/actions';
import { Msg } from '@/components/ui';
import SubmitButton from '@/components/SubmitButton';
export default function NewPasswordForm({ token }) {
  const [state, action] = useFormState(resetWithTokenAction, null);
  if (state?.ok) return <div className="okmsg">{state.msg} <a href="/login">Jetzt anmelden</a></div>;
  return (<form action={action} className="stack">
    <input type="hidden" name="token" value={token} />
    <label>Neues Passwort (min. 8 Zeichen)<br /><input type="password" name="password" minLength={8} required autoComplete="new-password" style={{ width: '100%' }} /></label>
    <label>Wiederholen<br /><input type="password" name="password2" minLength={8} required autoComplete="new-password" style={{ width: '100%' }} /></label>
    <Msg state={state} />
    <SubmitButton busy="Speichert …">Passwort setzen</SubmitButton></form>);
}
