-- Pianificazione settimanale del commerciale: singole attività per giorno della
-- settimana. Una riga = un'attività in un giorno; `settimana` (lunedì) la lega a
-- una settimana precisa, NULL = si ripete ogni settimana. Per le visite si
-- indicano le strade da battere quel giorno.
create table if not exists pianificazione (
  id               uuid primary key default gen_random_uuid(),
  owner            uuid not null references auth.users(id) on delete cascade default auth.uid(),
  giorno_settimana smallint not null check (giorno_settimana between 1 and 7), -- 1 = lunedì … 7 = domenica
  settimana        date,                                                        -- lunedì della settimana; NULL = ogni settimana
  tipo             text not null default 'visita'
                   check (tipo in ('visita', 'chiamate', 'appuntamento', 'ufficio', 'altro')),
  titolo           text not null,
  strade           text[] not null default '{}',                               -- solo per tipo = visita
  zona             text,
  note             text,
  ordine           smallint not null default 0,
  created_at       timestamptz not null default now()
);

alter table pianificazione enable row level security;

-- Ognuno vede e gestisce il proprio piano; l'admin vede il piano di tutti.
drop policy if exists piano_select on pianificazione;
create policy piano_select on pianificazione for select to authenticated
  using (owner = auth.uid() or (auth.jwt() ->> 'email') = 'nicolo.donato@deluxy.it');
drop policy if exists piano_insert on pianificazione;
create policy piano_insert on pianificazione for insert to authenticated
  with check (owner = auth.uid());
drop policy if exists piano_update on pianificazione;
create policy piano_update on pianificazione for update to authenticated
  using (owner = auth.uid()) with check (owner = auth.uid());
drop policy if exists piano_delete on pianificazione;
create policy piano_delete on pianificazione for delete to authenticated
  using (owner = auth.uid());

create index if not exists piano_owner_ix on pianificazione (owner, settimana, giorno_settimana, ordine);
