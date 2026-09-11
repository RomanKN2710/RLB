'use client';
import { useState, useTransition } from 'react';
import { importKickerAction, importKickerHtmlAction, unlockResultsAction, importGoalsAction, setDeadlineAction, roundInfoAction, finalizeRoundAction, addCorrectionAction, deleteCorrectionAction, previewBidsAction, applyBidsAction, saveResultsAction } from '@/actions';
import { CATS } from '@/lib/rules';

function useRun() { const [msg, setMsg] = useState(null); const [pending, start] = useTransition(); return { msg, pending, run: fn => start(async () => setMsg(await fn())) }; }
function zurichToIso(local) { const g = new Date(local + ':00Z'); const shown = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(g).replace(' ', 'T'); const off = new Date(shown + ':00Z') - g; return new Date(g - off).toISOString(); }
const M = ({ msg }) => msg ? <span className={`mini ${msg.ok ? '' : 'delta down'}`}>{msg.msg}</span> : null;

/* Eingefuegtes kicker-HTML im Browser ausduennen, bevor es zum Server geht. Der Parser
   liest nur gerenderte Elemente (Aufstellungszeilen, Ticker, Spielerlinks); script-,
   style- und svg-Bloecke machen bei kicker aber den groessten Teil der Seite aus. Ohne
   das reisst die Nutzlast die Grenze der Server-Action, und der Abbruch ist im Browser
   nur ein Verbindungsfehler ohne Meldung. */
/* Mehrere hintereinander eingefügte Seiten trennen. kicker-Quelltexte beginnen mit
   <!doctype html> beziehungsweise <html …>; daran wird geschnitten. Ein einzelner Text
   ohne solche Marke bleibt ein Stück. */
function splitPages(text) {
  if (!text || !text.trim()) return [];
  // Eine Seite beginnt mit <!doctype html> UND enthaelt gleich darauf <html …>. Wuerde an
  // beidem geschnitten, ergaeben neun Seiten achtzehn Stuecke. Darum die Doctype-Marken
  // bevorzugen und nur auf <html> zurueckfallen, wenn es keine gibt.
  const finde = re => { const out = []; let m; const r = new RegExp(re, 'gi'); while ((m = r.exec(text)) !== null) out.push(m.index); return out; };
  const doctype = finde('<!doctype\\s+html');
  const marks = (doctype.length ? doctype : finde('<html[\\s>]')).filter((x, i, a) => i === 0 || x - a[i - 1] > 200);
  if (marks.length < 2) return [text];
  return marks.map((start, i) => text.slice(start, marks[i + 1] ?? text.length)).filter(x => x.trim());
}

function slimHtml(html) {
  if (!html || !html.trim()) return '';
  try {
    const d = new DOMParser().parseFromString(html, 'text/html');
    d.querySelectorAll('script, style, noscript, svg, link, iframe, picture source, template').forEach(el => el.remove());
    const walker = d.createTreeWalker(d, NodeFilter.SHOW_COMMENT);
    const junk = []; while (walker.nextNode()) junk.push(walker.currentNode);
    junk.forEach(n => n.remove());
    const out = d.body ? d.body.innerHTML : '';
    return out.length && out.length < html.length ? out : html;
  } catch { return html; }
}

