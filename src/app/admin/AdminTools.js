'use client';
import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { importKickerInboxMatchdayAction, clearKickerInboxMatchdayAction, korrektur20260915Action, syncAction, syncCurrentAction, splitNachtragAction, createUserAction, resetPasswordAction, deleteUserAction, setVorsaisonAction, manualBuyAction, ledgerAction, poolPasteAction } from '@/actions';
import { Msg } from '@/components/ui';

function useRun() { const [msg, setMsg] = useState(null); const [pending, start] = useTransition(); return { msg, pending, run: fn => start(async () => setMsg(await fn())) }; }

export function Sync() { const { msg, pending, run } = useRun(); return <span className="row"><button className="komm sm" disabled={pending} onClick={() => run(syncAction)}>Ganzen Spielplan laden</button><button className="sec sm" disabled={pending} onClick={() => run(syncCurrentAction)}>Aktuelle Spieltage</button>{msg && <span className={`mini ${msg.ok ? '' : 'delta down'}`}>{msg.msg}</span>}</span>; }
export function Split({ matchId }) { const { msg, pending, run } = useRun(); return <span className="row"><button className="sm sec" disabled={pending} onClick={() => run(() => splitNachtragAction(matchId))}>Als Nachtragsrunde abspalten</button>{msg && <span className="mini">{msg.msg}</span>}</span>; }
export function UserRow({ userId }) { const { msg, pending, run } = useRun(); const [pw, setPw] = useState(''); const [arm, setArm] = useState(false);
  return <span className="row" style={{ gap: 4 }}><input type="text" placeholder="neues Startpasswort" value={pw} onChange={e => setPw(e.target.value)} style={{ width: 150 }} /><button className="sm sec" disabled={pending || pw.length < 8} onClick={() => run(() => resetPasswordAction(userId, pw))}>Setzen</button>{arm ? <button className="sm danger" onClick={() => run(() => deleteUserAction(userId))}>Löschen?</button> : <button className="sm sec" onClick={() => setArm(true)}>×</button>}{msg && <span className="mini">{msg.msg}</span>}</span>; }
export function CreateUser({ managers }) { const [state, action] = useFormState(createUserAction, null);
  return <form action={action} className="stack" style={{ marginTop: 10 }}><div className="eyebrow">Konto anlegen</div><div className="row"><input name="name" placeholder="Name" required /><input name="email" type="email" placeholder="E-Mail" required /><select name="role" defaultValue="manager"><option value="manager">Manager</option><option value="admin">Admin</option></select><select name="manager_id" defaultValue=""><option value="">– Team –</option>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><input name="password" placeholder="Startpasswort (min. 8)" required minLength={8} /><button className="sm">Anlegen</button></div><Msg state={state} /><p className="mini">Der Manager meldet sich mit E-Mail und Startpasswort an und setzt beim ersten Login ein eigenes Passwort.</p></form>; }
export function Vorsaison({ list, managers }) { const { msg, pending, run } = useRun(); const [txt, setTxt] = useState(list.join(', '));
  return <div className="stack"><textarea rows={2} value={txt} onChange={e => setTxt(e.target.value)} placeholder={managers.join(', ')} /><div className="row"><button className="sm sec" disabled={pending} onClick={() => run(() => setVorsaisonAction(txt.split(',').map(s => s.trim()).filter(Boolean)))}>Speichern</button><span className="mini">Schlechtester zuerst, Komma-getrennt. Verfügbar: {managers.join(', ')}</span>{msg && <span className="mini">{msg.msg}</span>}</div></div>; }
