'use client';
import { useState, useTransition } from 'react';
import { berichtAction } from '@/actions';

/* Admin: Bericht erneut erstellen oder Mail erneut senden (z. B. nach Korrekturen). */
export function BerichtTools({ roundId, hasText, sent }) { const [msg, setMsg] = useState(null); const [pending, start] = useTransition(); const [arm, setArm] = useState(null);
  const run = (opts) => start(async () => { setMsg(await berichtAction(roundId, opts)); setArm(null); });
  return <div className="row mini" style={{ marginTop: 8, gap: 6 }}>
    {!hasText && <button className="sm komm" disabled={pending} onClick={() => run({})}>{pending ? 'läuft…' : 'Bericht erstellen und senden'}</button>}
    {hasText && (arm === 'neu' ? <button className="sm danger" disabled={pending} onClick={() => run({ force: true })}>Wirklich neu schreiben und erneut mailen?</button> : <button className="sm sec" disabled={pending} onClick={() => setArm('neu')}>Neu schreiben…</button>)}
    {hasText && (arm === 'mail' ? <button className="sm danger" disabled={pending} onClick={() => run({ resend: true })}>Mail wirklich nochmals an alle senden?</button> : <button className="sm sec" disabled={pending} onClick={() => setArm('mail')}>{sent ? 'Mail erneut senden…' : 'Mail senden…'}</button>)}
    {msg && <span className={msg.ok ? '' : 'delta down'}>{msg.msg}</span>}</div>; }
