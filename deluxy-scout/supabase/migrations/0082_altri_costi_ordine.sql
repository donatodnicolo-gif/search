-- 0082 — GLI ALTRI COSTI DI UN ORDINE (27/08/2026).
--
-- Richiesta dell'utente: «metti una colonna altri costi sui costi che ci
-- possono essere collegati».
--
-- Fin qui il costo di un ordine era UNO SOLO: il preventivo del fornitore
-- (`lavori` + `preventivi`). Ma su una vendita ci sono spesso costi che non
-- passano da un preventivo — il trasporto, una persona in più, il noleggio,
-- il materiale comprato al volo — e finché non si contano il margine è più
-- alto di quello vero.
--
-- ⚠️ Il margine ADESSO li sottrae. È il punto della richiesta: una colonna che
-- mostra un costo senza toglierlo dal margine racconta due numeri che non
-- tornano fra loro, ed è peggio di non avere la colonna.
--
-- ⚠️ Nullable, e `null` vuol dire «non ce ne sono» — non «non lo so». Qui la
-- differenza non morde come sul VALORE di un ordine: un costo che nessuno ha
-- scritto è un costo che non c'è, e trattarlo come zero non gonfia niente. Il
-- valore, invece, resta nullable proprio perché lì zero mentirebbe.
alter table ordini add column if not exists altri_costi numeric(12,2);
alter table ordini add column if not exists altri_costi_nota text;

comment on column ordini.altri_costi is
  'Costi collegati all''ordine che non passano da un preventivo fornitore (trasporto, personale, materiali). Entrano nel margine. Null = nessuno.';
comment on column ordini.altri_costi_nota is
  'Di cosa sono fatti: senza, fra un mese il numero non si sa più spiegare.';
