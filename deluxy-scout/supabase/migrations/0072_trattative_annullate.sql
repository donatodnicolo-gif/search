-- 0072 — LE TRATTATIVE ANNULLATE (26/08/2026).
--
-- Richiesta dell'utente: «aggiungi a tipo trattative anche "Annullate" dove
-- metti quelle cancellate con cestino». Cioè: il cestino non deve più far
-- sparire una trattativa per sempre — deve metterla da parte.
--
-- È anche più giusto: una trattativa aperta per sbaglio è un fatto (qualcuno
-- l'ha aperta, magari ci ha lavorato mezz'ora), e cancellarla senza lasciare
-- traccia toglie la possibilità di accorgersi che si sbaglia spesso, o di
-- rimetterla a posto se il cestino era il bottone sbagliato.
--
-- ⚠️ NON si aggiunge un valore all'enum `dealstage_t`. Quelle cinque fasi sono
-- le stesse che viaggiano verso HubSpot: una sesta che HubSpot non conosce
-- romperebbe il sync la prima volta che una trattativa annullata ci passa.
-- «Annullata» non è un punto della pipeline, è un fatto amministrativo — e
-- vive in una colonna sua, che dice anche QUANDO.
--
-- ⚠️ Idempotente, come ogni migrazione >= 0045.
alter table deals add column if not exists annullata_il timestamptz;

comment on column deals.annullata_il is
  'Quando la trattativa è stata annullata (cestino). NULL = viva. Le annullate escono dai conti e stanno nella loro vista.';

-- L''elenco delle vive è quello che si guarda sempre: l''indice parziale tiene
-- fuori le annullate senza pesare sulle altre righe.
create index if not exists deals_vive_idx on deals (fase) where annullata_il is null;
