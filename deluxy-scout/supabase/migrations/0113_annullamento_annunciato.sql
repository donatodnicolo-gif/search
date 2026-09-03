-- 0113 — L'ANNULLAMENTO SI ANNUNCIA (03/09/2026, richiesta dell'utente: «invia
-- mail anche per gli ordini annullati come lo fai per gli ordini creati — in
-- questo caso specifica nell'oggetto che l'ordine è annullato»).
--
-- STORIA. Dalla chiusura della pratica parte `[ORDINE SCOUT] SCOUT00N · …` a
-- tutta la squadra, e il numero è quello che chi apre la consegna scrive come
-- DDT. Quando quell'ordine veniva annullato, invece, non lo sapeva nessuno: la
-- riga cambiava colore in Scout e basta. Chi aveva già aperto la consegna, o
-- aspettava l'incasso, continuava a lavorarci.
--
-- ⚠️ SERVE UNA COLONNA SUA, non basta `annunciato_il`: quella dice «la squadra
-- sa che l'ordine ESISTE», ed è già piena proprio sugli ordini che si possono
-- annullare. Riusarla vorrebbe dire non mandare mai la seconda mail (o, peggio,
-- azzerarla e rimandare l'annuncio di creazione).
--
-- ⚠️ Si AZZERA quando l'ordine torna in gioco («Riporta a da incassare»): un
-- ordine annullato di nuovo è un fatto nuovo, e va detto di nuovo. È l'app a
-- farlo, insieme al cambio di stato.
alter table ordini add column if not exists annullamento_annunciato_il timestamptz;

comment on column ordini.annullamento_annunciato_il is
  'Quando è partita la mail [ORDINE SCOUT · ANNULLATO]. NULL = non annunciato (o ordine rimesso in gioco): è anche la prenotazione che impedisce il doppio invio.';
