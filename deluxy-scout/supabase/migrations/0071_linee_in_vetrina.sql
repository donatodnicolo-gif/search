-- 0071 — QUALI LINEE COMPAIONO NELLA VETRINA DEL PARTNER (26/08/2026).
--
-- Richiesta dell'utente: «crea una sezione dove si può decidere quali linee far
-- comparire in deluxy-delivery.vercel.app/home attraverso dei flag da attivare».
--
-- ⚠️ Non si riusa `attiva_bool`, e il motivo è che sono DUE domande diverse:
--   · `attiva_bool`  = la linea è viva commercialmente (la si può scegliere su
--     un negozio, entra nei filtri, si può aprirci una trattativa);
--   · `in_vetrina`   = la si offre ai partner nella loro casa, come servizio
--     richiedibile con un preventivo.
-- Una linea può essere viva e non stare in vetrina (per esempio «Magazzino»,
-- che è un servizio interno). Schiacciarle su un flag solo vorrebbe dire
-- spegnere una linea per toglierla da una pagina — e con lei i suoi negozi.
--
-- Default `true`: la vetrina oggi mostra tutto, e una migrazione non deve
-- cambiare da sola cosa vedono i partner. Si toglie ciò che non si vuole.
alter table lines add column if not exists in_vetrina boolean not null default true;

comment on column lines.in_vetrina is
  'La linea compare fra i servizi richiedibili nella casa del partner (deluxy-delivery /home)';

create index if not exists lines_in_vetrina_idx on lines (in_vetrina) where archiviata = false;
