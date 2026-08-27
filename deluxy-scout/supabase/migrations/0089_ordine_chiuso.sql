-- 0089 — CHIUDERE UN ORDINE (27/08/2026).
--
-- Richiesta dell'utente: «oltre a incassato ci deve essere un bottone per
-- chiudere l'ordine; una volta chiuso si propone l'aggancio con fatture già
-- presenti in finance o se non c'è nessuna fattura si procede con l'emissione».
--
-- ⚠️ CHIUSO E INCASSATO SONO DUE COSE DIVERSE, ed è tutto il motivo per cui
-- questa colonna esiste invece di un quarto stato:
--   · `stato = incassato` dice che i SOLDI sono arrivati;
--   · `chiuso_il` dice che la pratica è FINITA — fornitura registrata, fattura
--     emessa o agganciata, niente più da fare.
-- Succedono in quest'ordine solo qualche volta: si incassa un acconto e si
-- chiude dopo, o si chiude la pratica e l'incasso arriva a 60 giorni. Farne un
-- unico stato avrebbe obbligato a scegliere quale delle due verità raccontare.
alter table ordini add column if not exists chiuso_il timestamptz;

comment on column ordini.chiuso_il is
  'Quando la pratica è stata chiusa: fornitura registrata e fattura emessa o agganciata. Diverso da `stato = incassato`, che parla dei soldi.';

-- Serve a trovare in fretta quelli ancora aperti, che è la domanda che si fa
-- ogni giorno; i chiusi si guardano di rado.
create index if not exists ordini_da_chiudere_idx on ordini (created_at desc)
  where chiuso_il is null;
