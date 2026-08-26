-- 0073 — IL FORNITORE DEL PREVENTIVO, PRESO DAL REGISTRO (26/08/2026).
--
-- Richiesta dell'utente: «metti anche richiesta di chi è il fornitore con
-- possibilità di ricerca in anagrafiche tra i fornitori».
--
-- Fin qui il fornitore di un preventivo era un NOME — testo libero, o al più
-- un negozio di Scout. Il nome però non è un'identità: «Rossi Fiori» scritto in
-- due modi sono due fornitori diversi per chiunque provi a contare quanto
-- spendiamo da lui, e il registro Anagrafiche — che è la casa delle aziende
-- B2B — non c'entrava niente.
--
-- Si tiene il RIFERIMENTO all'anagrafica, non una copia: il nome resta per
-- leggibilità (e per i preventivi di chi nel registro non c'è ancora), l'id
-- dice DI CHI stiamo parlando.
alter table preventivi add column if not exists fornitore_anagrafiche_id text;

comment on column preventivi.fornitore_anagrafiche_id is
  'Id del fornitore nel registro Anagrafiche. NULL = nome libero o negozio Scout senza anagrafica.';

create index if not exists preventivi_fornitore_anagrafica_idx
  on preventivi (fornitore_anagrafiche_id)
  where fornitore_anagrafiche_id is not null;
