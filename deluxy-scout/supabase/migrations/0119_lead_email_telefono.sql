-- Deluxy Scout — 0119: la richiesta ha EMAIL e TELEFONO, due campi distinti.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0119_lead_email_telefono.sql
--
-- Segnalazione dell'utente (07/09/2026): «in lead non è possibile mettere campi
-- come telefono e mail».
--
-- Fin qui la richiesta aveva UN campo solo, `contatto` («email o telefono»), e
-- chi ne aveva due doveva sceglierne uno. Peggio: a valle il campo veniva
-- SPACCHETTATO a indovinare — «se contiene @ è una mail, altrimenti è un
-- telefono» — e quella riga era ricopiata in cinque punti (LeadCard, la tabella
-- di /lead, il foglio di lettura, QualificaLeadModal, qualificaLead). Con due
-- recapiti in mano se ne perdeva sempre uno, e il referente che nasce in
-- Anagrafiche alla qualifica partiva monco.
--
-- ⚠️ NESSUN BACKFILL, di proposito. L'euristica dell'@ è già quella che si usa
-- in LETTURA: materializzarla qui la trasformerebbe da ripiego dichiarato in
-- dato scritto, e un `contatto` come «chiamare Maria in negozio» diventerebbe
-- per sempre un numero di telefono. Le righe vecchie continuano a leggersi
-- esattamente come oggi (colonna esplicita → parser del messaggio → euristica
-- su `contatto`), ma il ripiego resta ripiego. `contatto` NON si tocca e resta
-- come è stato scritto: è la fonte delle richieste già in coda.
alter table leads add column if not exists email text;
alter table leads add column if not exists telefono text;

comment on column leads.email is
  'La mail di chi ci ha scritto, quando la sappiamo per davvero (scritta a mano o dal modulo del sito). NULL = non la sappiamo: si ripiega sul parser del messaggio e poi su `contatto`.';
comment on column leads.telefono is
  'Il telefono di chi ci ha scritto. NULL = non lo sappiamo: stesso ripiego di `email`. Vive separato perché una richiesta può avere entrambi i recapiti.';

comment on column leads.contatto is
  'STORICO (fino alla 0119): un recapito solo, email OPPURE telefono. Si legge ancora per le richieste vecchie; le nuove scrivono `email` e `telefono`.';
