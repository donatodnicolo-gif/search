-- Trattative: priorità P0-P3 (P0 = più importante), link di riferimento e
-- motivo di chiusura (obbligatorio quando la trattativa viene chiusa vinta/persa).
alter table deals add column if not exists priorita text not null default 'P2'
  check (priorita in ('P0', 'P1', 'P2', 'P3'));
alter table deals add column if not exists link text;
alter table deals add column if not exists motivo_chiusura text;
alter table deals add column if not exists chiusa_at timestamptz;
create index if not exists deals_priorita_ix on deals (priorita, fase);

-- Le stesse informazioni "locali" anche per le trattative che vivono solo nella
-- copia CRM HubSpot (hubspot_deals): l'app può scriverle SOLO su queste colonne
-- (grant a livello di colonna), il resto della riga resta del sync notturno.
alter table hubspot_deals add column if not exists priorita text not null default 'P2'
  check (priorita in ('P0', 'P1', 'P2', 'P3'));
alter table hubspot_deals add column if not exists link text;
alter table hubspot_deals add column if not exists motivo_chiusura text;
grant update (priorita, link, motivo_chiusura) on hubspot_deals to authenticated;
do $$ begin
  create policy hs_deals_update_locale on hubspot_deals for update to authenticated
    using (true) with check (true);
exception when duplicate_object then null; end $$;