export function Header({ round, managers, corrections }) {
  const { msg, pending, run } = useRun();
  const [dl, setDl] = useState(round.deadlineLocal); const [tdr, setTdr] = useState(round.tdr.join(', ')); const [sdt, setSdt] = useState(round.sdt); const [label, setLabel] = useState(round.label);
  const [km, setKm] = useState(managers[0]?.id); const [kt, setKt] = useState(''); const [kd, setKd] = useState({}); const [arm, setArm] = useState(false);
  return (<div className="stack" style={{ marginTop: 8 }}>
    <div className="row"><label className="mini">Deadline (Europa/Zürich) <input type="datetime-local" value={dl} onChange={e => setDl(e.target.value)} /></label><button className="sm sec" disabled={pending} onClick={() => run(() => setDeadlineAction(round.id, dl ? zurichToIso(dl) : ''))}>Manuell setzen</button><button className="sm sec" disabled={pending} onClick={() => run(() => setDeadlineAction(round.id, ''))}>Aus Spielplan</button>
      <label className="mini">Bezeichnung <input value={label} onChange={e => setLabel(e.target.value)} /></label></div>
    <div className="row"><label className="mini" style={{ flex: 1 }}>Team der Runde (11 Namen, Komma) <input style={{ width: '100%' }} value={tdr} onChange={e => setTdr(e.target.value)} /></label><label className="mini">Spieler des Tages <input value={sdt} onChange={e => setSdt(e.target.value)} /></label><button className="sm komm" disabled={pending} onClick={() => run(() => roundInfoAction(round.id, tdr.split(',').map(s => s.trim()).filter(Boolean), sdt, label))}>Speichern</button></div>
    <div><div className="eyebrow">Korrekturen</div><ul className="clean small">{corrections.map(k => <li key={k.id}>{k.manager}: {k.text} <span className="mini">{CATS.filter(([c]) => k.delta[c]).map(([c, l]) => `${l} ${k.delta[c] > 0 ? '+' : ''}${k.delta[c]}`).join(', ')}</span> <button className="sm sec" onClick={() => run(() => deleteCorrectionAction(k.id))}>×</button></li>)}</ul>
      <div className="row" style={{ marginTop: 6 }}><select value={km} onChange={e => setKm(Number(e.target.value))}>{managers.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}</select><input placeholder="Text" value={kt} onChange={e => setKt(e.target.value)} style={{ minWidth: 220 }} />{CATS.map(([c, l]) => <label key={c} className="mini">{l} <input type="number" style={{ width: 48 }} value={kd[c] || 0} onChange={e => setKd({ ...kd, [c]: Number(e.target.value) })} /></label>)}<button className="sm sec" disabled={pending} onClick={() => run(() => addCorrectionAction(round.id, km, kt, kd))}>Korrektur buchen</button></div></div>
    <div className="row">{round.status === 'final' ? <button className="sm sec" onClick={() => run(() => finalizeRoundAction(round.id, false))}>Runde wieder öffnen</button> : arm ? <button className="sm danger" onClick={() => run(() => finalizeRoundAction(round.id, true))}>Wirklich abschliessen?</button> : <button className="sm" onClick={() => setArm(true)}>Runde abschliessen (final)</button>}<M msg={msg} /></div>
  </div>);
}

export function Bids({ roundId, resolved, passed }) {
  const { msg, pending, run } = useRun(); const [preview, setPreview] = useState(null);
  return (<div className="stack" style={{ marginTop: 8 }}>
    {resolved ? <span className="pill ok">Gebote aufgelöst und veröffentlicht</span> : <div className="row"><button className="sm sec" disabled={pending} onClick={() => run(async () => { const r = await previewBidsAction(roundId); if (r.ok) setPreview(r.list); return r; })}>Vorschau Auflösung</button>{preview && <button className="sm komm" disabled={pending} onClick={() => run(() => applyBidsAction(roundId))}>Zuteilen &amp; veröffentlichen</button>}{!passed && <span className="mini">Deadline noch nicht vorbei.</span>}<M msg={msg} /></div>}
    {preview && <table><tbody>{preview.map(b => <tr key={b.id}><td className="l">{b.manager_id}</td><td className="l">{b.player_name}</td><td>{b.price}</td><td className="l">{b.status} <span className="mini">{b.reason}</span></td></tr>)}</tbody></table>}
    <p className="mini">Zuteilen bucht Kauf, Entlassung (zählt ab dieser Runde nicht mehr), Vertragspflicht ab 20 und setzt Eventualaufträge in die Aufstellung (gratis). Regelwerk 7.1: Bekanntgabe nach der Runde; technisch jederzeit nach der Deadline möglich.</p>
  </div>);
}

export function Results({ roundId, managerId, managerName, rows: init, totals }) {
  const { msg, pending, run } = useRun(); const [rows, setRows] = useState(init);
  const set = (i, k, v) => setRows(r => r.map((x, j) => j === i ? { ...x, [k]: v } : x));
  const save = () => run(() => saveResultsAction(roundId, managerId, Object.fromEntries(rows.map(r => [r.pid, { start: r.start, assist: r.assist, tore: r.tore, karten: r.karten, tdr: r.tdr }]))));
  return (<div className="card"><div className="row between"><h3>{managerName}</h3><span className="mini">P {totals.punkte} · Sh {totals.shutout} · A {totals.assist} · T {totals.tore} · K {totals.karten} · TdR {totals.tdr} · St {totals.start}</span></div>
    {rows.length ? <div className="tbl"><table><thead><tr><th className="l">Pos</th><th className="l">Spieler</th><th className="l">Einsatz</th><th>A</th><th>T</th><th>K</th><th>TdR</th></tr></thead><tbody>{rows.map((r, i) => <tr key={r.pid}><td className="l muted">{r.pos}{r.kpos && r.kpos !== r.pos && <span className="badge v" title="Position laut kicker-Aufstellung">k:{r.kpos}</span>}</td><td className="l">{r.name}{r.locked && <span className="badge" title="vom Admin geändert, Import überschreibt nicht">gesperrt</span>} <span className="mini">{r.club}{r.clubpts != null ? ` · ${r.clubpts}P${r.cs ? ' zu null' : ''}` : ''}</span></td>
      <td className="l"><select value={r.start} onChange={e => set(i, 'start', Number(e.target.value))}><option value={0}>–</option><option value={1}>Startelf</option><option value={2}>Eingew.</option></select></td>
      {['assist', 'tore', 'karten', 'tdr'].map(k => <td key={k}><input type="number" min={0} max={9} value={r[k]} onChange={e => set(i, k, Number(e.target.value))} style={{ width: 52 }} /></td>)}</tr>)}</tbody></table></div> : <div className="mini">keine Aufstellung</div>}
    <div className="row" style={{ marginTop: 8 }}><button className="sm" disabled={pending || !rows.length} onClick={save}>Speichern</button><M msg={msg} /></div></div>);
}


