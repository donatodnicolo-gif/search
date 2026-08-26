-- 0076 — LA RICHIESTA ANNULLATA (26/08/2026).
--
-- Richiesta dell'utente: nell'elenco delle richieste cliente si deve leggere lo
-- stato — «aperto, trasformato in ordine, perso, annullato (se cestino)».
--
-- Cioè: il cestino non cancella più, ANNULLA. Stessa scelta già fatta per le
-- trattative (0072), e per lo stesso motivo: una richiesta scritta per sbaglio
-- è comunque un fatto, e farla sparire toglie anche la possibilità di
-- accorgersi che capita spesso. Chi vuole cancellarla davvero lo può ancora
-- fare da lì.
alter table richieste_cliente drop constraint if exists richieste_cliente_stato_check;
alter table richieste_cliente add constraint richieste_cliente_stato_check
  check (stato in ('nuova', 'preventivo_inviato', 'concordata', 'in_ordine', 'fatturata', 'persa', 'annullata'));

comment on column richieste_cliente.stato is
  'nuova/preventivo_inviato/concordata = aperta · in_ordine = trasformata in ordine · fatturata · persa · annullata (cestino)';
