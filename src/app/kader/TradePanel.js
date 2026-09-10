'use client';
import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { proposeTradeAction, respondTradeAction, vetoTradeAction, revertTradeAction } from '@/actions';
import { Msg } from '@/components/ui';

export function Propose({ me, managers, players, fee }) {
  const [state, action] = useFormState(proposeTradeAction, null);
  const [to, setTo] = useState(managers[0]?.id || 0);
  return (<details><summary>Trade vorschlagen (je CHF {fee}, Ziff. 6)</summary>
    <form action={action} className="stack" style={{ marginTop: 8 }}>
      <label className="mini">Partner <select name="to" value={to} onChange={e => setTo(Number(e.target.value))}>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <div className="grid2"><label className="mini">Ich gebe (Mehrfachauswahl mit Ctrl/Cmd)<br /><select name="give" multiple size={6} style={{ width: '100%' }}>{players.filter(p => p.manager_id === me).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label>
        <label className="mini">Ich erhalte<br /><select name="get" multiple size={6} style={{ width: '100%' }}>{players.filter(p => p.manager_id === to).map(p => <option key={p.id} value={p.id}>{p.label}</option>)}</select></label></div>
      <Msg state={state} />
      <div className="row"><button>Vorschlag senden</button><span className="mini">Gleich viele Spieler auf beiden Seiten. Nach Annahme sofort vollzogen; Unbeteiligte haben ein Veto, bei Mehrheit macht der Admin den Trade rückgängig.</span></div>
    </form></details>);
}
export function Actions({ trade, me, admin }) {
  const [msg, setMsg] = useState(null); const [pending, start] = useTransition(); const [arm, setArm] = useState(false);
  const run = fn => start(async () => setMsg(await fn()));
  const t = trade; const involved = me === t.from || me === t.to;
  return (<span className="row">
    {t.status === 'proposed' && (me === t.to || admin) && <button className="sm" disabled={pending} onClick={() => run(() => respondTradeAction(t.id, true))}>Annehmen</button>}
    {t.status === 'proposed' && (involved || admin) && <button className="sm sec" disabled={pending} onClick={() => run(() => respondTradeAction(t.id, false))}>{me === t.from ? 'Zurückziehen' : 'Ablehnen'}</button>}
    {t.status === 'done' && me && !involved && (t.vetos.includes(me) ? <button className="sm sec" onClick={() => run(() => vetoTradeAction(t.id, false))}>Veto zurück</button> : <button className="sm sec" onClick={() => run(() => vetoTradeAction(t.id, true))}>Veto</button>)}
    {t.status === 'done' && admin && (arm ? <button className="sm danger" onClick={() => run(() => revertTradeAction(t.id))}>Wirklich rückgängig?</button> : <button className="sm sec" onClick={() => setArm(true)}>Rückgängig</button>)}
    {msg && <span className={`mini ${msg.ok ? '' : 'delta down'}`}>{msg.msg}</span>}
  </span>);
}
