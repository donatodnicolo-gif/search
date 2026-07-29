-- Deluxy Scout — 0053: il MOTIVO della visita, e può essere più di uno.
-- Idempotente. Applicare con scripts/allinea-supabase.mjs (o mgmt-query.mjs).
--
-- Il problema: la visita registrava una sola `linea_proposta`, scelta fra le
-- linee attive. Ma si entra in un negozio per più ragioni insieme — «gli parlo
-- delle consegne e già che ci sono del gifting» — e obbligare a sceglierne una
-- faceva perdere l'altra metà del motivo per cui ci si è andati.
--
-- `linea_proposta` NON sparisce: resta come **primo** motivo, perché la leggono
-- già lo storico, l'export CSV e la sync HubSpot (`hubspot-sync` costruisce il
-- nome della deal con quella). Cambiare il campo sotto a chi lo legge avrebbe
-- rotto tre cose per guadagnarne una.
alter table visits add column if not exists motivi text[];

comment on column visits.motivi is
  'Perché si è andati: una o più linee. visits.linea_proposta resta il primo, per chi lo legge già (storico, export, HubSpot).';
