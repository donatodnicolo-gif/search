-- Deluxy Scout — 0005: attività "non interessanti" nascoste per sempre.
-- Idempotente.

alter table places add column if not exists nascosto boolean not null default false;
create index if not exists places_nascosto_ix on places (nascosto);

-- La scoperta (places_vicini) NON deve più restituire i nascosti.
create or replace function places_vicini(p_lat double precision, p_lng double precision, p_raggio integer default 300)
returns setof places
language sql
stable
as $$
  select *
  from places
  where st_dwithin(geo, st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography, p_raggio)
    and not coalesce(nascosto, false)
  order by geo <-> st_setsrid(st_makepoint(p_lng, p_lat), 4326)::geography;
$$;
