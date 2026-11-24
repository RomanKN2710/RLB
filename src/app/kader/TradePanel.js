'use client';
import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { proposeTradeAction, respondTradeAction, vetoTradeAction, revertTradeAction } from '@/actions';
import { Msg } from '@/components/ui';
import SubmitButton from '@/components/SubmitButton';

export function Propose({ me, managers, players, fee }) {
  const [state, action] = useFormState(proposeTradeAction, null);
  const [to, setTo] = useState(managers[0]?.id || 0);
  return (<details><summary>Trade vorschlagen (je CHF {fee}, Ziff. 6)</summary>
    <form action={action} className="stack" style={{ marginTop: 8 }}>
      <label className="mini">Partner <select name="to" value={to} onChange={e => setTo(Number(e.target.value))}>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label>
      <div className="grid2"><fieldset className="checklist"><legend className="mini">Ich gebe</legend>{players.filter(p => p.manager_id === me).map(p => <label key={p.id} className="small"><input type="checkbox" name="give" value={p.id} /> {p.label}</label>)}</fieldset>
        <fieldset className="checklist" key={to}><legend className="mini">Ich erhalte</legend>{players.filter(p => p.manager_id === to).map(p => <label key={p.id} className="small"><input type="checkbox" name="get" value={p.id} /> {p.label}</label>)}</fieldset></div>
      <Msg state={state} />
      <div className="row"><SubmitButton busy="Sendet …">Vorschlag senden</SubmitButton><span className="mini">Gleich viele Spieler auf beiden Seiten. Nach Annahme sofort vollzogen; Unbeteiligte haben ein Veto, bei Mehrheit macht der Admin den Trade rückgängig.</span></div>
    </form></details>);
}
export function Actions({ trade, me, admin }) {
  const [msg, setMsg] = useState(null); const [pending, start] = useTransition(); const [arm, setArm] = useState(false); const [armAccept, setArmAccept] = useState(false);
  const run = fn => start(async () => setMsg(await fn()));
  const t = trade; const involved = me === t.from || me === t.to;
  return (<span className="row">
    {t.status === 'proposed' && (me === t.to || admin) && (armAccept ? <button className="sm danger" disabled={pending} onClick={() => run(() => respondTradeAction(t.id, true))}>{pending ? 'bucht …' : 'Wirklich annehmen? (je CHF 5)'}</button> : <button className="sm" disabled={pending} onClick={() => setArmAccept(true)}>Annehmen</button>)}
    {t.status === 'proposed' && (involved || admin) && <button className="sm sec" disabled={pending} onClick={() => run(() => respondTradeAction(t.id, false))}>{me === t.from ? 'Zurückziehen' : 'Ablehnen'}</button>}
    {t.status === 'done' && me && !involved && (t.vetos.includes(me) ? <button className="sm sec" onClick={() => run(() => vetoTradeAction(t.id, false))}>Veto zurück</button> : <button className="sm sec" onClick={() => run(() => vetoTradeAction(t.id, true))}>Veto</button>)}
    {t.status === 'done' && admin && (arm ? <button className="sm danger" disabled={pending} onClick={() => run(() => revertTradeAction(t.id))}>Wirklich rückgängig?</button> : <button className="sm sec" onClick={() => setArm(true)}>Rückgängig</button>)}
    {msg && <span className={`mini ${msg.ok ? '' : 'delta down'}`}>{msg.msg}</span>}
  </span>);
}
