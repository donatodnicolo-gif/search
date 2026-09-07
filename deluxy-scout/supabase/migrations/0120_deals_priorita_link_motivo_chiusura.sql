-- Deluxy Scout — 0120: priorità, link di riferimento e motivo di chiusura sulle trattative.
-- Idempotente. Applicare con scripts/mgmt-query.mjs (Management API).
--
-- Richieste dell'utente del 07/09/2026 (fatte da un altro account, recuperate
-- dal ramo claude/deluxy-scout-handoff-memory-xgrh2i e rifatte qui perché quel
-- ramo partiva dalla copia di luglio dell'app):
--   1. priorità P0–P3 sulle trattative, elenco ordinato per priorità;
--   2. link di riferimento della trattativa (una cartella, un preventivo online…);
--   3. motivo di chiusura OBBLIGATORIO quando la trattativa si chiude vinta o
--      persa, con email a responsabile e venditore.
--
-- ⚠️ `motivo_perso` (migr. 0040) resta: è la CATEGORIA della persa (prezzo,
-- tempistica…) da cui nasce la strategia di ripresa. `motivo_chiusura` è il
-- perché detto a parole, e vale anche per le VINTE. Sono due cose diverse e
-- nessuna sostituisce l'altra.
--
-- ⚠️ Solo sulle trattative di Scout (`deals`). Le righe che arrivano dalla
-- copia locale di HubSpot (`hubspot_deals`) NON ricevono queste colonne: la
-- copia la scrive il sync notturno e HubSpot è in dismissione (interruttore
-- del 28/08); aprire la copia alla scrittura degli utenti per tre campi che
-- vivrebbero solo lì avrebbe creato una seconda casa del dato.

alter table deals add column if not exists priorita text not null default 'P2';
do $$ begin
  alter table deals add constraint deals_priorita_check check (priorita in ('P0', 'P1', 'P2', 'P3'));
exception when duplicate_object then null; end $$;
alter table deals add column if not exists link text;
alter table deals add column if not exists motivo_chiusura text;

create index if not exists deals_priorita_ix on deals (priorita, fase) where annullata_il is null;

comment on column deals.priorita is 'P0 (urgente) … P3 (bassa). Default P2. L''elenco delle trattative si ordina per priorità.';
comment on column deals.link is 'Link di riferimento della trattativa (cartella, preventivo online, presentazione).';
comment on column deals.motivo_chiusura is 'Perché è stata chiusa, a parole. Obbligatorio alla chiusura vinta/persa dal 07/09/2026; va anche su HubSpot (deluxy_esito_analisi) e per email a responsabile e venditore.';
