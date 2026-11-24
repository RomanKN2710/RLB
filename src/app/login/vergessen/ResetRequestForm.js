'use client';
import useFormState from '@/components/useFormAction';   // behält die Eingaben, auch wenn die Aktion einen Fehler meldet
import { requestResetAction } from '@/actions';
import { Msg } from '@/components/ui';
import SubmitButton from '@/components/SubmitButton';
export default function ResetRequestForm() {
  const [state, action, pending] = useFormState(requestResetAction, null);
  return (<form onSubmit={action} className="stack">
    <label>E-Mail deines Kontos<br /><input type="email" name="email" required autoComplete="username" style={{ width: '100%' }} /></label>
    <Msg state={state} />
    <SubmitButton pending={pending} busy="Sendet …">Link zusenden</SubmitButton>
    <p className="mini">Du bekommst eine Mail mit einem Link, der eine Stunde gilt.</p></form>);
}
