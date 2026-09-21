'use client';
import { useState, useTransition } from 'react';
import { berichtAction } from '@/actions';

/* Admin: Bericht erstellen oder neu schreiben lassen (z. B. nach Korrekturen). */
export function BerichtTools({ roundId, hasText }) { const [msg, setMsg] = useState(null); const [pending, start] = useTransition(); const [arm, setArm] = useState(null);
  const run = (opts) => start(async () => { setMsg(await berichtAction(roundId, opts)); setArm(null); });
  return <div className="row mini" style={{ marginTop: 8, gap: 6 }}>
    {!hasText && <button className="sm komm" disabled={pending} onClick={() => run({})}>{pending ? 'schreibt…' : 'Bericht erstellen'}</button>}
    {hasText && (arm === 'neu' ? <button className="sm danger" disabled={pending} onClick={() => run({ force: true })}>{pending ? 'schreibt…' : 'Wirklich neu schreiben?'}</button> : <button className="sm sec" disabled={pending} onClick={() => setArm('neu')}>Neu schreiben…</button>)}
    {msg && <span className={msg.ok ? '' : 'delta down'}>{msg.msg}</span>}</div>; }
