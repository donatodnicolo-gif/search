-- 0092 — UN ORDINE PUÒ AVERE PIÙ FATTURE (27/08/2026).
--
-- Richiesta dell'utente: «consenti di selezionare più fatture, prima di dare ok
-- la somma delle fatture selezionate deve essere pari al valore dell'ordine».
--
-- Succede: un evento fatturato in due tranche, un acconto e un saldo, due
-- fatture perché due referenti amministrativi. Fin qui l'ordine aveva UN campo
-- `fattura_numero`, e agganciarne una sola su due voleva dire dichiarare
-- fatturato per intero un ordine che lo era a metà.
--
-- ⚠️ `fattura_numero` RESTA e continua a portare la PRIMA: la colonna della
-- tabella, la pillola del documento e il giro verso FINANCE la leggono, e
-- svuotarla avrebbe fatto sparire il documento dagli ordini già collegati.
-- Questa colonna è l'elenco completo, non il suo sostituto.
alter table ordini add column if not exists fatture text[];

comment on column ordini.fatture is
  'Tutti i numeri di fattura collegati all''ordine (Fatture in Cloud). `fattura_numero` porta il primo, per compatibilità con chi legge un campo solo.';

-- Serve a trovare l'ordine partendo da un numero di fattura, che è la domanda
-- che si fa quando arriva un pagamento e non si sa a cosa appartiene.
create index if not exists ordini_fatture_idx on ordini using gin (fatture);
