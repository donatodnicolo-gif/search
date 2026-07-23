-- Deluxy Scout — 0038: la scoperta Google non crea più record in `places`.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (Management API).
--
-- Prima ogni giro di Mappa inseriva in `places` tutti i negozi trovati da Google:
-- migliaia di righe che nessuno aveva scelto. Da qui i negozi scoperti vivono in
-- questa cache; diventano un `places` vero solo quando una persona li prende
-- (stella dalla Mappa o bottone +), ed è quello che li fa entrare in Target.

create table if not exists google_negozi (
  google_place_id   text primary key,
  nome              text not null,
  indirizzo         text,
  lat               double precision not null,
  lng               double precision not null,
  categoria         text,
  google_types      text[],
  google_rating     numeric,
  google_reviews    integer,
  priorita          text,
  linea_ipotizzata  text,
  aggancio_apertura text,
  -- "non interessante" su un negozio mai preso: si segna qui, senza creare un place
  nascosto          boolean not null default false,
  scoperto_il       timestamptz not null default now(),
  refresh_at        timestamptz not null default now()
);

create index if not exists google_negozi_pos_ix on google_negozi (lat, lng);
create index if not exists google_negozi_nascosto_ix on google_negozi (nascosto);

alter table google_negozi enable row level security;

-- Dati operativi condivisi, come `places`: chi è autenticato legge e può
-- nascondere. La scrittura di massa la fa comunque la Edge Function (service role).
do $$ begin
  create policy google_negozi_select on google_negozi for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy google_negozi_update on google_negozi for update to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

comment on table google_negozi is
  'Cache dei negozi trovati da Google Places. Non sono target: lo diventano quando una persona li prende (allora nasce la riga in places, con creato_da).';