export function Manual({ managers, clubs }) { const [s1, a1] = useFormState(manualBuyAction, null); const [s2, a2] = useFormState(ledgerAction, null);
  return <div className="stack"><form action={a1} className="row"><select name="manager_id">{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><input name="name" placeholder="Spielername" required /><select name="pos"><option>T</option><option>V</option><option>M</option><option>S</option></select><select name="club">{clubs.map(c => <option key={c}>{c}</option>)}</select><label className="mini">CHF <input type="number" name="price" defaultValue={5} /></label><label className="mini">ab Runde-Nr. <input type="number" name="valid_from" placeholder="offene" /></label><button className="sm sec">Kauf buchen</button><Msg state={s1} /></form>
    <form action={a2} className="row"><select name="manager_id">{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><select name="type"><option value="gutschrift">Gutschrift Kaufbudget (7.4)</option><option value="vertragsaufloesung">Vertragsauflösung 20 (4.3.3)</option><option value="sonstiges">Sonstige Auslage</option><option value="draft">Draft-Kosten (Korrektur, 4.3.1)</option></select><label className="mini">CHF <input type="number" name="amount" step="0.5" required /></label><input name="text" placeholder="Text" style={{ minWidth: 200 }} /><button className="sm sec">Buchen</button><Msg state={s2} /></form></div>; }


export function PoolPaste() { const [s, a] = useFormState(poolPasteAction, null);
  return <div className="adminbox"><h3>Spielerpool ergänzen</h3><p className="mini">Eine Zeile pro Spieler: <code>Name; Verein; Position</code> (Verein und Position optional). Der Pool füllt sich sonst automatisch aus den kicker-Aufstellungen.</p>
    <form action={a} className="stack"><textarea name="text" rows={5} placeholder={'Nwaneri; Dortmund; M\nDoué; Leverkusen; V'} /><div className="row"><button className="sm sec">In Pool übernehmen</button><Msg state={s} /></div></form></div>; }

/* Einmalige Datenkorrektur vom 15.09.2026 (Abgleich Excel/kicker): Namen, Ibrahimovic-Verein, Kaeufe/Entlassungen Spieltag 3, Arbis Elf, fehlende Werte Spieltag 2/3 */
export function Korrektur({ done }) { const { msg, pending, run } = useRun(); const [arm, setArm] = useState(false);
  if (done) return <span className="mini">Eingespielt am {new Date(done.at).toLocaleString('de-CH', { timeZone: 'Europe/Zurich' })}: {done.log.length} Schritte. <details><summary className="mini">Protokoll</summary><ul className="mini" style={{ paddingLeft: 18 }}>{done.log.map((l, i) => <li key={i}>{l}</li>)}</ul></details></span>;
  return <span className="row">{arm ? <button className="komm sm" disabled={pending} onClick={() => run(korrektur20260915Action)}>Jetzt einspielen (einmalig)</button> : <button className="sec sm" onClick={() => setArm(true)}>Korrektur vom 15.09.2026 einspielen…</button>}{msg && <span className={`mini ${msg.ok ? '' : 'delta down'}`}>{msg.msg}</span>}</span>; }

/* kicker-Eingang vom Handy: alle Spieltage mit Stand und Import-Knopf */
export function InboxList({ items }) { const { msg, pending, run } = useRun(); const [unlock, setUnlock] = useState(true);
  if (!items.length) return <p className="mini">Noch keine Seiten empfangen. Vom Handy aus mit dem Lesezeichen-Skript oder Tampermonkey auf jeder kicker-Aufstellungsseite und der Elf des Tages senden – der Spieltag wird automatisch erkannt.</p>;
  return (<div className="stack">
    <label className="mini"><input type="checkbox" checked={unlock} onChange={e => setUnlock(e.target.checked)} /> Sperren der Runde aufheben (Excel-Import und Admin-Änderungen werden durch kicker überschrieben)</label>
    <div className="tbl"><table><thead><tr><th className="l">Spieltag</th><th className="l">Eingang</th><th className="l">Paarungen</th><th className="l">Zuletzt</th><th></th></tr></thead><tbody>
      {items.map(it => <tr key={it.matchday}><td className="l"><b>{it.label || `Spieltag ${it.matchday}`}</b>{it.status && <div className="mini">{it.status}{it.locked ? ` · ${it.locked} gesperrte Zeilen` : ''}</div>}</td>
        <td className="l"><span className={`pill ${it.n >= 9 && it.elf ? 'ok' : 'open'}`}>{it.n}/9 Spiele{it.elf ? ' + Elf des Tages' : ' · Elf des Tages fehlt'}</span></td>
        <td className="l mini">{it.matches.map(m => m.title).join(' · ')}</td>
        <td className="l mini">{it.at ? new Date(it.at).toLocaleString('de-CH', { timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''}</td>
        <td className="l"><span className="row"><button className="sm komm" disabled={pending || !it.hasRound} onClick={() => run(() => importKickerInboxMatchdayAction(it.matchday, unlock))}>Importieren</button><button className="sm sec" disabled={pending} onClick={() => run(() => clearKickerInboxMatchdayAction(it.matchday))}>Leeren</button></span></td></tr>)}
    </tbody></table></div>
    {msg && <div className={`mini ${msg.ok ? '' : 'delta down'}`}>{msg.msg}</div>}
  </div>); }
