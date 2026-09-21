'use client';
import { useState, useTransition } from 'react';
import { removePositionAction, addPositionAction, setContractAction, setJugendAction, releasePlayerAction, abgangPlayerAction, editPlayerAction, setKickerSlugAction } from '@/actions';

export default function AdminPlayerTools({ player: p }) {
  const [msg, setMsg] = useState(null); const [pending, start] = useTransition(); const [arm, setArm] = useState(null);
  const run = fn => start(async () => { const r = await fn(); setMsg(r.msg); setArm(null); });
  const missing = ['T', 'V', 'M', 'S'].filter(x => x !== p.base_pos && !(p.extra_pos || []).includes(x));
  const nextContract = { null: '1J', '1J': '2J', '2J': null }[String(p.contract)];
  return (<span className="row" style={{ gap: 4 }}>
    {missing.map(x => <button key={x} className="sm sec" title={`Zusatzposition ${x} (Ziff. 5.2)`} disabled={pending} onClick={() => run(() => addPositionAction(p.id, x))}>+{x}</button>)}
    {(p.extra_pos || []).map(x => <button key={'r' + x} className="sm sec" title={`Zusatzposition ${x} entfernen`} disabled={pending} onClick={() => run(() => removePositionAction(p.id, x))}>−{x}</button>)}
    <button className="sm sec" title="Vertrag umschalten" disabled={pending} onClick={() => run(() => setContractAction(p.id, nextContract))}>V:{p.contract || '–'}</button>
    <button className="sm sec" title="Jugendstatus" disabled={pending} onClick={() => run(() => setJugendAction(p.id, !p.jugend))}>J:{p.jugend ? 'ja' : 'nein'}</button>
    {arm === 'rel' ? <button className="sm danger" onClick={() => run(() => releasePlayerAction(p.id))}>{p.name} entlassen?</button> : <button className="sm sec" onClick={() => setArm('rel')}>Entl.</button>}
    {arm === 'abg' ? <button className="sm danger" onClick={() => run(() => abgangPlayerAction(p.id))}>Abgang, {p.price} gutschreiben?</button> : <button className="sm sec" title="Verlässt die Bundesliga: Wert wird dem Kaufbudget gutgeschrieben (7.4)" onClick={() => setArm('abg')}>Abg.</button>}
    <button className="sm sec" title="Name (kicker-Schreibweise) oder Verein korrigieren" disabled={pending} onClick={() => { const nm = window.prompt('Name (wie bei kicker geschrieben):', p.name); if (nm === null) return; const cl = window.prompt('Verein (Kurzname wie in der App, z. B. Augsburg):', p.club); if (cl === null) return; run(() => editPlayerAction(p.id, nm, cl)); }}>Bearb.</button>
    <button className="sm sec" title={p.kicker_slug ? `kicker-Kennung: ${p.kicker_slug}` : 'kicker-Kennung festlegen (aus der kicker-Adresse des Spielers, z. B. said-el-mala)'} disabled={pending} onClick={() => { const v = window.prompt('kicker-Kennung (Teil der kicker-Adresse vor /spieler/, z. B. said-el-mala). Leer = automatisch beim nächsten Import:', p.kicker_slug || ''); if (v === null) return; run(() => setKickerSlugAction(p.id, v)); }}>k:{p.kicker_slug ? '✓' : '–'}</button>
    {msg && <span className="mini">{msg}</span>}
  </span>);
}
