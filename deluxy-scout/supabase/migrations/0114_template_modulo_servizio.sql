-- 0114 — «MODULO DI SERVIZIO» fra i tipi di template (03/09/2026, richiesta
-- dell'utente: «in template documenti aggiungi come tipologia modulo di
-- servizio»).
--
-- STORIA. La colonna `tipo` (migr. 0094) ammetteva tre valori: proforma,
-- ricevuta, fattura. Il vincolo è un elenco chiuso — ed è giusto che lo sia,
-- perché il tipo decide la dicitura di legge in calce — quindi un valore nuovo
-- si aggiunge qui, non a schermo: senza questa migrazione l'app avrebbe
-- mostrato il chip e il salvataggio sarebbe stato rifiutato dal database.
--
-- ⚠️ Il tipo NON cambia i dati societari (sono gli stessi per tutti): cambia
-- che cosa si scrive sotto. Sul modulo di servizio la formula della pro-forma
-- («questo non è una fattura») sarebbe fuori posto — la toglie l'app quando si
-- passa di tipo.
alter table template_documento drop constraint if exists template_documento_tipo_check;
alter table template_documento add constraint template_documento_tipo_check
  check (tipo in ('proforma', 'ricevuta', 'fattura', 'modulo_servizio'));

comment on column template_documento.tipo is
  'Che documento intesta: proforma | ricevuta | fattura | modulo_servizio. Decide la dicitura in calce, non i dati societari.';
