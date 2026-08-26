-- 0077 — UN LAVORO DA PREVENTIVARE PUÒ NASCERE DA TRE POSTI (26/08/2026).
--
-- Richiesta dell'utente sul form del nuovo lavoro: «metti sia trattativa che
-- richieste clienti che ordini».
--
-- Fin qui il lavoro si agganciava solo a una TRATTATIVA (0075 lo aveva persino
-- reso obbligatorio). Ma il costo di un fornitore serve anche quando la
-- vendita non è una trattativa:
--   · una RICHIESTA CLIENTE — un cliente che c'è già chiede una fornitura, e
--     per fargli il prezzo bisogna sapere quanto ci costa. È il caso più
--     frequente, e prima non aveva dove stare;
--   · un ORDINE già chiuso — il lavoro è venduto e adesso va comprato.
--
-- ⚠️ Resta la regola che conta: un preventivo fornitore appartiene SEMPRE a
-- qualcosa che vendiamo. Il vincolo qui sotto lo impone al database, non solo
-- alla schermata: senza almeno uno dei tre legami la riga non entra.
alter table lavori add column if not exists richiesta_id uuid
  references richieste_cliente(id) on delete set null;
alter table lavori add column if not exists ordine_id uuid
  references ordini(id) on delete set null;

-- ⚠️ `NOT VALID`: vale da adesso in avanti, e NON pretende che le righe già
-- scritte lo rispettino. Misurato prima di scriverlo: c'è un lavoro nato prima
-- della regola, senza nessun legame — con un vincolo normale la migrazione
-- sarebbe fallita in blocco (ed è successo al primo tentativo). Quella riga
-- non si inventa un legame per far contento il database: la schermata già
-- dichiara «nessuna trattativa collegata», e la si sistema guardandola.
alter table lavori drop constraint if exists lavori_ha_una_vendita;
alter table lavori add constraint lavori_ha_una_vendita
  check (deal_id is not null or richiesta_id is not null or ordine_id is not null)
  not valid;

create index if not exists lavori_richiesta_idx on lavori (richiesta_id) where richiesta_id is not null;
create index if not exists lavori_ordine_idx on lavori (ordine_id) where ordine_id is not null;

comment on constraint lavori_ha_una_vendita on lavori is
  'Un preventivo fornitore e'' un COSTO: senza la vendita a cui appartiene non si sa per cosa lo stiamo chiedendo, e il margine non si puo'' fare.';
