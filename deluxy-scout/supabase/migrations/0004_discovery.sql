-- Deluxy Scout — 0004: scoperta negozi da Google + cache mensile + incrocio HubSpot
-- Idempotente. Applicare con scripts/mgmt-query.mjs (Management API) o supabase db push.

-- Estensione di `places` per i record scoperti da Google e i loro stati.
alter table places add column if not exists source              text not null default 'manual'; -- 'manual' | 'google'
alter table places add column if not exists google_place_id     text;
alter table places add column if not exists google_types        text[];
alter table places add column if not exists starred             boolean not null default false;  -- ⭐ interessante → giro
alter table places add column if not exists novita              boolean not null default false;  -- scoperto di recente
alter table places add column if not exists da_completare       boolean not null default false;  -- info visita incomplete
alter table places add column if not exists hubspot_deal_aperta boolean not null default false;  -- trattativa aperta rilevata
alter table places add column if not exists hubspot_sync_at     timestamptz;
alter table places add column if not exists google_refresh_at   timestamptz;

-- google_place_id univoco (per upsert/dedup), ma solo dove valorizzato (i manuali restano null).
create unique index if not exists places_google_place_id_ux on places (google_place_id) where google_place_id is not null;
create index if not exists places_flag_ix on places (starred, da_completare);

-- Cache per area: evita di richiamare Google se la zona è stata aggiornata da poco (< 30 giorni).
create table if not exists google_aree (
  cella       text primary key,            -- griglia ~100 m: round(lat,3)||','||round(lng,3)
  centro_lat  double precision not null,
  centro_lng  double precision not null,
  refresh_at  timestamptz not null default now()
);
-- Solo la Edge Function (service_role) la tocca: RLS attiva senza policy = nessun accesso client.
alter table google_aree enable row level security;

-- Attività vicine a un punto (raggio in metri), ordinate per distanza. Usa l'indice GIST.
create or replace function places_vicini(p_lat double precision, p_lng double precision, p_raggio integer default 300)
returns setof places
language sql
stable
as $$
  select *
  from places
  where st_dwithin(geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_raggio)
  order by geo <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
$$;
