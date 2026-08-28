-- Deluxy Scout — 0099: LA RICHIESTA DI EVASIONE di un ordine chiuso.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0099_richiesta_evasione.sql
--
-- Richiesta dell'utente (28/08/2026): «metti richiesta evasione di un ordine
-- dopo la chiusura che manda all'app delivery le informazioni per
-- l'inserimento».
--
-- ⭐ **PERCHÉ «LE INFORMAZIONI» E NON LA CONSEGNA GIÀ CREATA.** La piattaforma
-- ha la rotta per crearla (`POST /app/consegne`, con chiave di SCRITTURA), ma
-- pretende dati che un ordine Scout non ha: la data del servizio, l'indirizzo
-- del destinatario, il tipo di servizio del suo catalogo. Inventarli sarebbe
-- il modo più veloce di far partire un valet nel posto sbagliato. Qui si
-- CHIEDONO a chi la richiesta la fa, e si consegnano a chi inserisce.
--
-- ⚠️ Si tiene anche COSA è stato chiesto (`evasione_dati`), non solo quando:
-- senza, alla domanda «che indirizzo avevamo mandato?» si può solo rispondere
-- «guarda nella tua posta».
alter table ordini add column if not exists evasione_richiesta_il timestamptz;
alter table ordini add column if not exists evasione_dati jsonb;

comment on column ordini.evasione_richiesta_il is
  'Quando è stata mandata alle consegne la richiesta di evasione.';
comment on column ordini.evasione_dati is
  'Cosa conteneva la richiesta (data, indirizzo, destinatario, note): la copia di quello che è stato mandato.';

-- A chi arriva la richiesta. ⚠️ Nasce VUOTA di proposito: un indirizzo
-- inventato è una richiesta che non arriva a nessuno e nessuno se ne accorge.
-- Finché è vuota la funzione manda a tutta la squadra e lo DICE nella mail.
insert into impostazioni (chiave, valore)
values ('mail.casella_consegne', '')
on conflict (chiave) do nothing;
