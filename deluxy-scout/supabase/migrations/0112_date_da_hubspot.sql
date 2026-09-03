-- 0112 — LE DATE VERE DI HUBSPOT nello specchio (31/08/2026, richiesta
-- dell'utente: «metti le date di hubspot»).
--
-- STORIA. Lo specchio `hubspot_deals` teneva nome, fase, valore, linea e
-- `synced_at` — cioè quando la COPIA è stata aggiornata. Delle date del deal
-- non c'era niente: nell'elenco Trattative le colonne «Aperta» e «Scadenza»
-- restavano vuote su ogni riga che viene dal CRM, e la data che si vedeva
-- altrove (`created_at` della riga Scout) era il giorno in cui la copia era
-- nata qui. Su Papera Flowers diceva «creata oggi» una trattativa che su
-- HubSpot esiste da prima: la data c'era, ma non era la sua.
--
-- Due colonne, dai due campi standard di HubSpot:
--   · `creata_il` ← `createdate`, quando il deal è nato NEL CRM;
--   · `chiusa_il` ← `closedate`, che su HubSpot fa doppio servizio: su un deal
--     APERTO è la data di chiusura ATTESA (una scadenza), su uno chiuso è
--     quando è stato chiuso davvero. Si tiene un campo solo perché è un campo
--     solo di là — a interpretarlo ci pensa chi legge, e lo dichiara.
--
-- ⚠️ NULL = HubSpot non l'ha data (o lo specchio è più vecchio di questa
-- migrazione): si riempiono al primo `sync_crm`, che gira ogni notte alle
-- 04:00 e si può lanciare a mano.
alter table hubspot_deals add column if not exists creata_il timestamptz;
alter table hubspot_deals add column if not exists chiusa_il timestamptz;

comment on column hubspot_deals.creata_il is
  'HubSpot `createdate`: quando il deal è nato NEL CRM. ⚠️ Diverso da synced_at, che è quando questa copia è stata aggiornata.';
comment on column hubspot_deals.chiusa_il is
  'HubSpot `closedate`: su un deal aperto è la chiusura ATTESA (scadenza), su uno chiuso è quando è stato chiuso.';
