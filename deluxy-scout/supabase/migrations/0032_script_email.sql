-- "Script": i testi pronti delle email (prospezione, follow-up, ecc.) che il
-- team riusa per scrivere ai contatti. Sono una LIBRERIA CONDIVISA: tutti i
-- venditori li leggono; li modifica/elimina chi li ha creati (o l'admin).
create table if not exists script_email (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  titolo text not null,
  tipo text not null default 'prospezione', -- prospezione | follow_up | avviso | altro
  oggetto text,                              -- oggetto dell'email
  corpo text not null,                       -- testo, con segnaposto {nome} {negozio}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table script_email enable row level security;

-- Lettura: libreria condivisa a tutti gli autenticati.
drop policy if exists script_email_read on script_email;
create policy script_email_read on script_email for select to authenticated using (true);

-- Scrittura: solo il creatore (o l'admin della rete).
drop policy if exists script_email_insert on script_email;
create policy script_email_insert on script_email for insert to authenticated
  with check (owner = auth.uid());

drop policy if exists script_email_update on script_email;
create policy script_email_update on script_email for update to authenticated
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'nicolo.donato@deluxy.it');

drop policy if exists script_email_delete on script_email;
create policy script_email_delete on script_email for delete to authenticated
  using (owner = auth.uid() or auth.jwt() ->> 'email' = 'nicolo.donato@deluxy.it');
