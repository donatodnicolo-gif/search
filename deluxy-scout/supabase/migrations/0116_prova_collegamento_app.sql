-- 0116 — LA SPUNTA VERDE DEVE DIRE LA VERITÀ (03/09/2026).
--
-- STORIA. In Profilo → Impostazioni → App collegate, la pillola «collegata»
-- diceva soltanto che un valore era stato incollato: mai che quel valore fosse
-- la chiave giusta, né che l'altra app rispondesse. Il commento nel codice lo
-- avvertiva già («è già successo: una chiave incollata, la spunta verde, e
-- l'app dall'altra parte che rispondeva 401»), ed è successo di nuovo — in
-- grande: nella riga `piattaforma` c'è un IBAN al posto della chiave, la
-- schermata dice «collegata» e la piattaforma consegne risponde 401 a ogni
-- richiesta. Segnalato dall'utente: «ma io lo vedo in impostazioni».
--
-- Il bottone «Prova il collegamento» c'era già, ma il suo esito viveva solo
-- nella schermata di chi l'aveva premuto: chiudi e non c'è più. Qui l'esito
-- diventa un fatto scritto, e la pillola lo legge.
--
-- ⚠️ L'esito si AZZERA quando la chiave cambia: una prova riuscita si riferisce
-- alla chiave che c'era in quel momento, e lasciarla addosso a una chiave nuova
-- vorrebbe dire ricominciare a mentire, solo in modo più credibile.
alter table chiavi_app add column if not exists provata_il timestamptz;
alter table chiavi_app add column if not exists prova_ok boolean;
alter table chiavi_app add column if not exists prova_dettaglio text;

comment on column chiavi_app.provata_il is
  'Quando il collegamento è stato provato per davvero (chiamata all''altra app). NULL = mai provato: la chiave c''è ma non sappiamo se vale.';
comment on column chiavi_app.prova_ok is
  'Esito dell''ultima prova: true = l''altra app ha risposto. NULL = mai provata.';
comment on column chiavi_app.prova_dettaglio is
  'Che cosa ha risposto l''altra app all''ultima prova (anche quando è andata male: «401 chiave non valida» dice cosa fare).';

-- La vista che la schermata legge: le chiavi non escono mai, l'esito sì.
create or replace view chiavi_app_stato as
  select app,
         url_base,
         note,
         aggiornato_il,
         chiave is not null and chiave <> '' as configurata,
         provata_il,
         prova_ok,
         prova_dettaglio
    from chiavi_app;
