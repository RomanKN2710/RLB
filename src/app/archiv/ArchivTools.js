'use client';
import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { blogImportAction, blogMetaAction, blogDeleteAction } from '@/actions';
import { Msg } from '@/components/ui';

/* Blog-Text einspielen: Copy-Paste aus dem Blog (Titel, Text, «Eingestellt von … um HH:MM») oder Textexport. */
export function BlogImport() { const [state, action] = useFormState(blogImportAction, null); const [open, setOpen] = useState(false);
  if (!open) return <p><button className="sm sec" onClick={() => setOpen(true)}>Blog-Einträge einfügen…</button></p>;
  return <form action={action} className="stack" style={{ marginTop: 8 }}><div className="eyebrow">Blog-Einträge einspielen</div>
    <textarea name="text" rows={10} placeholder={'Blog markieren, kopieren, hier einfügen. Erkannt werden Blogger-Posts (Titel, Text, «Eingestellt von Markadona um 15:39») mit Datumszeilen sowie der Textexport (### Titel / Datum: … | Autor: …).'} />
    <div className="row"><label className="mini">Datum, falls im Text keine Datumszeilen stehen: <input type="date" name="date" /></label><button className="sm">Einspielen</button><button type="button" className="sm sec" onClick={() => setOpen(false)}>Schliessen</button></div>
    <Msg state={state} /><p className="mini">Bereits gespeicherte Einträge werden erkannt und nicht doppelt angelegt. Art, Manager und Runde werden automatisch bestimmt und können pro Eintrag korrigiert werden.</p></form>; }

export function PostMeta({ post, managers, rounds, kinds }) { const [pending, start] = useTransition(); const [msg, setMsg] = useState(null); const [arm, setArm] = useState(false);
  const [kind, setKind] = useState(post.kind); const [mid, setMid] = useState(post.manager_id || ''); const [rn, setRn] = useState(post.round_number || '');
  return <div className="row mini" style={{ marginTop: 6, gap: 4 }}><select value={kind} onChange={e => setKind(e.target.value)}>{Object.entries(kinds).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
    <select value={mid} onChange={e => setMid(e.target.value)}><option value="">– Manager –</option>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
    <select value={rn} onChange={e => setRn(e.target.value)}><option value="">– Runde –</option>{rounds.map(r => <option key={r.number} value={r.number}>{r.label}</option>)}</select>
    <button className="sm sec" disabled={pending} onClick={() => start(async () => setMsg(await blogMetaAction(post.id, kind, mid, rn)))}>Speichern</button>
    {arm ? <button className="sm danger" disabled={pending} onClick={() => start(async () => setMsg(await blogDeleteAction(post.id)))}>Wirklich löschen</button> : <button className="sm sec" onClick={() => setArm(true)}>Löschen</button>}
    {msg && <span>{msg.msg}</span>}</div>; }
