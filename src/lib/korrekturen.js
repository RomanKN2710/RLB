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

/* Vereinsabweichungen, die geprüft und in Ordnung sind: hier passt der Name zwar auf einen
   Pooleintrag, aber in einem anderen Verein – und es ist nachweislich ein anderer Spieler.
   Sie werden aus der Warnung in /api/status ausgenommen, damit der Bericht nicht dauerhaft
   auf Bekanntes zeigt. */
export const GEPRUEFT_OK = [
  { id: 'arbi-ulrich', grund: 'Laut Roman der Gladbacher Ulrich. Laurin Ulrich in Paderborn ist ein anderer Spieler und steht zu Recht als frei im Transfermarkt. kicker führt bei Gladbach keinen Ulrich, seine Werte lassen sich daher nicht automatisch importieren.' },
];
