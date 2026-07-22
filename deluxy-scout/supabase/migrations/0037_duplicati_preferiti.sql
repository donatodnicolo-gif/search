-- Coppie di target segnate come "NON duplicati" (suggerimento ignorato): non
-- vengono più proposte per l'unione. Coppia normalizzata (min,max) per unicità.
create table if not exists duplicati_ignorati (
  place_min  uuid not null references places(id) on delete cascade,
  place_max  uuid not null references places(id) on delete cascade,
  owner      uuid references auth.users(id) default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (place_min, place_max)
);
alter table duplicati_ignorati enable row level security;
-- Condiviso come i target: chiunque autenticato legge/segna/annulla.
drop policy if exists duplicati_ignorati_all on duplicati_ignorati;
create policy duplicati_ignorati_all on duplicati_ignorati
  for all to authenticated using (true) with check (true);

-- Indirizzi preferiti dell'utente (per tornare in fretta su una zona in Mappa).
create table if not exists indirizzi_preferiti (
  id         uuid primary key default gen_random_uuid(),
  owner      uuid references auth.users(id) default auth.uid(),
  etichetta  text not null,
  indirizzo  text not null,
  lat        double precision not null,
  lng        double precision not null,
  created_at timestamptz not null default now()
);
alter table indirizzi_preferiti enable row level security;
-- Privati: ognuno vede e gestisce solo i propri.
drop policy if exists indirizzi_preferiti_sel on indirizzi_preferiti;
create policy indirizzi_preferiti_sel on indirizzi_preferiti
  for select to authenticated using (owner = auth.uid());
drop policy if exists indirizzi_preferiti_ins on indirizzi_preferiti;
create policy indirizzi_preferiti_ins on indirizzi_preferiti
  for insert to authenticated with check (owner = auth.uid() or owner is null);
drop policy if exists indirizzi_preferiti_del on indirizzi_preferiti;
create policy indirizzi_preferiti_del on indirizzi_preferiti
  for delete to authenticated using (owner = auth.uid());

create index if not exists indirizzi_preferiti_owner_ix on indirizzi_preferiti (owner, created_at desc);
