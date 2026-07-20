-- 0017 — Sezione Affiliazioni: step (stati del registro Anagrafiche) + registro chiamate.
--
-- Le "affiliazioni" sono le attività della linea Re-seller (fioristi/pasticcerie) da
-- reclutare come affiliati su deluxy.it. Hanno un proprio ciclo di lavorazione con i
-- 7 stati del registro Anagrafiche, tenuto SEPARATO dallo stato generico dell'attività
-- (da_visitare/visitato/cliente/perso) per non interferire con visite e sync HubSpot.

-- I 7 stati del registro (stessi valori di src/lib/stati.ts di deluxy-anagrafiche).
do $$ begin
  create type stato_affiliazione_t as enum (
    'prospect', 'in_contatto', 'in_attesa', 'in_trattativa',
    'da_ricontattare', 'attivo', 'non_interessato'
  );
exception when duplicate_object then null; end $$;

alter table places add column if not exists stato_affiliazione stato_affiliazione_t;

-- Chi è già nel registro parte dal suo stato reale (mappato sull'enum; gli stati
-- non previsti — es. 'dismesso' — cadono su 'non_interessato').
update places set stato_affiliazione = (
  case anagrafiche_stato
    when 'prospect' then 'prospect'
    when 'in_contatto' then 'in_contatto'
    when 'in_attesa' then 'in_attesa'
    when 'in_trattativa' then 'in_trattativa'
    when 'da_ricontattare' then 'da_ricontattare'
    when 'attivo' then 'attivo'
    when 'non_interessato' then 'non_interessato'
    else 'prospect'
  end
)::stato_affiliazione_t
where linea_ipotizzata = 'Re-seller' and stato_affiliazione is null;

-- Le altre affiliazioni (non dal registro) partono da 'prospect'.
update places set stato_affiliazione = 'prospect'
where linea_ipotizzata = 'Re-seller' and stato_affiliazione is null;

create index if not exists places_stato_affiliazione_ix on places (stato_affiliazione)
  where stato_affiliazione is not null;

-- Registro chiamate: ogni "Chiama" lascia traccia (chi, quando, esito facoltativo).
create table if not exists chiamate (
  id         uuid primary key default gen_random_uuid(),
  place_id   uuid not null references places(id) on delete cascade,
  owner      uuid references auth.users(id) default auth.uid(),
  esito      text,   -- facoltativo: 'risposto' | 'non_risposto' | 'richiamare' ...
  note       text,
  created_at timestamptz not null default now()
);
create index if not exists chiamate_place_ix on chiamate (place_id, created_at desc);

alter table chiamate enable row level security;
-- Team condiviso: tutti gli autenticati leggono; ognuno inserisce a proprio nome.
drop policy if exists chiamate_select on chiamate;
create policy chiamate_select on chiamate for select to authenticated using (true);
drop policy if exists chiamate_insert on chiamate;
create policy chiamate_insert on chiamate for insert to authenticated
  with check (owner = auth.uid() or owner is null);
