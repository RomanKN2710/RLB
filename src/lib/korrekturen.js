/* Punktuelle Datenkorrekturen an Kaderspielern, gegen die kicker-Kaderdaten geprüft.
   Bewusst als ausdrückliche Liste statt als automatischer Namensabgleich: der Abgleich
   in playerMatches ist absichtlich grosszügig (Nachname genügt) und trifft sonst auch
   Namensvettern – Karl Hein ist nicht Lennart Karl, Nicolas Kristof nicht Moritz Nicolas.

   Aufgenommen wird nur, was die Wertung nicht rückwirkend verändert:
   ein Vereinswechsel nur bei nie aufgestellten Spielern, Schreibfehler ohnehin nur am Namen.
   Ein Fall bleibt bewusst draussen: Arbis "Ulrich" (Gladbach) findet sich bei kicker nur als
   Laurin Ulrich in Paderborn. Er stand in beiden Runden in der Aufstellung, und die beiden
   Vereine haben in Runde 1 unterschiedlich gepunktet – eine Änderung würde die bereits
   abgeschlossene Wertung verschieben. Das entscheidet Roman. */
export const KORREKTUREN = [
  { id: 'roman-ibrahimovic', club: 'Augsburg', grund: 'kicker führt Arijon Ibrahimovic in Augsburg; bei Bayern steht kein Ibrahimovic. Nie aufgestellt, daher ohne Folgen für die Wertung.' },
  { id: 'mark-veermann', name: 'Veerman', grund: 'Schreibweise laut kicker: Joey Veerman (Dortmund).' },
  { id: 'mark-el-ouadih', name: 'El Ouahdi', grund: 'Schreibweise laut kicker: Zakaria El Ouahdi (Hamburg).' },
  { id: 'rofe-johanesson-r2', name: 'Johannesson', grund: 'Schreibweise laut kicker: Isak Bergmann Johannesson (Köln).' },
  { id: 'rofe-illic', name: 'Ilic', grund: 'Schreibweise laut kicker: Andrej Ilic (Union, Sturm) – identischer Verein und identische Position.' },
  { id: 'arbi-ulrich', name: 'Ullrich', grund: 'Schreibweise laut kicker: Lukas Ullrich (Gladbach, Abwehr), mit zwei l. Der Paderborner Laurin Ulrich mit einem l ist ein anderer Spieler und bleibt im Transfermarkt frei.' },
];

/** Korrekturen anwenden; meldet nur, was tatsächlich geändert wurde. Mehrfach aufrufbar. */
export async function applyKorrekturen(q, log = () => {}) {
  for (const k of KORREKTUREN) {
    const rows = await q('select id, name, club from players where id=$1', [k.id]);
    if (!rows.length) continue;
    const p = rows[0];
    const felder = [], werte = [];
    if (k.name && p.name !== k.name) { felder.push('name'); werte.push(k.name); }
    if (k.club && p.club !== k.club) { felder.push('club'); werte.push(k.club); }
    if (!felder.length) continue;
    const setzen = felder.map((f, i) => `${f}=$${i + 2}`).join(', ');
    await q(`update players set ${setzen} where id=$1`, [k.id, ...werte]);
    log(`Korrektur ${p.name}${p.club ? ' (' + p.club + ')' : ''} → ${k.name || p.name}${k.club ? ' (' + k.club + ')' : ''}: ${k.grund}`);
  }
}

/* Vereinsabweichungen, die geprüft und in Ordnung sind (Name passt, Verein nicht, aber es
   ist nachweislich ein anderer Spieler). Zurzeit keine: der Fall "Ulrich" war ein
   Schreibfehler und steht oben als Korrektur. */
export const GEPRUEFT_OK = [];

/* Spieler, die die Bundesliga verlassen haben (Ziff. 7.4): Status auf "abgang", der Wert
   wird dem Kaufbudget gutgeschrieben. Genau das, was der Admin-Knopf "Abgang buchen" tut,
   nur ohne Klick – von Roman bestätigt. Wird nur einmal gebucht. */
export const ABGAENGE = [
  { id: 'arbi-belocian', grund: 'Liga verlassen: zu Racing Santander (von Roman bestätigt).' },
  { id: 'dani-vogt', grund: 'Liga verlassen (von Roman bestätigt).' },
  { id: 'dani-kolo-muani', gutschrift: false, grund: 'Zu Juventus abgegangen. Die Gutschrift steht bereits aus dem Excel-Import von Runde 2, hier wird nur der Status nachgezogen – sonst bliebe er als aktiver Spieler auf einem Kaderplatz stehen, ohne je punkten zu können.' },
];

/** Abgänge buchen: Status, Gutschrift aufs Kaufbudget, Transferzeile. Mehrfach aufrufbar. */
export async function applyAbgaenge(q, log = () => {}) {
  for (const a of ABGAENGE) {
    const rows = await q('select * from players where id=$1', [a.id]);
    if (!rows.length) continue;
    const p = rows[0];
    if (p.status === 'abgang') continue;
    // Doppelte Gutschrift vermeiden: sie kann schon als Transferzeile oder – wie beim
    // Excel-Import von Runde 2 – nur als Buchung im Kontoblatt vorliegen.
    const schonTransfer = await q("select 1 from transfers where type='abgang' and manager_id=$1 and player_name=$2", [p.manager_id, p.name]);
    const schonLedger = await q("select 1 from ledger where manager_id=$1 and type='gutschrift' and text like $2", [p.manager_id, '%' + p.name + '%']);
    const schon = schonTransfer.length || schonLedger.length || a.gutschrift === false;
    const letzte = await q("select * from rounds where status='final' order by number desc limit 1");
    const r = letzte[0] || null;
    const wert = Number(p.price) || 0;
    await q("update players set status='abgang', valid_to=$2 where id=$1", [p.id, r ? r.number : 0]);
    if (!schon) {
      await q("insert into ledger(manager_id,round_id,type,amount,text) values($1,$2,'gutschrift',$3,$4)", [p.manager_id, r ? r.id : null, wert, `Abgang ${p.name} aus der Bundesliga (Ziff. 7.4)`]);
      await q("insert into transfers(round_id,manager_id,type,player_name,price,note) values($1,$2,'abgang',$3,$4,'Wert dem Kaufbudget gutgeschrieben')", [r ? r.id : null, p.manager_id, p.name, wert]);
    }
    log(`Abgang gebucht: ${p.name} (${p.club})${schon ? ' – ohne neue Gutschrift, sie war schon vorhanden' : ` – ${wert} dem Kaufbudget gutgeschrieben`}. ${a.grund}`);
  }
}
