'use client';
import { useState, useTransition } from 'react';
import { useFormState } from 'react-dom';
import { syncSquadsAction, squadsJsonAction, abgangPlayerAction } from '@/actions';
import { Msg } from '@/components/ui';

const SNIPPET = `(async()=>{const P={Tor:'T',Abwehr:'V',Mittelfeld:'M',Sturm:'S'};const out={};for(const c of CLUBS){const h=await fetch('/'+c+'/kader/bundesliga/SEASON').then(r=>r.text());const d=new DOMParser().parseFromString(h,'text/html');const l=[];for(const x of d.querySelectorAll('main h2.kick__section-headline--tableheadline')){const pos=P[x.textContent.trim()];const t=x.nextElementSibling;if(!pos||!t||t.tagName!=='TABLE')continue;for(const a of t.querySelectorAll('a[href*="/spieler/"]')){l.push([pos,(a.querySelector('strong')||{}).textContent||'',(a.querySelector('span')||{}).textContent||'',a.getAttribute('href').split('/')[1]])}}out[c]=l}const s=JSON.stringify({date:new Date().toISOString().slice(0,10),squads:out});await navigator.clipboard.writeText(s).catch(()=>{});console.log(s);alert('Kader-JSON kopiert ('+Object.keys(out).length+' Vereine)')})()`;

export function SquadSync({ status, slugs, season }) {
  const [msg, setMsg] = useState(null); const [pending, start] = useTransition();
  const [s, a] = useFormState(squadsJsonAction, null);
  const snippet = SNIPPET.replace('CLUBS', JSON.stringify(slugs)).replace('SEASON', season);
  return (<div className="adminbox"><h3>kicker-Kader (Spielerpool)</h3>
    <p className="mini">Stand: {status ? `${new Date(status.at).toLocaleString('de-CH')} · ${status.players} Spieler in ${status.clubs} Kadern · Quelle ${status.source} · ${status.changes} Änderungen` : 'noch nie geladen'}. Läuft täglich um 03:00 UTC automatisch (Vercel-Cron), sofern kicker den Abruf zulässt.</p>
    <div className="row"><button className="sm komm" disabled={pending} onClick={() => start(async () => setMsg(await syncSquadsAction()))}>Alle 18 Kader jetzt von kicker laden</button>{msg && <span className={'mini ' + (msg.ok ? '' : 'delta down')}>{msg.msg}</span>}</div>
    <details style={{ marginTop: 8 }}><summary>Rückfall: Kader-JSON einfügen (falls kicker den Abruf blockiert)</summary>
      <p className="mini">1. Auf kicker.de eine beliebige Seite öffnen, Browser-Konsole (F12 › Console), den Text unten einfügen und Enter drücken. Das Skript liest alle 18 Kader und kopiert sie als JSON in die Zwischenablage. 2. Hier einfügen und übernehmen.</p>
      <textarea readOnly rows={3} value={snippet} onFocus={e => e.target.select()} style={{ fontFamily: 'monospace', fontSize: 11 }} />
      <form action={a} className="stack" style={{ marginTop: 6 }}><textarea name="json" rows={4} placeholder='{"date":"…","squads":{…}}' /><div className="row"><button className="sm sec">Kader-JSON übernehmen</button><Msg state={s} /></div></form>
    </details></div>);
}

export function Leavers({ items }) {
  const [msg, setMsg] = useState(null); const [pending, start] = useTransition(); const [arm, setArm] = useState(null);
  if (!items.length) return null;
  return (<div className="adminbox"><h3>Abgänge prüfen ({items.length})</h3><p className="mini">Diese RLB-Spieler stehen laut kicker in keinem Bundesliga-Kader mehr. Bei Wechsel ins Ausland: Abgang buchen (Wert wird dem Kaufbudget gutgeschrieben und von den Auslagen abgezogen, Ziff. 7.4). Bei Namensfehler ignorieren.</p>
    <ul className="clean small">{items.map(x => <li key={x.player.id}>{x.player.name} ({x.player.club}, {x.manager}) · seit {new Date(x.since).toLocaleDateString('de-CH')} {arm === x.player.id ? <button className="sm danger" disabled={pending} onClick={() => start(async () => { setMsg(await abgangPlayerAction(x.player.id)); setArm(null); })}>Abgang buchen, {x.player.price} gutschreiben?</button> : <button className="sm sec" onClick={() => setArm(x.player.id)}>Abgang…</button>}</li>)}</ul>
    {msg && <span className="mini">{msg.msg}</span>}</div>);
}
