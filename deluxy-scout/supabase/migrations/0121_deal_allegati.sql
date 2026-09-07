-- Deluxy Scout — 0121: documenti e link allegati a una trattativa.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (Management API).
--
-- Richiesta dell'utente del 07/09/2026: alla trattativa si allegano documenti
-- (la presentazione fatta per quel cliente, il preventivo mandato) e link.
--
-- `deal_key` è TESTO e non una foreign key: la trattativa può essere di Scout
-- (uuid di `deals`) oppure vivere solo nella copia di HubSpot (`hs_<id>`), e
-- l'elenco deve funzionare in tutti e due i casi. ⚠️ Corollario: cancellando
-- una trattativa gli allegati NON spariscono da soli — chi la cancella li
-- lascia orfani. La cancellazione vera di una trattativa è già un caso raro e
-- confermato (solo dalle Annullate).

create table if not exists deal_allegati (
  id         uuid primary key default gen_random_uuid(),
  deal_key   text not null,
  tipo       text not null check (tipo in ('link', 'file')),
  titolo     text not null,
  url        text not null,   -- il link esterno (tipo = link) oppure il percorso nel bucket (tipo = file)
  path       text,            -- percorso nel bucket `allegati` (solo tipo = file)
  owner      uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

alter table deal_allegati enable row level security;

-- Le trattative sono della squadra: tutti vedono gli allegati. Li toglie chi
-- li ha messi, o l'amministratore (is_admin(), migr. 0085).
drop policy if exists allegati_select on deal_allegati;
create policy allegati_select on deal_allegati for select to authenticated using (true);
drop policy if exists allegati_insert on deal_allegati;
create policy allegati_insert on deal_allegati for insert to authenticated with check (owner = auth.uid());
drop policy if exists allegati_delete on deal_allegati;
create policy allegati_delete on deal_allegati for delete to authenticated
  using (owner = auth.uid() or is_admin());

create index if not exists allegati_deal_ix on deal_allegati (deal_key, created_at);

grant select, insert, delete on deal_allegati to authenticated;

-- STORAGE — bucket `allegati`, PRIVATO. Diverso da `vetrine` (pubblico, punto
-- aperto dall'audit del 24/08): qui dentro finiscono presentazioni e
-- preventivi fatti per un cliente, e un URL indovinabile non deve aprirli.
-- L'app li apre con un URL firmato a scadenza (createSignedUrl).
insert into storage.buckets (id, name, public)
values ('allegati', 'allegati', false)
on conflict (id) do nothing;

drop policy if exists allegati_obj_read on storage.objects;
create policy allegati_obj_read on storage.objects
  for select to authenticated using (bucket_id = 'allegati');
drop policy if exists allegati_obj_write on storage.objects;
create policy allegati_obj_write on storage.objects
  for insert to authenticated with check (bucket_id = 'allegati');
drop policy if exists allegati_obj_delete on storage.objects;
create policy allegati_obj_delete on storage.objects
  for delete to authenticated using (bucket_id = 'allegati' and (owner = auth.uid() or is_admin()));
