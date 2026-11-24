'use client';
import { useFormStatus } from 'react-dom';
/* Knopf eines Formulars: zeigt, dass gespeichert wird, und lässt sich in der Zeit nicht nochmals antippen. */
export default function SubmitButton({ children, busy = 'Moment …', className = '' }) {
  const { pending } = useFormStatus();
  return <button className={className} disabled={pending} aria-busy={pending}>{pending ? busy : children}</button>;
}
