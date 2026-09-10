# RLB Managerspiel 26/27 – Web-App

Rotissery League Bundesliga: Tabelle, Aufstellung, Transfermarkt mit verdeckten Geboten, Trades und Abrechnung nach dem Regelwerk V4 (2022). Alle 34 Spieltage werden aus dem offiziellen Spielplan (OpenLigaDB) geladen; offen ist immer nur die nächste Runde, bis 90 Minuten vor dem ersten Anpfiff.

Technik: Next.js 14, PostgreSQL, Login mit E-Mail und Passwort (Rollen Admin und Manager). Manager dürfen nur ihre eigene Aufstellung und ihr eigenes Gebot bearbeiten, und das nur für die offene Runde. Alles andere ist dem Admin vorbehalten. Alle Prüfungen laufen serverseitig.

## Inbetriebnahme (ohne Programmierkenntnisse, ca. 30 Minuten)

Du brauchst drei kostenlose Konten: GitHub (Code-Ablage), Vercel (Hosting) und Neon (Datenbank, wird direkt aus Vercel erstellt).

### 1. Code auf GitHub ablegen
1. Konto auf github.com erstellen, dann «New repository», Name `rlb-managerspiel`, Private, «Create repository».
2. Auf der leeren Repository-Seite «uploading an existing file» wählen und den kompletten Inhalt dieses Ordners (ohne `node_modules`, ohne `.env`) per Drag-and-drop hochladen. Ordner können als Ganzes gezogen werden. «Commit changes».

### 2. Auf Vercel deployen und Datenbank anlegen
1. Konto auf vercel.com erstellen (mit dem GitHub-Konto anmelden), «Add New… › Project», das Repository `rlb-managerspiel` importieren.
2. Bevor du auf «Deploy» klickst, unter «Environment Variables» folgende Werte eintragen (siehe `.env.example`):
   - `AUTH_SECRET`: ein langer Zufallstext (mindestens 32 Zeichen, z. B. aus einem Passwortgenerator)
   - `SEASON`: `2026`
   - `ADMIN_EMAIL`: deine E-Mail
   - `ADMIN_PASSWORD`: ein Startpasswort für dich (wird beim ersten Login geändert)
   - `ADMIN_MANAGER`: `Roman` (dein Team, damit du auch als Manager spielst)
   - `CRON_SECRET`: ein zweiter Zufallstext (schützt Einrichtung und täglichen Sync)
3. «Deploy» klicken. Der erste Build dauert 1–2 Minuten.
4. Im Vercel-Projekt auf «Storage › Create Database › Neon (Postgres)» gehen und die Datenbank mit dem Projekt verbinden. Vercel legt dabei die Variable `DATABASE_URL` an (falls sie `POSTGRES_URL` heisst: unter Settings › Environment Variables eine Variable `DATABASE_URL` mit demselben Wert anlegen).
5. Unter «Deployments» das letzte Deployment «Redeploy», damit die Datenbank-Variable aktiv wird.

### 3. Datenbank einrichten und Runde 1 importieren
Im Browser aufrufen (deine Vercel-Adresse, dann):

    https://DEINE-APP.vercel.app/api/setup?key=DEIN_CRON_SECRET

    Kurzbericht zum Betriebszustand (Sync-Zeiten, letzter kicker-Import, nächste Deadline, fehlende Aufstellungen, offene Abgänge, versiegelte Gebote) jederzeit unter

    https://DEINE-APP.vercel.app/api/status?key=DEIN_CRON_SECRET

Antwort `{"ok":true,...}` bedeutet: Schema angelegt, Manager, Vereine, alle 223 Spieler, Aufstellungen und Resultate von Spieltag 1 importiert, Admin-Konto erstellt. Der Aufruf kann gefahrlos wiederholt werden.

### 4. Anmelden und Manager-Konten anlegen
1. `https://DEINE-APP.vercel.app/login` mit `ADMIN_EMAIL` / `ADMIN_PASSWORD`, dann eigenes Passwort setzen.
2. «Admin» › «Ganzen Spielplan laden»: holt alle 34 Spieltage mit Anstosszeiten und setzt die Deadlines.
3. «Admin» › «Konto anlegen» für jeden Manager (Name, E-Mail, Team, Startpasswort). Die Manager melden sich an und setzen ihr Passwort selbst.
4. «Admin» › «Vorsaison-Reihenfolge» prüfen (Gleichstandsregel für Gebote in Runde 2, solange nur eine Runde gewertet ist).

