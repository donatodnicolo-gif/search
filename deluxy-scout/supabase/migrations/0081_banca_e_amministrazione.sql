-- 0081 — BANCA E CONTATTI AMMINISTRATIVI sul template (27/08/2026).
--
-- Richiesta dell'utente: «default anche le informazioni bancarie in
-- impostazioni e i contatti amministrativi».
--
-- Le impostazioni non hanno bisogno di DDL — `impostazioni` è una tabella
-- chiave/valore, e le chiavi nuove (`banca.*`, `amministrazione.*`) nascono
-- scrivendole. Qui servono solo i due campi che al TEMPLATE mancavano per
-- poterli stampare sul documento:
--   · la BANCA, perché l'IBAN da solo non dice a chi si sta bonificando;
--   · il BIC/SWIFT, che serve a un cliente estero e senza cui il bonifico non
--     parte da fuori area SEPA.
--
-- ⚠️ NON si scrive nessun valore: IBAN, BIC e recapiti dell'amministrazione non
-- li conosce il codice, e inventarli su un documento che va al cliente sarebbe
-- il peggior tipo di errore — plausibile e falso. Restano vuoti finché non li
-- scrive un amministratore da Impostazioni.
alter table template_documento add column if not exists banca text;
alter table template_documento add column if not exists bic text;

comment on column template_documento.banca is 'Istituto su cui è acceso il conto: l''IBAN da solo non dice a chi si bonifica.';
comment on column template_documento.bic is 'BIC/SWIFT: serve ai bonifici dall''estero.';
