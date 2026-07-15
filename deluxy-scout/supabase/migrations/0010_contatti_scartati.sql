-- Deluxy Scout — 0010: contatti HubSpot marcati "non pertinenti" per un negozio,
-- da non riproporre più nella conciliazione.
create table if not exists contatti_scartati (
  place_id           uuid not null references places(id) on delete cascade,
  hubspot_contact_id text not null,
  created_at         timestamptz not null default now(),
  primary key (place_id, hubspot_contact_id)
);
alter table contatti_scartati enable row level security;
do $$ begin
  create policy cs_all on contatti_scartati for all to authenticated using (true) with check (true);
exception when duplicate_object then null; end $$;
