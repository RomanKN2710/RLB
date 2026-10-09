'use client';
export default function Error({ error, reset }) {
  return <div className="card"><div className="eyebrow">Fehler</div><h2>Da ist etwas schiefgelaufen</h2>
    <p className="mini">Die Seite konnte nicht geladen werden. Meist hilft ein zweiter Versuch (die Datenbank wacht nach einer Pause erst auf).</p>
    {error?.digest && <p className="mini">Fehlercode: {error.digest}</p>}
    <div className="row"><button onClick={() => reset()}>Nochmals versuchen</button><a className="btn sec" href="/">Zur Tabelle</a></div></div>;
}
