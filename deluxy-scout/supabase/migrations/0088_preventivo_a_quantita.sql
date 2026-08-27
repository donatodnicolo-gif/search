-- 0088 — IL PREZZO A QUANTITÀ, AL GIORNO, ALL'ORA (27/08/2026).
--
-- Richiesta dell'utente sul form dei preventivi fornitori: «metti anche
-- quantità nel form così da poter calcolare anche in caso il prezzo a quantità»
-- + «metti opzioni se il prezzo è a quantità o al giorno o all'ora (sono
-- opzioni non obbligatorie) e al flag fai inserire un numero».
--
-- Fin qui un preventivo aveva un numero solo, e chi lo scriveva doveva fare la
-- moltiplicazione a mente: 45 € a pezzo per 30 pezzi si scriveva 1.350, e da
-- quel momento nessuno sapeva più che i pezzi erano trenta. Alla prima
-- variazione — 40 pezzi invece di 30 — si ripartiva da capo, o si sbagliava.
--
-- ⚠️ `importo` RESTA IL TOTALE, ed è la decisione che tiene in piedi tutto il
-- resto. Il margine, la colonna Preventivo, il confronto fra fornitori e i
-- totali leggono quel campo: se ci finisse il prezzo unitario, un preventivo da
-- «45 € × 30» varrebbe 45 in ogni conto dell'app. Qui sotto ci sono gli
-- INGREDIENTI del totale, non un totale alternativo.
alter table preventivi add column if not exists prezzo_unitario numeric;
alter table preventivi add column if not exists quantita numeric;
alter table preventivi add column if not exists unita text
  check (unita is null or unita in ('pezzi', 'giorni', 'ore'));

comment on column preventivi.prezzo_unitario is
  'Il prezzo di UNA unità, quando il fornitore ha quotato così. `importo` resta il totale.';
comment on column preventivi.quantita is
  'Quante unità. Moltiplicata per `prezzo_unitario` dà `importo`.';
comment on column preventivi.unita is
  'pezzi | giorni | ore. Null = il prezzo è un totale e basta, senza unità.';

-- ⚠️ Nessun vincolo che imponga `importo = prezzo_unitario * quantita`: i
-- fornitori fanno sconti sulla quantità, e un totale che non è il prodotto
-- esatto è un fatto, non un errore. Il conto lo propone l'app, la persona può
-- correggerlo — ed è per questo che il totale si conserva a parte.
