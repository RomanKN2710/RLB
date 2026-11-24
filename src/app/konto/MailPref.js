'use client';
import { useState, useTransition } from 'react';
import { setMailPrefAction } from '@/actions';
/* Mails der App an- oder abstellen (Erinnerung vor der Deadline, Hinweis nach der Auswertung) */
export default function MailPref({ on, ready }) {
  const [v, setV] = useState(on); const [p, start] = useTransition(); const [msg, setMsg] = useState(null);
  return (<div className="stack" style={{ gap: 4 }}>
    <label className="small"><input type="checkbox" checked={v} disabled={p} onChange={e => { const n = e.target.checked; setV(n); start(async () => setMsg(await setMailPrefAction(n))); }} /> E-Mails von der App erhalten</label>
    <span className="mini">Erinnerung am Tag der Deadline, wenn noch keine Aufstellung gespeichert ist, und ein Hinweis, sobald ein Spieltag ausgewertet ist.{ready ? '' : ' Der Mailversand ist noch nicht eingerichtet; die Einstellung gilt, sobald er läuft.'}</span>
    {msg && <span className={`mini ${msg.ok ? '' : 'delta down'}`}>{msg.msg}</span>}</div>);
}
