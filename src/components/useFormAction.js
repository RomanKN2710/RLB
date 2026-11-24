'use client';
import { useState, useTransition } from 'react';

/* Formular mit Server-Aktion, das seine Eingaben behält. React 19 leert ein Formular nach jeder Aktion von selbst,
   auch wenn die Aktion einen Fehler meldet (falsches Passwort, fehlende Angabe): dann müsste alles neu getippt werden.
   Dieser Haken ruft die Aktion selbst auf und lässt die Felder stehen.
   Verwendung:  const [state, onSubmit, pending] = useFormAction(aktion);   <form onSubmit={onSubmit}> … */
export default function useFormAction(action, initial = null) {
  const [state, setState] = useState(initial); const [pending, start] = useTransition();
  const onSubmit = e => { e.preventDefault(); if (pending) return; const fd = new FormData(e.currentTarget); start(async () => { const r = await action(state, fd); if (r !== undefined) setState(r); }); };
  return [state, onSubmit, pending];
}
