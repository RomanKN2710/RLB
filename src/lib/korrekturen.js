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
