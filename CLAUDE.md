# RLB Managerspiel – Regeln für Änderungen

## Hilfe und Handbuch immer mitziehen (Vorgabe Roman, 26.10.2026)

Jede Änderung an Bedienung, Knöpfen, Texten, Abläufen oder Regelauslegung zieht Hilfe und Handbuch im selben Commit nach:

1. **Hilfeseite** `src/app/admin/hilfe/page.js` anpassen (Checkliste, Fehlerbilder, seltene Aufgaben, Handy einrichten).
2. **Handbuch-Folien** in `docs/handbuch/slides/` anpassen (eine `<section>` je Folie, 1920×1080, Stile inline; Reihenfolge in `docs/handbuch/deck.json`). Ändert sich ein Bildschirm sichtbar, den Screenshot in `docs/handbuch/img/` ersetzen.
3. `npm run handbuch` ausführen und `docs/handbuch/rlb-admin-handbuch.pdf` mitcommitten. Die App liefert es Admins unter `/api/handbuch` aus (Links auf Admin und Admin › Hilfe).
4. `npm test` muss grün sein. `tests/hilfe.test.mjs` prüft, dass jede Bezeichnung in «…» auf der Hilfeseite und in den Folien in der App vorkommt; wer einen Knopf umbenennt, sieht dort, was nachzuziehen ist.
5. Ändert sich eine Regelauslegung, den Abschnitt «Entscheide» in `docs/regelwerk.md` nachführen.
6. Im Bericht an Roman sagen, was in Hilfe und Handbuch geändert wurde. Die Online-Präsentation (claude.ai/artifact/22w9Lkm4JpMsmffwHeRY9B) enthält dieselben Folien; geänderte Folien dort ebenfalls aktualisieren, wenn die Sitzung Zugriff hat, sonst Roman darauf hinweisen.

## Arbeitsweise

- Commits gehen direkt auf `main`; Vercel veröffentlicht automatisch.
- Daten der Produktion nie direkt ändern: einmalige Korrekturen als idempotenter Schritt in `src/lib/migrations.js` (läuft beim Öffnen der Admin-Seite und protokolliert sich).
- Schlüssel und Passwörter nur in den Vercel-Umgebungsvariablen, nie im Code oder Chat.
- Texte der Oberfläche auf Deutsch (Schweiz), Anführungszeichen «…».
