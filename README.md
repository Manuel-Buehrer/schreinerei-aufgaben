# Aufgaben & Fenster-Aufmaß · Schwarzwald Schreinerei

Gemeinsame Aufgabenliste für Büro und Meister. Läuft im Browser auf Handy, Tablet und PC und lässt sich als App auf den Home-Bildschirm legen. Kein Claude-Konto nötig – angemeldet wird mit einem gemeinsamen Team-Code.

## Funktionen
- Aufgaben mit Projekt/Kunde, Zuständigem, Fälligkeitsdatum und „Dringend“
- Teilschritte zum Abhaken mit Fortschrittsbalken
- Verlauf: eintragen, was gemacht wurde oder was noch fehlt; beim Abhaken optional eine Notiz
- Spracheingabe (Mikrofon-Knopf) für Aufgaben, Notizen, Teilschritte und Verlauf
- Überblick: offen, dringend, überfällig, heute fällig
- Filter nach Person, Gruppierung nach Projekt, Person oder Fälligkeit, Suche
- Live-Abgleich: Änderungen erscheinen sofort auf allen Geräten

## Technik
- Statische Seite (GitHub Pages), Datenbank und Anmeldung: Supabase (Region Frankfurt)
- `config.js`: Supabase-URL und öffentlicher Schlüssel. Ohne Eintrag läuft die App im Vorschau-Modus mit Beispieldaten im Browser.
- `supabase-setup.sql`: legt Tabellen, Zugriffsregeln und Live-Abgleich an
- Anmeldung: ein Supabase-Nutzer `team@schwarzwald-schreinerei.de`, dessen Passwort der Team-Code ist. Team-Code ändern: Supabase → Authentication → Users → Nutzer → Passwort ändern (danach müssen sich alle neu anmelden).
- `lib/supabase.js`: supabase-js 2.45.4 (MIT-Lizenz), lokal abgelegt

## Fenster-Aufmaß (`/aufmass/`)
- Elementtypen: Fenster 1-/2-flg. (Stulp oder Pfosten), 3-teilig, mit Oberlicht, Festverglasung, Balkontür 1-/2-flg., Hebe-Schiebe-Tür, Haustür (auch mit Seitenteil/Oberlicht), gekoppelte Elemente (frei 1–6 Spalten × 1–4 Reihen), Sonderform
- Skizze mit Öffnungsart je Feld (antippen), Ansicht von innen
- Maße direkt an der Skizze; ein Maß pro Richtung, optional zweites Maß (oben/unten, links/rechts) – gerechnet wird mit dem kleineren; Hinweis bei Abweichung über Toleranz
- Ziffernblock auf dem Bildschirm, „Weiter“ springt zum nächsten Maß; Laser mit Bluetooth-Tastaturmodus tippt direkt ins aktive Feld (Meterwerte wie „1,234“ werden in mm umgerechnet)
- Einbausituation mit Abzügen (Menü → Einstellungen) → Bestellmaß
- Ausführung, Notiz (auch per Sprache), Fotos
- Protokoll zum Drucken/als PDF und Bestellliste als CSV (Excel)
