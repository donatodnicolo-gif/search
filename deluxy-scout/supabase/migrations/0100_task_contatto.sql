-- Deluxy Scout — 0100: un CONTATTO collegato al task.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0100_task_contatto.sql
--
-- Richiesta dell'utente (28/08/2026): «consenti di collegare un contatto a una
-- task».
--
-- ⭐ **PERCHÉ UN RIFERIMENTO E NON IL NOME SCRITTO NEL TITOLO.** «Sentire
-- Marco» è un titolo: non dice quale Marco, non porta il suo numero, e fra un
-- mese nessuno sa chi richiamare. Con il riferimento il task sa a chi, e da lì
-- si arriva al telefono e alla mail senza cercarli in rubrica.
--
-- ⚠️ `on delete set null`: se il contatto viene cancellato il task RESTA. Un
-- promemoria che sparisce perché è sparita la persona è lavoro perso, e la cosa
-- da fare spesso resta anche quando cambia il referente.
alter table tasks add column if not exists contatto_id uuid references contacts(id) on delete set null;
create index if not exists tasks_contatto_ix on tasks (contatto_id) where contatto_id is not null;

comment on column tasks.contatto_id is
  'Il contatto della rubrica a cui il task si riferisce (chi chiamare/scrivere).';
