-- Deluxy Scout — 0006: copia locale del CRM HubSpot (aziende + contatti) per la
-- riconciliazione veloce coi negozi scoperti. Popolata dalla Edge Function (sync_crm).
create extension if not exists pg_trgm; -- match fuzzy per nome/indirizzo

create table if not exists hubspot_companies (
  hubspot_id text primary key,
  nome       text,
  indirizzo  text,
  citta      text,
  cap        text,
  dominio    text,
  telefono   text,
  synced_at  timestamptz not null default now()
);
create index if not exists hs_companies_nome_trgm on hubspot_companies using gin (nome gin_trgm_ops);
create index if not exists hs_companies_addr_trgm on hubspot_companies using gin (indirizzo gin_trgm_ops);

create table if not exists hubspot_contacts (
  hubspot_id         text primary key,
  company_hubspot_id text,
  nome               text,
  email              text,
  telefono           text,
  ruolo              text,
  synced_at          timestamptz not null default now()
);
create index if not exists hs_contacts_company on hubspot_contacts (company_hubspot_id);

alter table hubspot_companies enable row level security;
alter table hubspot_contacts enable row level security;
-- Lettura per utenti autenticati (l'app cerca i match); scrittura solo service_role (Edge Function).
do $$ begin
  create policy hs_companies_read on hubspot_companies for select to authenticated using (true);
exception when duplicate_object then null; end $$;
do $$ begin
  create policy hs_contacts_read on hubspot_contacts for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Match: aziende HubSpot simili per nome o indirizzo (trigram), ordinate per somiglianza.
create or replace function cerca_azienda_hubspot(p_nome text, p_indirizzo text default null, p_limit int default 5)
returns table (hubspot_id text, nome text, indirizzo text, citta text, dominio text, telefono text, somiglianza real)
language sql
stable
as $$
  select c.hubspot_id, c.nome, c.indirizzo, c.citta, c.dominio, c.telefono,
         greatest(
           similarity(coalesce(c.nome, ''), coalesce(p_nome, '')),
           case when p_indirizzo is not null and p_indirizzo <> ''
                then similarity(coalesce(c.indirizzo, ''), p_indirizzo) else 0 end
         ) as somiglianza
  from hubspot_companies c
  where (p_nome is not null and c.nome % p_nome)
     or (p_indirizzo is not null and p_indirizzo <> '' and c.indirizzo % p_indirizzo)
  order by somiglianza desc
  limit p_limit;
$$;
