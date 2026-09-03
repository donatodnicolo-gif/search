-- 0111 — LE SCADENZE DELL'ORDINE: la % dell'acconto e il pagamento
-- (31/08/2026, richiesta dell'utente: «nella creazione degli ordini nel form
-- metti le date di scadenza delle % dell'ordine e della data di pagamento»).
--
-- STORIA. L'acconto in percentuale c'era dal 26/08 (`acconto_percento`), ma
-- senza un GIORNO: si sapeva che si voleva il 30% e non entro quando. La
-- richiesta di pagamento nasceva con due rate — acconto e saldo — e nessuna
-- delle due aveva scadenza, quindi «in ritardo» non si poteva calcolare e
-- l'unico modo di accorgersi di un incasso fermo era ricordarselo.
--
-- Due colonne, due domande diverse:
--   · `acconto_scadenza`   → entro quando va pagata la percentuale d'acconto;
--   · `pagamento_scadenza` → entro quando va pagato il resto. Senza acconto è
--     la scadenza unica dell'ordine, ed è «la data di pagamento» attesa.
--
-- ⚠️ NON si confondono con `incassato_il`, che è il giorno in cui il denaro è
-- ARRIVATO. Attesa e fatto sono due fatti diversi: tenerli nella stessa
-- colonna vorrebbe dire non poter più dire «questo è in ritardo».
--
-- ⚠️ NULL = «non concordata», non «oggi» e non «subito»: un ordine senza
-- scadenza scritta non è un ordine scaduto.
alter table ordini add column if not exists acconto_scadenza date;
alter table ordini add column if not exists pagamento_scadenza date;

comment on column ordini.acconto_scadenza is
  'Entro quando va pagato l''acconto (la percentuale in acconto_percento). NULL = non concordata.';
comment on column ordini.pagamento_scadenza is
  'Entro quando va pagato il saldo; senza acconto è la scadenza dell''intero ordine. NULL = non concordata.';

-- Serve alla domanda «cosa è scaduto e non è ancora incassato», che è l'unica
-- ragione per cui queste due colonne esistono.
create index if not exists ordini_scadenze_ix
  on ordini (pagamento_scadenza) where stato = 'da_incassare';
