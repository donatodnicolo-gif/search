-- Deluxy Scout — Row Level Security
--
-- Modello: il territorio è condiviso dal Team Commerciale (regola di prodotto #1:
-- la mappa mostra TUTTE le attività). Quindi ogni utente AUTENTICATO legge/scrive
-- i dati condivisi; visite e deal restano attribuiti al loro `owner` per la
-- dashboard per-venditore. Nessun accesso agli anonimi.

alter table places         enable row level security;
alter table contacts       enable row level security;
alter table visits         enable row level security;
alter table deals          enable row level security;
alter table lines          enable row level security;
alter table category_rules enable row level security;

-- Helper: policy "solo autenticati" per tabelle condivise
-- PLACES
drop policy if exists places_auth_all on places;
create policy places_auth_all on places
  for all to authenticated using (true) with check (true);

-- CONTACTS
drop policy if exists contacts_auth_all on contacts;
create policy contacts_auth_all on contacts
  for all to authenticated using (true) with check (true);

-- LINES (lettura per tutti gli autenticati; scrittura idem — pochi record di config)
drop policy if exists lines_auth_all on lines;
create policy lines_auth_all on lines
  for all to authenticated using (true) with check (true);

-- CATEGORY_RULES
drop policy if exists category_rules_auth_all on category_rules;
create policy category_rules_auth_all on category_rules
  for all to authenticated using (true) with check (true);

-- VISITS — tutti gli autenticati leggono (dashboard di team); l'insert stampa
-- l'owner corrente; modifica/cancellazione solo del proprio record.
drop policy if exists visits_select on visits;
create policy visits_select on visits
  for select to authenticated using (true);

drop policy if exists visits_insert on visits;
create policy visits_insert on visits
  for insert to authenticated with check (owner = auth.uid() or owner is null);

drop policy if exists visits_update_own on visits;
create policy visits_update_own on visits
  for update to authenticated using (owner = auth.uid()) with check (owner = auth.uid());

drop policy if exists visits_delete_own on visits;
create policy visits_delete_own on visits
  for delete to authenticated using (owner = auth.uid());

-- DEALS — stessa logica delle visite.
drop policy if exists deals_select on deals;
create policy deals_select on deals
  for select to authenticated using (true);

drop policy if exists deals_write on deals;
create policy deals_write on deals
  for all to authenticated
  using (owner = auth.uid() or owner is null)
  with check (owner = auth.uid() or owner is null);

-- STORAGE — bucket "vetrine" per le foto delle visite.
insert into storage.buckets (id, name, public)
values ('vetrine', 'vetrine', true)
on conflict (id) do nothing;

drop policy if exists vetrine_read on storage.objects;
create policy vetrine_read on storage.objects
  for select to authenticated using (bucket_id = 'vetrine');

drop policy if exists vetrine_write on storage.objects;
create policy vetrine_write on storage.objects
  for insert to authenticated with check (bucket_id = 'vetrine');

drop policy if exists vetrine_update on storage.objects;
create policy vetrine_update on storage.objects
  for update to authenticated using (bucket_id = 'vetrine');
