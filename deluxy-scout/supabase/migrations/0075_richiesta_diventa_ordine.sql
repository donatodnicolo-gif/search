-- 0075 — DALLA RICHIESTA ALL'ORDINE, col documento agganciato (26/08/2026).
--
-- Richiesta dell'utente: «metti Trasforma in Ordini che porta la cosa sotto
-- Ordini e genera in automatico una proforma che sarà agganciata».
--
-- Fin qui una richiesta cliente moriva dov'era nata: si prezzava, si chiedeva
-- il documento, e il lavoro venduto non compariva fra gli ORDINI — cioè nel
-- posto dove si guarda cosa c'è da consegnare e da incassare.
--
-- I due legami servono in tutte e due i versi: dall'ordine si vuole risalire
-- alla richiesta (perché lo stiamo facendo), e dalla richiesta all'ordine (che
-- fine ha fatto). Un legame solo lascia sempre una delle due domande senza
-- risposta.
alter table ordini add column if not exists richiesta_id uuid
  references richieste_cliente(id) on delete set null;
alter table richieste_cliente add column if not exists ordine_id uuid
  references ordini(id) on delete set null;

-- Il RIFERIMENTO al documento di FINANCE, non una copia dei suoi importi: il
-- registro dei risultati resta di là.
alter table ordini add column if not exists proforma_numero text;
alter table ordini add column if not exists proforma_url text;
alter table ordini add column if not exists fattura_numero text;
alter table ordini add column if not exists fattura_url text;

-- Lo stato che mancava alla richiesta: «è diventata un ordine». Non è
-- «fatturata» — la fattura è un'altra cosa e viene dopo — e non è «concordata»,
-- perché il lavoro è già passato di mano. Dirlo con uno stato esistente
-- sarebbe stato comodo e falso.
alter table richieste_cliente drop constraint if exists richieste_cliente_stato_check;
alter table richieste_cliente add constraint richieste_cliente_stato_check
  check (stato in ('nuova', 'preventivo_inviato', 'concordata', 'in_ordine', 'fatturata', 'persa'));

create index if not exists ordini_richiesta_idx on ordini (richiesta_id) where richiesta_id is not null;

comment on column ordini.richiesta_id is
  'La richiesta cliente da cui nasce questo ordine (Trasforma in ordine)';
comment on column ordini.proforma_numero is
  'Riferimento PF n/anno su FINANCE: il documento vive di là, qui c''è solo il rimando';
