-- 0110 — LA DATA DELL'ORDINE si può scrivere (31/08/2026, richiesta
-- dell'utente: «dai la possibilità di inserire la data dell'ordine in ordini»).
--
-- Fin qui l'unica data di un ordine era `created_at`: quando la RIGA è nata in
-- Scout. Non è la stessa cosa. Un ordine chiuso il 3 agosto e registrato oggi
-- risultava «di oggi», e i conti per periodo — il chiuso dell'anno, il
-- fatturato del mese — lo mettevano nel mese sbagliato. Chi registra a
-- posteriori non aveva modo di dire la verità.
--
-- ⚠️ NULL = «non indicata», e vale «usa la data di creazione»: non si riempie
-- da soli con `created_at` su 1.400 ordini, perché per la maggior parte le due
-- date coincidono davvero e riempirla darebbe l'impressione che qualcuno
-- l'abbia verificata una per una. Chi legge fa il ripiego, dichiarato.
alter table ordini add column if not exists data_ordine date;

comment on column ordini.data_ordine is
  'Il giorno in cui l''ordine è stato fatto, quando è diverso da quando la riga è nata in Scout. NULL = non indicata: si usa created_at.';

-- I riepiloghi per periodo leggeranno «la data vera dell''ordine»: l''indice
-- serve a loro, non alla schermata (che ordina in memoria).
create index if not exists ordini_data_ordine_ix on ordini (data_ordine desc nulls last);
