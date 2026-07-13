-- Deluxy Scout — schema iniziale
-- Esegui con la Supabase CLI (`supabase db push`) o incollando nel SQL Editor.

-- Estensioni utili
create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "postgis";    -- indice geospaziale reale

-- Enum di dominio
do $$ begin
  create type priorita_t as enum ('P1', 'P2', 'P3');
exception when duplicate_object then null; end $$;

do $$ begin
  create type stato_place_t as enum ('da_visitare', 'visitato', 'cliente', 'perso');
exception when duplicate_object then null; end $$;

do $$ begin
  create type esito_visita_t as enum ('interessato', 'da_richiamare', 'non_target', 'chiuso');
exception when duplicate_object then null; end $$;

do $$ begin
  create type dealstage_t as enum (
    'appointmentscheduled', 'decisionmakerboughtin', 'contractsent', 'closedwon', 'closedlost'
  );
exception when duplicate_object then null; end $$;

-- PLACES — tutte le attività del territorio
create table if not exists places (
  id                 uuid primary key default gen_random_uuid(),
  nome               text not null,
  indirizzo          text,
  lat                double precision not null,
  lng                double precision not null,
  settore            text,
  categoria          text,
  priorita           priorita_t not null default 'P3',
  linea_ipotizzata   text,
  aggancio_apertura  text,
  fuoco_espansione   text,
  stato              stato_place_t not null default 'da_visitare',
  zona               text,
  hubspot_company_id text,
  -- Punto geografico generato da lng/lat per l'indice geospaziale.
  geo                geography(Point, 4326)
                     generated always as (st_setsrid(st_makepoint(lng, lat), 4326)::geography) stored,
  created_at         timestamptz not null default now()
);

-- Indice geospaziale (GIST) per query di prossimità nel pianificatore di giro.
create index if not exists places_geo_gix on places using gist (geo);
-- Indice di supporto per filtri frequenti.
create index if not exists places_filtri_ix on places (priorita, stato, zona);

-- CONTACTS
create table if not exists contacts (
  id                uuid primary key default gen_random_uuid(),
  place_id          uuid not null references places(id) on delete cascade,
  nome              text not null,
  ruolo             text,
  telefono          text,
  email             text,
  is_decisore       boolean not null default false,
  hubspot_contact_id text
);
create index if not exists contacts_place_ix on contacts (place_id);

-- VISITS
create table if not exists visits (
  id                uuid primary key default gen_random_uuid(),
  place_id          uuid not null references places(id) on delete cascade,
  data              timestamptz not null default now(),
  lat               double precision,
  lng               double precision,
  esito             esito_visita_t,
  briefing          text,
  note_post_meeting text,
  esito_analisi     text,
  next_step         text not null,             -- obbligatorio (regola Fase 3)
  linea_proposta    text,
  cross_sell        text[],
  foto_url          text,
  owner             uuid references auth.users(id) default auth.uid(),
  hubspot_synced    boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists visits_place_ix on visits (place_id);
create index if not exists visits_owner_data_ix on visits (owner, data);

-- DEALS
create table if not exists deals (
  id             uuid primary key default gen_random_uuid(),
  place_id       uuid not null references places(id) on delete cascade,
  linea          text,
  fase           dealstage_t not null default 'appointmentscheduled',
  valore_atteso  numeric(12,2),
  next_action    text,
  owner          uuid references auth.users(id) default auth.uid(),
  hubspot_deal_id text
);
create index if not exists deals_place_ix on deals (place_id);

-- LINES — le 9 linee di servizio
create table if not exists lines (
  id           uuid primary key default gen_random_uuid(),
  nome         text not null unique,
  attiva_bool  boolean not null default true,
  pitch        text,
  prezzo_min   numeric(12,2),
  prezzo_max   numeric(12,2)
);

-- CATEGORY_RULES — categoria → ipotesi
create table if not exists category_rules (
  id                uuid primary key default gen_random_uuid(),
  categoria         text not null unique,
  linea_ipotizzata  text not null,
  aggancio_apertura text not null,
  priorita          priorita_t not null
);
