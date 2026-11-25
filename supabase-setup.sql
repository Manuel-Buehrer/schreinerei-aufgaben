-- Einrichtung der Datenbank für die Aufgaben-App (Schwarzwald Schreinerei)
-- In Supabase: SQL Editor → New query → alles einfügen → Run.
-- Kann gefahrlos mehrfach ausgeführt werden.

create table if not exists public.aufgaben (
  id uuid primary key default gen_random_uuid(),
  titel text not null,
  projekt text not null default '',
  zustaendig text not null default '',
  faellig date,
  dringend boolean not null default false,
  notiz text not null default '',
  erledigt boolean not null default false,
  erledigt_am timestamptz,
  erledigt_von text,
  erstellt_am timestamptz not null default now(),
  erstellt_von text not null default '',
  geaendert_am timestamptz not null default now()
);

create table if not exists public.eintraege (
  id uuid primary key default gen_random_uuid(),
  aufgabe_id uuid not null references public.aufgaben(id) on delete cascade,
  text text not null,
  von text not null default '',
  am timestamptz not null default now()
);
-- Uhrzeit für Termine (Outlook)
alter table public.aufgaben add column if not exists uhrzeit text not null default '';
alter table public.aufgaben add column if not exists ort text not null default '';
alter table public.aufgaben add column if not exists faellig_ab date;

create index if not exists eintraege_aufgabe_idx on public.eintraege (aufgabe_id);

create table if not exists public.schritte (
  id uuid primary key default gen_random_uuid(),
  aufgabe_id uuid not null references public.aufgaben(id) on delete cascade,
  text text not null,
  erledigt boolean not null default false,
  erledigt_von text,
  erledigt_am timestamptz,
  sortierung int not null default 0,
  erstellt_am timestamptz not null default now()
);
create index if not exists schritte_aufgabe_idx on public.schritte (aufgabe_id);

create table if not exists public.team (
  name text primary key,
  sortierung int not null default 0
);
insert into public.team (name, sortierung) values ('Manuel', 1), ('Marco', 2), ('Simon', 3)
  on conflict (name) do nothing;

-- Zugriff nur für angemeldete Nutzer (Team-Code)
alter table public.aufgaben  enable row level security;
alter table public.eintraege enable row level security;
alter table public.schritte  enable row level security;
alter table public.team      enable row level security;

drop policy if exists "Team darf alles" on public.aufgaben;
drop policy if exists "Team darf alles" on public.eintraege;
drop policy if exists "Team darf alles" on public.schritte;
drop policy if exists "Team darf alles" on public.team;
create policy "Team darf alles" on public.aufgaben  for all to authenticated using (true) with check (true);
create policy "Team darf alles" on public.eintraege for all to authenticated using (true) with check (true);
create policy "Team darf alles" on public.schritte  for all to authenticated using (true) with check (true);
create policy "Team darf alles" on public.team      for all to authenticated using (true) with check (true);

-- Live-Abgleich zwischen allen Geräten
do $$
declare t text;
begin
  foreach t in array array['aufgaben','eintraege','schritte','team'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;

-- ============ Fenster-Aufmaß ============
create table if not exists public.aufmasse (
  id uuid primary key default gen_random_uuid(),
  kunde text not null default '',
  projekt text not null default '',
  adresse text not null default '',
  datum date,
  aufgemessen_von text not null default '',
  notiz text not null default '',
  positionen jsonb not null default '[]'::jsonb,
  erstellt_am timestamptz not null default now(),
  erstellt_von text not null default '',
  geaendert_am timestamptz not null default now()
);
create table if not exists public.einstellungen (
  schluessel text primary key,
  wert jsonb not null default '{}'::jsonb
);
alter table public.aufmasse      enable row level security;
alter table public.einstellungen enable row level security;
drop policy if exists "Team darf alles" on public.aufmasse;
drop policy if exists "Team darf alles" on public.einstellungen;
create policy "Team darf alles" on public.aufmasse      for all to authenticated using (true) with check (true);
create policy "Team darf alles" on public.einstellungen for all to authenticated using (true) with check (true);

-- Fotos zum Aufmaß (nicht öffentlich, nur mit Team-Code)
insert into storage.buckets (id, name, public) values ('aufmass-fotos', 'aufmass-fotos', false)
  on conflict (id) do nothing;
drop policy if exists "Team Fotos lesen" on storage.objects;
drop policy if exists "Team Fotos hochladen" on storage.objects;
drop policy if exists "Team Fotos ändern" on storage.objects;
drop policy if exists "Team Fotos löschen" on storage.objects;
create policy "Team Fotos lesen"     on storage.objects for select to authenticated using (bucket_id = 'aufmass-fotos');
create policy "Team Fotos hochladen" on storage.objects for insert to authenticated with check (bucket_id = 'aufmass-fotos');
create policy "Team Fotos ändern"    on storage.objects for update to authenticated using (bucket_id = 'aufmass-fotos');
create policy "Team Fotos löschen"   on storage.objects for delete to authenticated using (bucket_id = 'aufmass-fotos');

-- ============ Bereiche & „Mein Büro“ (privat) ============
alter table public.aufgaben add column if not exists bereich text not null default '';
alter table public.aufgaben add column if not exists privat_fuer uuid;

-- Aufgaben: gemeinsame für alle angemeldeten Zugänge, private nur für den eigenen Zugang
drop policy if exists "Team darf alles" on public.aufgaben;
drop policy if exists "Gemeinsam oder eigene" on public.aufgaben;
create policy "Gemeinsam oder eigene" on public.aufgaben for all to authenticated
  using (privat_fuer is null or privat_fuer = auth.uid())
  with check (privat_fuer is null or privat_fuer = auth.uid());

-- Teilschritte und Verlauf folgen der Sichtbarkeit ihrer Aufgabe
drop policy if exists "Team darf alles" on public.schritte;
drop policy if exists "Gemeinsam oder eigene" on public.schritte;
create policy "Gemeinsam oder eigene" on public.schritte for all to authenticated
  using (exists (select 1 from public.aufgaben a where a.id = aufgabe_id))
  with check (exists (select 1 from public.aufgaben a where a.id = aufgabe_id));
drop policy if exists "Team darf alles" on public.eintraege;
drop policy if exists "Gemeinsam oder eigene" on public.eintraege;
create policy "Gemeinsam oder eigene" on public.eintraege for all to authenticated
  using (exists (select 1 from public.aufgaben a where a.id = aufgabe_id))
  with check (exists (select 1 from public.aufgaben a where a.id = aufgabe_id));
