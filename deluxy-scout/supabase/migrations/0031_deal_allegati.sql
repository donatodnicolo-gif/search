-- Link e documenti allegati a una trattativa (es. la presentazione fatta per
-- quel cliente). `deal_key` è testo perché la trattativa può essere Scout
-- (uuid di `deals`) oppure solo HubSpot (`hs_<id>`): stessa lista in entrambi i casi.
create table if not exists deal_allegati (
  id         uuid primary key default gen_random_uuid(),
  deal_key   text not null,
  tipo       text not null check (tipo in ('link', 'file')),
  titolo     text not null,
  url        text not null,           -- link esterno oppure URL pubblico del file
  path       text,                    -- percorso nel bucket `allegati` (solo tipo = file)
  owner      uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table deal_allegati enable row level security;

-- Le trattative sono condivise dal team: tutti vedono gli allegati; chi li ha
-- caricati (o l'admin) può rimuoverli.
drop policy if exists allegati_select on deal_allegati;
create policy allegati_select on deal_allegati for select to authenticated using (true);
drop policy if exists allegati_insert on deal_allegati;
create policy allegati_insert on deal_allegati for insert to authenticated with check (owner = auth.uid());
drop policy if exists allegati_delete on deal_allegati;
create policy allegati_delete on deal_allegati for delete to authenticated
  using (owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it');

create index if not exists allegati_deal_ix on deal_allegati (deal_key, created_at);

-- STORAGE — bucket "allegati" per i documenti delle trattative (stesso schema di "vetrine").
insert into storage.buckets (id, name, public)
values ('allegati', 'allegati', true)
on conflict (id) do nothing;

drop policy if exists allegati_read on storage.objects;
create policy allegati_read on storage.objects
  for select to authenticated using (bucket_id = 'allegati');
drop policy if exists allegati_write on storage.objects;
create policy allegati_write on storage.objects
  for insert to authenticated with check (bucket_id = 'allegati');
drop policy if exists allegati_delete_obj on storage.objects;
create policy allegati_delete_obj on storage.objects
  for delete to authenticated using (bucket_id = 'allegati');
