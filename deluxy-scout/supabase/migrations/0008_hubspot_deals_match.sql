-- Deluxy Scout — 0008: trattative HubSpot in copia locale + abbinamento per affinità
-- che marca i negozi con "ha contatto" / "ha trattativa aperta" (per le icone in mappa).

-- Trattative (deals) HubSpot, associate all'azienda.
create table if not exists hubspot_deals (
  hubspot_id         text primary key,
  company_hubspot_id text,
  nome               text,
  fase               text,
  valore             numeric,
  aperta             boolean not null default true,
  synced_at          timestamptz not null default now()
);
create index if not exists hs_deals_company on hubspot_deals (company_hubspot_id);
alter table hubspot_deals enable row level security;
do $$ begin
  create policy hs_deals_read on hubspot_deals for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Flag "ha un contatto attivo" sul negozio (la trattativa usa il già presente hubspot_deal_aperta).
alter table places add column if not exists hubspot_ha_contatto boolean not null default false;

-- Abbina UN negozio alla migliore azienda HubSpot (per affinità nome/indirizzo) e setta i flag.
create or replace function abbina_place_hubspot(p_place_id uuid, p_soglia real default 0.32)
returns void
language plpgsql
as $$
declare
  v_nome text;
  v_indirizzo text;
  v_comp text;
begin
  select nome, indirizzo into v_nome, v_indirizzo from places where id = p_place_id;
  if v_nome is null then return; end if;

  select hubspot_id into v_comp
  from cerca_azienda_hubspot(v_nome, v_indirizzo, 1)
  where somiglianza >= p_soglia
  limit 1;

  update places set
    hubspot_company_id  = v_comp,
    hubspot_ha_contatto = coalesce((select true from hubspot_contacts where company_hubspot_id = v_comp limit 1), false),
    hubspot_deal_aperta = coalesce((select true from hubspot_deals where company_hubspot_id = v_comp and aperta limit 1), false),
    hubspot_sync_at     = now()
  where id = p_place_id;
end;
$$;

-- Abbina tutti i negozi vicini a un punto (usato dalla scoperta) o l'intero DB.
create or replace function abbina_places_vicini(p_lat double precision, p_lng double precision, p_raggio integer default 400, p_soglia real default 0.32)
returns void
language plpgsql
as $$
declare r record;
begin
  for r in
    select id from places
    where st_dwithin(geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_raggio)
      and not coalesce(nascosto, false)
  loop
    perform abbina_place_hubspot(r.id, p_soglia);
  end loop;
end;
$$;
