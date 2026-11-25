-- To-dos aus Wochenplan KW 48 (Marco & Simon). Mehrfaches Ausführen legt nichts doppelt an.
insert into public.team (name, sortierung) values ('Jessi', 4) on conflict (name) do nothing;

insert into public.aufgaben (titel, projekt, zustaendig, bereich, ort, faellig, notiz, erstellt_von)
select v.titel, v.projekt, v.zustaendig, v.bereich, v.ort, v.faellig::date, v.notiz, 'Manuel'
from (values
  ('Geländer für die Treppe im Schlafzimmer fertig planen', 'BV Kollofrath', 'Marco', 'Büro', '', '2026-11-27', ''),
  ('Planung fertig machen: Theke, Eckbank, Tische, Glasgehänge, Unterschränke', 'Pizzeria Steinzeit (Kurhaus)', 'Marco', 'Büro', '', '2026-11-27', ''),
  ('Angebot Gläserträger fertig machen', 'Brauerei Fürstenberg', 'Marco', 'Büro', '', '2026-11-27', ''),
  ('Anfrage prüfen, ob die Tischunterlage so gebaut werden kann', 'ACC-Vertrieb', 'Marco', 'Büro', '', '2026-11-27', ''),
  ('Aufmaß Fensterbänke innen und Schiebeläden außen', 'BV Kollofrath', 'Simon', 'Aufmaß', '', '2026-11-23', 'Laut Wochenplan am Montag'),
  ('Dämmung über der Haustür montieren', 'BV Schneider', 'Simon', 'Montage', '', '2026-11-27', ''),
  ('Angebot Fenster überarbeiten', 'Paluda', 'Simon', 'Büro', '', '2026-11-27', ''),
  ('Fenster bestellen', 'Evelyn Schmidt', 'Simon', 'Büro', 'Sexau', '2026-11-27', ''),
  ('Fenster bestellen', 'BV Marcel Gebhardt', 'Simon', 'Büro', '', '2026-11-27', ''),
  ('Rücksprache Fensterbestellung', 'Christa Bartsch', 'Simon', 'Büro', '', '2026-11-27', 'Eventuell Aufmaß Küche'),
  ('Aufmaß Küche', 'BV Katharina & Fabian Schmidt', 'Simon', 'Aufmaß', 'Emmendingen', '2026-11-27', 'Eventuell Kalkulation Innentreppen')
) as v(titel, projekt, zustaendig, bereich, ort, faellig, notiz)
where not exists (select 1 from public.aufgaben a where a.titel = v.titel and a.projekt = v.projekt);
