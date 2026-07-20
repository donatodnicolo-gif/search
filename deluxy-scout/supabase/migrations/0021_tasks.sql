-- Tasklist personale del venditore: promemoria/attività con priorità e scadenza.
-- Privata: ogni utente vede e gestisce solo i propri task (RLS owner-only).
create table if not exists tasks (
  id            uuid primary key default gen_random_uuid(),
  owner         uuid not null references auth.users(id) on delete cascade default auth.uid(),
  titolo        text not null,
  note          text,
  priorita      text not null default 'P2' check (priorita in ('P1', 'P2', 'P3')),
  scadenza      date,
  completata    boolean not null default false,
  place_id      uuid references places(id) on delete set null,
  created_at    timestamptz not null default now(),
  completata_at timestamptz
);

alter table tasks enable row level security;

drop policy if exists tasks_owner on tasks;
create policy tasks_owner on tasks for all to authenticated
  using (owner = auth.uid())
  with check (owner = auth.uid());

create index if not exists tasks_owner_idx on tasks (owner, completata, scadenza);
