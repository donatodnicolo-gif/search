-- 0083 — LA LINEA CHE VIENE DA UN SERVIZIO DELLA PIATTAFORMA (27/08/2026).
--
-- Richiesta dell'utente sulla pagina Linee di interesse: «ora dovresti poter
-- richiamare l'app delivery per dire quali inserire».
--
-- Scout resta il master delle linee; la piattaforma consegne resta il padrone
-- dei suoi servizi. Questa colonna è il RIFERIMENTO fra i due — il codice del
-- servizio, non una copia del suo record: prezzi, modello e stato restano di
-- là e si leggono di là (Standard Deluxy §7).
--
-- ⚠️ Serve anche a non rifare due volte la stessa linea. Senza, l'unico
-- confronto possibile è il NOME, e un nome combacia «quasi»: «Eventi» ed
-- «Eventi & Catering» si somigliano abbastanza da ingannare e non abbastanza
-- da essere lo stesso. Il codice è un'identità, il nome è un indizio.
alter table lines add column if not exists servizio_codice text;

comment on column lines.servizio_codice is
  'Codice del tipo di servizio nella piattaforma consegne (ServiceType.code). Riferimento, non copia: nome e prezzi restano di là.';

-- Non unique: la stessa linea non deve nascere due volte, ma un vincolo duro
-- qui bloccherebbe una sottolinea legittima collegata allo stesso servizio.
create index if not exists lines_servizio_codice_idx on lines (servizio_codice)
  where servizio_codice is not null;
