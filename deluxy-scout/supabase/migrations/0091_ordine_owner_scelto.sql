-- 0091 — CHI HA SEGUITO L'ORDINE, quando lo si dice a mano (27/08/2026).
--
-- Richiesta dell'utente: «manca la scelta di chi ha seguito l'ordine».
--
-- ⚠️ Serve una colonna in più, e il motivo è sottile. Da ieri la schermata
-- risolve il nome così: se l'ordine viene da una trattativa vince il
-- proprietario DELLA TRATTATIVA, perché `ordini.owner` fino a oggi era il
-- default della colonna — cioè chi aveva premuto il bottone, non chi aveva
-- seguito il cliente.
--
-- Quella regola però schiaccia anche una scelta fatta APPOSTA: uno cambia il
-- proprietario dell'ordine, salva, e vede ricomparire il nome di prima. Un
-- campo che non fa niente è peggio di un campo che non c'è.
--
-- Questa colonna distingue le due cose: `false` = il proprietario è quello che
-- il database ha messo da sé (e allora comanda la trattativa), `true` = l'ha
-- scelto una persona (e allora comanda lei).
alter table ordini add column if not exists owner_scelto boolean not null default false;

comment on column ordini.owner_scelto is
  'true = il proprietario dell''ordine l''ha scelto una persona e vince su quello della trattativa; false = è il default della colonna (chi ha creato l''ordine).';
