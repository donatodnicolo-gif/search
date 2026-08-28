-- 0094 — I TEMPLATE NON SONO SOLO DELLE PRO-FORMA (27/08/2026).
--
-- Richiesta dell'utente: «rinomina template pro-forma in generico template e
-- consenti di creare anche ricevute».
--
-- L'intestazione — logo, ragione sociale, P. IVA, coordinate — è la stessa per
-- ogni documento che esce a nome dell'azienda. Quello che cambia da un tipo
-- all'altro è la DICITURA IN CALCE: su una pro-forma c'è la formula che dice
-- «questo non è una fattura» (art. 21 D.P.R. 633/72), su una ricevuta no —
-- anzi, scriverla su una ricevuta sarebbe falso.
--
-- ⚠️ Il default è `proforma`: le righe che ci sono già sono nate come template
-- di pro-forma, e lasciarle senza tipo vorrebbe dire non sapere più che cosa
-- intestano.
alter table template_documento add column if not exists tipo text not null default 'proforma'
  check (tipo in ('proforma', 'ricevuta', 'fattura'));

comment on column template_documento.tipo is
  'Che documento intesta: proforma | ricevuta | fattura. Cambia la dicitura di legge in calce, non i dati societari.';

-- ⚠️ Il «predefinito» va per TIPO, non uno per tutti: il predefinito delle
-- pro-forma e quello delle ricevute sono due cose diverse, e un solo indice
-- unico su (brand) avrebbe impedito di averne uno per ciascuno.
drop index if exists template_documento_predefinito_uix;
create unique index if not exists template_documento_predefinito_uix
  on template_documento (tipo, coalesce(brand, ''))
  where predefinito;
