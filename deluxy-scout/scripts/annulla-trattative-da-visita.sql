-- Deluxy Scout — 07/09/2026: ANNULLA le trattative nate da una visita.
-- Richiesta dell'utente («annulla tutte le trattative che derivano da una
-- visita»), lo stesso giorno in cui la regola è cambiata: una visita non
-- apre più una trattativa (hubspot-sync sync_visit). Quelle già nate così
-- vanno messe da parte: ANNULLATE (annullata_il), non cancellate — escono
-- dai conti e stanno in «Annullate», da dove si rimettono in gioco una per una.
--
-- Come si riconosce una trattativa nata da una visita: fino a oggi la creava
-- la Edge Function al momento del sync, con SOLO place_id, linea, fase,
-- hubspot_deal_id e owner — quindi senza oggetto, senza canale, senza valore
-- — e pochi secondi dopo la visita (stesso negozio). Quelle aperte a mano dal
-- form hanno sempre canale (default «territorio») e la scadenza.
-- ⚠️ Una trattativa con un ORDINE agganciato non si tocca, qualunque sia la
-- sua origine: un ordine è una vendita vera.
--
-- Idempotente: annulla solo le vive. Applicare con scripts/mgmt-query.mjs.
-- Prova a secco: sostituire l'UPDATE finale con `select count(*) from cand`.

-- Le trattative di LUGLIO non hanno `created_at` (colonna della migr. 0039):
-- per loro il tempo non aiuta, e si guarda l'IMPRONTA della vecchia Edge:
-- la fase è quella che `dealstageDaEsito` ricavava dall'esito di una visita
-- dello stesso negozio (da_richiamare → appointmentscheduled, interessato →
-- decisionmakerboughtin, chiuso → closedwon, non_target → closedlost) e la
-- linea è quella proposta nella visita (o nessuna). Una trattativa senza
-- visite sul negozio NON è nata da una visita, e resta.

with cand as (
  select d.id
  from deals d
  where d.annullata_il is null
    and d.canale is null
    and d.oggetto is null
    and d.valore_atteso is null
    and not exists (select 1 from ordini o where o.deal_id = d.id)
    and (
      (
        d.created_at is not null
        and exists (
          select 1 from visits vi
          where vi.place_id = d.place_id
            and abs(extract(epoch from (d.created_at - vi.created_at))) <= 300
        )
      )
      or (
        d.created_at is null
        and exists (
          select 1 from visits vi
          where vi.place_id = d.place_id
            -- ⚠️ `fase` ed `esito` sono ENUM: senza il cast a text il confronto
            -- con le stringhe non compila (dealstage_t = text).
            and d.fase::text = case vi.esito::text
              when 'da_richiamare' then 'appointmentscheduled'
              when 'interessato' then 'decisionmakerboughtin'
              when 'chiuso' then 'closedwon'
              when 'non_target' then 'closedlost'
              else 'appointmentscheduled' end
            and (vi.linea_proposta is null or vi.linea_proposta = d.linea or d.linea is null)
        )
      )
    )
)
update deals
set annullata_il = now()
where id in (select id from cand)
returning id;
