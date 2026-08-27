-- 0087 — LA LINEA DI BUSINESS DI UNA RICHIESTA CLIENTE (27/08/2026).
--
-- Richiesta dell'utente, dal foglio di modifica: «serve la linea di business
-- di richiesta».
--
-- Fin qui una richiesta diceva CHI chiede, COSA chiede e QUANTO, ma non su
-- quale linea si vende: Consegne, Eventi & Catering, Gifting… È lo stesso
-- vocabolario delle trattative e degli ordini (`lines`, master in Scout), e
-- mancava proprio nel punto in cui il lavoro entra in casa.
--
-- ⚠️ Il buco vero era a valle: `creaOrdineDaRichiesta` non aveva niente da
-- passare, quindi ogni ordine nato da una richiesta arrivava in /ordini con la
-- colonna Linea vuota — e restava fuori da ogni conto per linea. Non era un
-- campo mancante nella maschera: era un pezzo di ricavo che spariva dalle
-- statistiche.
--
-- ⚠️ Nullable, e resta nullable: le richieste che ci sono già non si
-- indovinano. «Non indicata» è un'informazione vera; una linea dedotta a
-- posteriori sarebbe plausibile e falsa, e falserebbe proprio i conti che
-- questa colonna serve a far tornare.
alter table richieste_cliente add column if not exists linea text;

comment on column richieste_cliente.linea is
  'La linea di interesse su cui si vende (stesso vocabolario di `lines`, master in Scout). Viaggia nell''ordine che nasce dalla richiesta. Null = non indicata, mai dedotta.';

-- Serve ai filtri e ai conti per linea, che sono il motivo per cui esiste.
create index if not exists richieste_cliente_linea_idx on richieste_cliente (linea)
  where linea is not null;
