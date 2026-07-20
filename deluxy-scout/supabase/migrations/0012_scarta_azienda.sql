-- Deluxy Scout — 0012: l'operatore può rifiutare TUTTA l'associazione azienda↔negozio.
-- (non solo i singoli contatti). L'azienda scartata non viene più riproposta per quel negozio.

create table if not exists aziende_scartate (
  place_id           uuid not null references places(id) on delete cascade,
  hubspot_company_id text not null,
  created_at         timestamptz not null default now(),
  primary key (place_id, hubspot_company_id)
);
alter table aziende_scartate enable row level security;
do $$ begin
  create policy az_all on aziende_scartate for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;

-- Normalizzazione nome: aggiunge parole generiche di tipologia (ristorante/hotel/bar…)
-- per ridurre i falsi match come "Acqua Pazza Ristorante" ↔ "Acquolina Ristorante".
create or replace function norm_nome(t text)
returns text
language sql
immutable
as $$
  select btrim(regexp_replace(
    regexp_replace(
      lower(coalesce(t, '')),
      '\y(milano|milan|montenapoleone|monte|napoleone|boutique|flagship|store|the|srl|spa|ristorante|ristoranti|hotel|cafe|caffe|bar|milano)\y',
      ' ', 'g'
    ),
    '\s+', ' ', 'g'
  ));
$$;

-- abbina_place_hubspot: esclude le aziende scartate per quel negozio.
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
  from cerca_azienda_hubspot(v_nome, v_indirizzo, 5)
  where somiglianza >= p_soglia
    and hubspot_id not in (select hubspot_company_id from aziende_scartate where place_id = p_place_id)
  order by somiglianza desc
  limit 1;

  update places set
    hubspot_company_id  = v_comp,
    hubspot_ha_contatto = coalesce((select true from hubspot_contacts where company_hubspot_id = v_comp limit 1), false),
    hubspot_deal_aperta = coalesce((select true from hubspot_deals where company_hubspot_id = v_comp and aperta limit 1), false),
    hubspot_sync_at     = now()
  where id = p_place_id;
end;
$$;
