-- Deluxy Scout — 0042: le Richieste Web arrivano anche dalla posta.
-- Idempotente. Applicare con scripts/mgmt-query.mjs.
--
-- Le mail che arrivano alla casella commerciale (commerciale@deluxy.it) sono
-- richieste a tutti gli effetti: si importano come lead. `mail_id` è il
-- Message-ID della mail e serve solo a NON importarla due volte.

alter table leads add column if not exists mail_id text;

create unique index if not exists leads_mail_id_uix on leads (mail_id) where mail_id is not null;

comment on column leads.mail_id is 'Message-ID della mail di origine: evita di reimportare la stessa richiesta.';