### Betrieb pro Runde (Admin)
1. Bis zur Deadline: Manager speichern Aufstellung und geben Gebote ab. Ohne Änderung gilt die Vorrunde.
2. Nach der Deadline: «Admin › Runde › Vorschau Auflösung», dann «Zuteilen & veröffentlichen» (Käufe, Entlassungen, Verträge, Eventualaufträge).
3. Nach den Spielen: Vereinspunkte und Zu-null kommen aus OpenLigaDB. Sobald alle Spiele beendet sind, liest die App die kicker-Seiten (Aufstellung pro Spiel: Startelf, Wechsel, Tore, Vorlagen, Karten; Elf des Tages: Team der Runde, Spieler des Tages) und schreibt die Werte direkt; Tore zusätzlich aus OpenLigaDB. Im Admin pro Runde: «kicker importieren» zum Wiederholen, Protokoll, Rückfall zum Einfügen von kicker-HTML, falls kicker den Abruf blockiert. Manuell geänderte Zeilen werden nicht überschrieben. Dann prüfen und «Runde abschliessen». Jeder kicker-Import füllt zudem den Spielerpool (Tabelle `bl_players`: alle Spieler, die laut kicker gespielt haben, mit Verein und Position); der Transfermarkt zeigt daraus die freien Spieler, und das Gebotsformular schlägt sie beim Tippen vor. Grundlage des Pools sind die kicker-Kaderseiten aller 18 Vereine (`src/lib/squads.js`): täglich um 03:00 UTC (Cron `/api/sync`) und per Admin-Knopf werden alle Kader mit Position laut kicker (Tor/Abwehr/Mittelfeld/Sturm) geladen und mit dem Vortag verglichen; Zugänge, Abgänge, Vereinswechsel und Positionsänderungen landen im Protokoll (Admin), betroffene RLB-Spieler werden markiert und unter «Abgänge prüfen» zum Buchen (7.4) vorgeschlagen. Das Paket enthält eine Momentaufnahme (`db/seed/kicker-kader.json`, 509 Spieler, Stand 10.09.2026), die beim Setup geladen wird. Blockiert kicker den Server-Abruf, gibt es im Admin ein Konsolen-Skript, das die 18 Kader im Browser liest und als JSON zum Einfügen kopiert.
4. Verschobene Spiele erscheinen in der Admin-Übersicht und können als Nachtragsrunde abgespalten werden (Ziff. 8).

Der Spielplan aktualisiert sich beim Seitenaufruf (stündlich Resultate, täglich der ganze Plan) und zusätzlich täglich um 03:00 UTC über den Vercel-Cron (`vercel.json`).

## Lokal entwickeln
    cp .env.example .env    # DATABASE_URL auf eine lokale Postgres-Datenbank zeigen lassen
    npm install
    npm run db:migrate && npm run db:seed
    npm run dev             # http://localhost:3000

`DEMO_MANAGER_PASSWORD=...` in `.env` legt beim Seed Testkonten `<name>@rlb.local` für alle Manager an.

## Struktur
- `db/schema.sql` Datenbankschema, `db/seed/runde1.json` Import aus dem Excel (Spieltag 1)
- `src/lib/rules.js` Spiellogik (Wertung, Rangpunkte, Positionsregel, Wechselkosten, Gebotsauflösung), ohne Datenbankzugriff
- `src/lib/data.js` Laden und Kumulieren der Runden, Auslagen, Budget
- `src/lib/oldb.js` OpenLigaDB-Sync (Spielplan, Anstosszeiten, Resultate, Deadlines, Torschützen)
- `src/lib/kicker.js` kicker-Import (Aufstellung, Wechsel, Tore, Vorlagen, Karten, Elf des Tages)
- `src/actions/index.js` alle schreibenden Aktionen mit Rechteprüfung
- `src/app/*` Seiten: Tabelle, Aufstellung, Transfermarkt (mit Spielerpool «Freie Spieler»), Kader & Trades, Statistik (Tabellenplatz-Verlauf, Form-Heatmap, Kategorien), Abrechnung, Regeln, Konto, Admin
- `src/components/Charts.js` Diagramme als reines SVG

## Bekannte Grenzen
- kicker hat keine API; der Import liest die öffentlichen Seiten (Parser in `src/lib/kicker.js`, geprüft an Spieltag 1: alle 19 Spieler aus Bayern–Stuttgart und die Elf des Tages exakt wie im Excel). kicker kann automatisierte Abrufe blockieren oder das Layout ändern; dann greift der Rückfall (HTML einfügen) oder die manuelle Eingabe. Konvention aus dem Excel (von Roman bestätigt): der Spieler des Tages zählt zusätzlich 1 Team-der-Runde-Punkt. Positionen (5.2): Grundposition = kicker-Kaderliste. Die App liest pro Spiel die kicker-Formationszeilen (Torwart, Abwehr, Mittelfeld, Sturm); steht ein RLB-Spieler (Stamm oder Ersatzbank) in der Startelf auf einer anderen Position als seiner Grundposition, ist er ab der Folgerunde auf beiden Positionen einsetzbar (Kader zeigt z. B. «V/M», Aufstellung lässt beide wählen, Protokoll unter Transfers; Admin kann mit −Pos entfernen, etwa bei 3-6-1-Systemen, wo kicker Aussenverteidiger im Mittelfeld führt, Ziff. 5.2 «im Zweifelsfall kein Erwerb»). Die Startaufstellungen von Spieltag 1 und 2 sind im Paket (`db/seed/kicker-startelf.json`) und werden beim Setup angewendet. Auch für freie Spieler merkt sich der Pool die gespielten Positionen («S/M» im Transfermarkt); ein gekaufter Spieler bringt Grundposition laut Kader plus alle in dieser Saison gespielten Positionen mit. Vorlagen bei Eigentoren werden nicht gezählt, aber protokolliert.
- Gebote sind für andere Manager unsichtbar, für den Admin nach der Deadline einsehbar (Regelwerk 7.1: Bekanntgabe nach der Runde, technisch nach der Deadline).
- Ermessensentscheide (Trade-Missverhältnis, Positionserwerb, 48-Stunden-Regel, Spielabbruch) bleiben beim Admin.
