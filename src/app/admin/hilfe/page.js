import Link from 'next/link';
import { getUser } from '@/lib/auth';
import * as D from '@/lib/data';
import { fmtDt } from '@/components/ui';
export const dynamic = 'force-dynamic';

/* Hilfe fuer Admins: der Ablauf eines Spieltags als Checkliste, Fehlerbilder mit Loesung und wo was zu finden ist.
   Bewusst kurz – wer neu dazukommt, soll damit einen Spieltag ohne Rueckfragen auswerten koennen. */
const SCHRITTE = [
  ['Vor der Deadline (Freitag)', 'Nichts zu tun. Manager stellen in der App auf oder schicken Aufstellung und Gebote per Mail an den Blog. Die Deadline (90 Minuten vor Anpfiff) setzt die App selbst aus dem Spielplan.'],
  ['1 · Aufstellungen und Gebote', 'Nach der Deadline den Blog öffnen, alles markieren und kopieren (auch die Handy-Ansicht geht). Auf der Rundenseite in Schritt 1 einfügen, «Vorschau» – jede Zeile sollte «zulässig» sein. Dann «Alles Zulässige übernehmen». Danach unten «Vorschau Auflösung» und «Zuteilen & veröffentlichen». Wer nichts gepostet hat, spielt mit der Elf der Vorrunde.'],
  ['2 · kicker-Daten', 'Nach dem letzten Spiel auf dem Handy (Firefox mit Tampermonkey-Skript) die neun kicker-Seiten «Aufstellung» und die «Elf des Tages» öffnen. Jede Seite wird sofort importiert, unten auf der kicker-Seite erscheint die Bestätigung. Ohne Handy: Quelltext der Seiten in Schritt 2 einfügen.'],
  ['3 · Auswerten und abschliessen', 'Rundencheck lesen: «ok» oder nur Hinweise heisst fertig. Falls nötig Korrektur buchen. Dann «Runde abschliessen (final)» – der Spieltagsbericht entsteht von selbst.'],
];
const FEHLER = [
  ['Vorschau: Aufstellung «zu wenige Spieler» oder Name «nicht im Kader»', 'Meist ein Tippfehler im Blog. Einfachster Weg: den Text direkt im Einfügefeld korrigieren (z. B. den Namen so schreiben wie im Kader) und nochmals «Vorschau». Steht der Spieler erst durch ein Gebot dieser Runde im Kader: zuerst zuteilen, dann den Blog nochmals einfügen. Oder die Elf von Hand speichern: Rundenseite › «Aufstellungen & Spielerwerte» aufklappen › «Aufstellung bearbeiten» › Manager.'],
  ['Vorschau: Gebot «keine Entlassung genannt» oder unklar', 'Die Mail nochmals lesen. Ist klar, was gemeint ist, den Satz im Einfügefeld eindeutig machen, z. B. «Biete Potulski, Mainz, V, 2.- und entlasse Dallinga. Ihn für Claude-Maurice einwechseln.», dann «Vorschau». Bei echten Zweifeln beim Manager nachfragen.'],
  ['Gebote falsch aufgelöst', 'Rundenseite › Schritt 1 › «Auflösung zurücksetzen» (nur solange die Runde nicht final ist). Korrigieren, dann neu zuteilen.'],
  ['kicker: «Name prüfen»', 'kicker schreibt den Spieler anders. Unter Kader & Trades beim Spieler die kicker-Kennung setzen (letzter Teil der kicker-Adresse), dann «Eingang erneut importieren».'],
  ['kicker: «Spiel fehlt»', 'Diese Aufstellungsseite fehlt im Eingang. Die Seite auf dem Handy nochmals öffnen (Reiter «Aufstellung», nicht Spielbericht).'],
  ['kicker: «Elf des Tages fehlt»', 'Die Elf ist bei kicker oft erst am Montag da. Später nochmals öffnen. Notfalls die elf Namen in Schritt 3 von Hand eintragen.'],
  ['Skript meldet rot «fehlgeschlagen»', '«nochmals senden» tippen. Hilft das nicht: Seite neu laden. Klappt es weiterhin nicht, den Quelltext am Computer einfügen.'],
  ['Wert eines Spielers stimmt nicht', 'Rundenseite › «Aufstellungen & Spielerwerte» aufklappen und korrigieren. Die Zeile wird gesperrt, ein neuer Import überschreibt sie nicht.'],
  ['Etwas ist komisch und keiner weiss warum', '«Datenabzug (JSON)» auf der Admin-Seite herunterladen und an Roman schicken.'],
];
const SONST = [
  ['Spieler verlässt die Bundesliga', 'Admin › Kader & Spielerpool › «Abgang» beim Spieler. Der Wert wird dem Kaufbudget gutgeschrieben (Ziff. 7.4).'],
  ['Kauf oder Gebühr ausserhalb der Gebote', 'Admin › Kader & Spielerpool › «Manueller Kauf / Buchung».'],
  ['Zusatzposition von Hand', 'Kader & Trades › beim Spieler «+M» usw. Die App erkennt Positionen sonst selbst aus der kicker-Startelf (gilt ab der Folgerunde).'],
  ['Trade', 'Die beiden Manager erledigen das unter «Kader & Trades» selbst (Vorschlag und Annahme). Admins sehen alles dort.'],
  ['Neues Konto, Passwort vergessen', 'Admin › Konten & Einstellungen. Startpasswort setzen, der Manager ändert es beim ersten Login.'],
  ['Deadline verschieben', 'Rundenseite › Schritt 3 › Deadline «Manuell setzen». «Aus Spielplan» stellt sie zurück.'],
  ['Saison-Endstand in die Hall of Fame', 'Admin › Hall of Fame.'],
];
export default async function Hilfe() {
  const u = await getUser(); if (!u || u.role !== 'admin') return <div className="card"><h2>Kein Zugriff</h2><p className="mini">Dieser Bereich ist der Administration vorbehalten.</p></div>;
  const open = await D.openRound();
  return (<>
    <div className="card"><div className="row between" style={{ alignItems: 'baseline' }}><div><div className="eyebrow"><Link href="/admin">Admin</Link> · Hilfe</div><h2 style={{ margin: 0 }}>So wertest du einen Spieltag aus</h2></div>
        <a className="btn sm" href="/api/handbuch">Handbuch herunterladen (PDF)</a></div>
      <p className="mini">Das Handbuch zeigt alle Schritte mit Bildern aus der App (20 Folien). Diese Seite ist die Kurzfassung.</p>
      <p className="small">Alles passiert auf der Seite der Runde: Admin › Zeile des Spieltags › «Auswerten». Die drei Schritte stehen dort untereinander. {open ? <>Offen ist gerade <b>{open.label}</b>, Deadline {fmtDt(open.deadline)}.</> : null}</p>
      <ol className="small" style={{ paddingLeft: 20 }}>{SCHRITTE.map(([t, x]) => <li key={t} style={{ marginBottom: 8 }}><b>{t}.</b> {x}</li>)}</ol>
      <p className="mini">Die App rechnet nach dem Regelwerk: Blog gilt vor der App, Gleichstand bei Geboten gewinnt der schlechtere Tabellenplatz, Eventualaufträge sind gratis, Spieler mit mehreren Positionen werden so eingesetzt, dass die Elf zulässig ist, und eine Vorlage zu einem Eigentor zählt als Assist. Das Regelwerk steht unter <Link href="/regeln">Regeln</Link>.</p></div>
    <div className="card"><div className="eyebrow">Wenn etwas nicht stimmt</div><h3>Fehlerbild und Lösung</h3>
      <div className="tbl wrap"><table><thead><tr><th className="l">Was du siehst</th><th className="l">Was du tust</th></tr></thead><tbody>{FEHLER.map(([a, b]) => <tr key={a}><td className="l small"><b>{a}</b></td><td className="l small">{b}</td></tr>)}</tbody></table></div></div>
    <div className="card"><div className="eyebrow">Gelegentlich</div><h3>Weitere Aufgaben</h3>
      <div className="tbl wrap"><table><tbody>{SONST.map(([a, b]) => <tr key={a}><td className="l small"><b>{a}</b></td><td className="l small">{b}</td></tr>)}</tbody></table></div></div>
    <div className="card"><div className="eyebrow">Einmalig</div><h3>Handy für die kicker-Seiten einrichten</h3>
      <ol className="small" style={{ paddingLeft: 20 }}>
        <li>Auf dem Android-Handy Firefox installieren, darin die Erweiterung «Tampermonkey».</li>
        <li>In Firefox unter Einstellungen › Erweitert «Links in Apps öffnen» auf «Nie» stellen, sonst öffnet sich die kicker-App.</li>
        <li>In Firefox in der RLB-App anmelden, Admin › Werkzeuge › «Tampermonkey-Skript installieren» antippen und bestätigen.</li>
        <li>Fertig. Ab jetzt jede kicker-Seite «Aufstellung» einfach öffnen. iPhone: Quelltext am Computer einfügen (Schritt 2, «Quelltext einfügen»).</li></ol></div>
  </>);
}
