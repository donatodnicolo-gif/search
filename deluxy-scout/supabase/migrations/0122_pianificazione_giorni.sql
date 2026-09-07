-- Deluxy Scout — 0122: la settimana GIORNO PER GIORNO del commerciale.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (Management API).
--
-- Richiesta dell'utente del 07/09/2026: per ogni giorno della settimana le
-- attività (visite, chiamate, appuntamenti, ufficio), anche su più giorni,
-- solo per questa settimana oppure ogni settimana; per le visite le STRADE da
-- battere, da aprire in Google Maps; e in Oggi il «Piano di oggi».
--
-- ⚠️ NON è `pianificazioni_commerciali` (migr. 0106/0107): quella è il piano
-- della SQUADRA per settimana × linea — cosa vogliamo chiudere, quanti clienti,
-- scritto dal responsabile. Questa è l'agenda di CHI VA SUL TERRITORIO — dove
-- vado martedì. Le due stanno una sotto l'altra nella stessa schermata
-- (Pianificazione) e nessuna delle due si deduce dall'altra.
--
-- Una riga = un'attività in un giorno. `settimana` (il lunedì) la fissa a una
-- settimana precisa; NULL = si ripete ogni settimana. Un'attività «su più
-- giorni» sono più righe, una per giorno (`gruppo` le tiene insieme).

create table if not exists pianificazione_giorni (
  id               uuid primary key default gen_random_uuid(),
  owner            uuid not null references auth.users(id) on delete cascade default auth.uid(),
  giorno_settimana smallint not null check (giorno_settimana between 1 and 7), -- 1 = lunedì … 7 = domenica
  settimana        date,                                                        -- lunedì; NULL = ogni settimana
  tipo             text not null default 'visita'
                   check (tipo in ('visita', 'chiamate', 'appuntamento', 'ufficio', 'altro')),
  titolo           text not null,
  strade           text[] not null default '{}',                               -- le vie da battere (tipo = visita)
  zona             text,
  note             text,
  gruppo           uuid,                                                        -- le righe nate insieme (più giorni)
  ordine           smallint not null default 0,
  created_at       timestamptz not null default now()
);

alter table pianificazione_giorni enable row level security;

-- Scout è un'app di SQUADRA (lezione dei task, 31/08/2026): il piano di un
-- collega si LEGGE — serve a chi coordina e a chi deve sapere dov'è l'altro.
-- Si scrive solo il proprio; l'amministratore può correggere quello di tutti.
drop policy if exists piano_giorni_select on pianificazione_giorni;
create policy piano_giorni_select on pianificazione_giorni for select to authenticated using (true);
drop policy if exists piano_giorni_insert on pianificazione_giorni;
create policy piano_giorni_insert on pianificazione_giorni for insert to authenticated
  with check (owner = auth.uid());
drop policy if exists piano_giorni_update on pianificazione_giorni;
create policy piano_giorni_update on pianificazione_giorni for update to authenticated
  using (owner = auth.uid() or is_admin()) with check (owner = auth.uid() or is_admin());
drop policy if exists piano_giorni_delete on pianificazione_giorni;
create policy piano_giorni_delete on pianificazione_giorni for delete to authenticated
  using (owner = auth.uid() or is_admin());

create index if not exists piano_giorni_owner_ix on pianificazione_giorni (owner, settimana, giorno_settimana, ordine);

grant select, insert, update, delete on pianificazione_giorni to authenticated;

comment on table pianificazione_giorni is 'L''agenda settimanale del commerciale: un''attività per riga e per giorno. settimana = lunedì (NULL = ricorrente). Diversa da pianificazioni_commerciali (piano della squadra per linea).';
