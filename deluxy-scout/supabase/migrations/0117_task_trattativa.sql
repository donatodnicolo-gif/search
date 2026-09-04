-- Deluxy Scout — 0117: il task sa da quale TRATTATIVA è nato.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0117_task_trattativa.sql
--
-- Segnalazione dell'utente (04/09/2026): «nelle task che si creano anche da
-- trattative non si vedono i dettagli». Il task nato dalla «prossima attività»
-- di una trattativa (31/08) portava il negozio e una nota («Prossima attività
-- della trattativa «X» di Y»), ma nessuna schermata mostrava la nota — né la
-- tabella, né la scheda, né il foglio di modifica — e il legame con la
-- trattativa era solo quel testo: non si poteva aprirla.
--
-- ⭐ Un RIFERIMENTO, non un testo (stessa ragione della 0100 per il contatto):
-- da qui la riga del task dice di quale trattativa è e la apre.
-- ⚠️ on delete set null: se la trattativa sparisce il task RESTA.
alter table tasks add column if not exists deal_id uuid references deals(id) on delete set null;
create index if not exists tasks_deal_ix on tasks (deal_id) where deal_id is not null;

comment on column tasks.deal_id is
  'La trattativa da cui il task è nato (prossima attività, 31/08/2026) o a cui si riferisce.';

-- Recupero dei task già nati dalla prossima attività (18 al 04/09): si
-- agganciano SOLO se la trattativa candidata è UNA — stesso negozio e
-- next_action uguale al titolo. Contato prima di scrivere: 18 su 18 con un
-- candidato solo. Idempotente: tocca solo chi ha deal_id nullo.
update tasks t
   set deal_id = c.deal_id
  from (
    select t2.id as task_id,
           (select d.id from deals d where d.place_id = t2.place_id and d.next_action = t2.titolo) as deal_id
      from tasks t2
     where t2.deal_id is null
       and t2.note like 'Prossima attività della trattativa%'
       and (select count(*) from deals d where d.place_id = t2.place_id and d.next_action = t2.titolo) = 1
  ) c
 where c.task_id = t.id;
