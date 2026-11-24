'use client';
import { useFormStatus } from 'react-dom';
/* Knopf eines Formulars: zeigt, dass gespeichert wird, und lässt sich in der Zeit nicht nochmals antippen. */
export default function SubmitButton({ children, busy = 'Moment …', className = '', pending: p }) {
  const st = useFormStatus(); const pending = p ?? st.pending;   // p: vom Formular-Haken, sonst der Stand eines Formulars mit action
  return <button className={className} disabled={pending} aria-busy={pending}>{pending ? busy : children}</button>;
}