export function Goals({ roundId }) { const { msg, pending, run } = useRun();
  return <div className="row" style={{ marginTop: 8 }}><button className="sm komm" disabled={pending} onClick={() => run(() => importGoalsAction(roundId))}>Tore aus OpenLigaDB übernehmen</button><span className="mini">Läuft nach der Deadline auch automatisch beim Sync; vom Admin geänderte Tore werden nicht überschrieben.</span><M msg={msg} /></div>; }

export function Kicker({ roundId, lastLog }) { const { msg, pending, run } = useRun(); const [h1, setH1] = useState(''); const [h3, setH3] = useState('');
  return (<div className="stack" style={{ marginTop: 8 }}>
    <div className="row"><button className="komm" disabled={pending} onClick={() => run(() => importKickerAction(roundId))}>kicker importieren (alle Spiele + Elf des Tages)</button><button className="sm sec" disabled={pending} onClick={() => run(() => unlockResultsAction(roundId))}>Admin-Sperren aufheben</button><M msg={msg} /></div>
    {lastLog && <div className="mini">Letzter Import {lastLog.at ? new Date(lastLog.at).toLocaleString('de-CH', { timeZone: 'Europe/Zurich' }) : ''}: {lastLog.log?.join(' · ')}</div>}
    <details><summary>Rückfall: kicker-HTML einfügen (falls der Abruf blockiert ist)</summary>
      <p className="mini">Für jedes Spiel bei kicker die Seite «Aufstellung» öffnen, Quelltext kopieren (Strg+U, Strg+A, Strg+C) und hier <b>alle neun hintereinander</b> in dasselbe Feld einfügen – die Seiten werden automatisch getrennt. Skripte und Stile werden vor dem Senden entfernt, darum passen alle neun zusammen hinein. Die «Elf des Tages» kommt ins zweite Feld.</p>
      <textarea rows={5} placeholder="Quelltexte der Aufstellungsseiten, beliebig viele hintereinander" value={h1} onChange={e => setH1(e.target.value)} style={{ width: '100%' }} />
      <div className="mini">{(() => { const teile = splitPages(h1); if (!teile.length) return 'noch nichts eingefügt'; const mit = teile.filter(x => /kick__lineup__teamrow/.test(x)).length;
        return `${teile.length} Seite(n) erkannt, davon ${mit} mit Aufstellung${mit < teile.length ? ' – die übrigen enthalten keine Aufstellungstabelle' : ''}`; })()}</div>
      <textarea rows={3} placeholder="Elf des Tages (HTML), optional" value={h3} onChange={e => setH3(e.target.value)} style={{ width: '100%' }} />
      <div className="row"><button className="sm komm" disabled={pending} onClick={() => run(async () => {
        const teile = splitPages(h1).map(slimHtml).filter(Boolean), eleven = slimHtml(h3);
        const bytes = [...teile, eleven].reduce((n, x) => n + x.length, 0);
        if (!bytes) return { ok: false, msg: 'Nichts eingefügt' };
        if (bytes > 3.5e6) return { ok: false, msg: `Auch ausgedünnt noch ${(bytes / 1e6).toFixed(1)} MB – bitte in zwei Durchgängen einfügen.` };
        const r = await importKickerHtmlAction(roundId, teile, eleven); if (r.ok) { setH1(''); setH3(''); } return r;
      })}>Aus eingefügtem HTML importieren</button><span className="mini">Es werden nur die Spieler der eingefügten Spiele geschrieben.</span></div></details>
  </div>); }
