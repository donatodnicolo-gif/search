-- Deluxy Scout — 0014: profili utente (per attribuire visite/deal a un nome).
-- Il client non può leggere auth.users; questa tabella espone id→email/nome ai
-- soli autenticati, così la dashboard di Team mostra chi ha fatto cosa.

create table if not exists profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text,
  nome       text,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated using (true);
-- Ognuno può aggiornare il PROPRIO nome (l'admin i propri; i nomi si possono
-- anche gestire lato DB). Nessun insert/delete dal client: ci pensa il trigger.
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- Backfill degli utenti già esistenti (nome = parte prima della @, se assente).
insert into profiles (id, email, nome)
select id, email, coalesce(nullif(raw_user_meta_data->>'nome', ''), split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;

-- Nuovi utenti: popola il profilo automaticamente alla creazione.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, nome)
  values (new.id, new.email, coalesce(nullif(new.raw_user_meta_data->>'nome', ''), split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
