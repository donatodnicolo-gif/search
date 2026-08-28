-- Deluxy Scout — 0101: il LAVORO agganciato a una trattativa di HUBSPOT.
-- Idempotente. Applicare con: node scripts/mgmt-query.mjs supabase/migrations/0101_lavoro_hubspot_deal.sql
--
-- Segnalazione dell'utente (28/08/2026): creando un preventivo fornitori sulla
-- trattativa «Catering HAVI 3/09» usciva l'errore grezzo
-- «invalid input syntax for type uuid: "hs_512059002060"».
--
-- ⚠️ PERCHÉ. L'elenco delle trattative è fatto di TRE fonti (deals di Scout,
-- deals di HubSpot, partner del registro in trattativa): le ultime due non
-- hanno una riga in `deals`, e l'app le identifica con id sintetici
-- (`hs_<id>`, `ana_<place>`). `lavori.deal_id` è un uuid verso `deals`: un id
-- sintetico non può entrarci — e non DEVE, perché sarebbe un riferimento a una
-- riga che non esiste.
--
-- La trattativa HubSpot esiste davvero (in `hubspot_deals`): le si dà la sua
-- colonna. Testo e non uuid, perché l'id di HubSpot è suo, non nostro.
alter table lavori add column if not exists hubspot_deal_id text;
create index if not exists lavori_hubspot_deal_ix on lavori (hubspot_deal_id) where hubspot_deal_id is not null;

comment on column lavori.hubspot_deal_id is
  'La trattativa di HubSpot a cui il lavoro appartiene, quando la vendita non ha una riga in deals.';

-- ⚠️ Scoperto PROVANDO l'inserimento (non a occhio): il vincolo
-- `lavori_ha_una_vendita` pretende una delle tre colonne vecchie, quindi un
-- lavoro agganciato SOLO a una trattativa HubSpot veniva rifiutato lo stesso.
-- Si estende: la trattativa HubSpot È una vendita. Resta NOT VALID com'era —
-- i lavori storici senza vendita non devono rompersi adesso.
alter table lavori drop constraint if exists lavori_ha_una_vendita;
alter table lavori add constraint lavori_ha_una_vendita
  check (deal_id is not null or richiesta_id is not null or ordine_id is not null or hubspot_deal_id is not null)
  not valid;
