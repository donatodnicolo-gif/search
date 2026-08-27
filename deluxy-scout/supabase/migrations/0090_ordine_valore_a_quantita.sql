-- 0090 — ANCHE IL VALORE DI UN ORDINE PUÒ ESSERE A QUANTITÀ (27/08/2026).
--
-- Richiesta dell'utente: «le opzioni di valore e se sono riferite a quantità,
-- giorno o ora mettile anche qui così da poter stimare anche qui per quantità».
--
-- È lo stesso di quello che i preventivi hanno già (migr. 0088), dall'altra
-- parte del conto: là quanto ci COSTA, qui quanto lo VENDIAMO. Un catering da
-- 45 € a persona per 30 persone si scriveva 1.350, e da quel momento nessuno
-- sapeva più che le persone erano trenta — alla prima variazione si rifaceva il
-- conto a mente, o si sbagliava.
--
-- ⚠️ `valore` RESTA IL TOTALE, come `importo` di là. Il margine, i totali
-- dell'anno, la percentuale e la pro-forma leggono quel campo: se ci finisse il
-- prezzo unitario, un ordine da «45 € × 30» varrebbe 45 in ogni conto dell'app
-- e nel documento mandato al cliente. Qui sotto ci sono gli INGREDIENTI.
alter table ordini add column if not exists valore_unitario numeric;
alter table ordini add column if not exists quantita numeric;
alter table ordini add column if not exists unita text
  check (unita is null or unita in ('pezzi', 'giorni', 'ore'));

comment on column ordini.valore_unitario is
  'Il prezzo di UNA unità, quando si è venduto così. `valore` resta il totale.';
comment on column ordini.quantita is 'Quante unità: persone, pezzi, giorni, ore.';
comment on column ordini.unita is
  'pezzi | giorni | ore. Null = il valore è un totale e basta.';
