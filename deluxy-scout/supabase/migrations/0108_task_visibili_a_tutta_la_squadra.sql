-- 0108 — I TASK SI VEDONO IN SQUADRA (richiesta dell'utente, 31/08/2026:
-- «fai vedere a me e a tutti»).
--
-- STORIA. Il 0022 aveva scritto una regola di LETTURA stretta: si vedevano i
-- task assegnati a sé, quelli creati da sé, e — solo per l'indirizzo admin
-- scritto a mano — tutti. Conseguenza misurata il 31/08: l'utente crea
-- «Contattare per regalistica» per Martina Calia e non lo trova più; e per
-- Martina il filtro «Tutti» non mostrava affatto tutti, ma soltanto i suoi,
-- cioè la stessa cosa dell'altro filtro con un nome diverso — la forma peggiore
-- di un elenco: uno che promette di più di quello che dà.
--
-- ⚠️ Cambia SOLO la lettura. Scrittura, modifica e cancellazione restano come
-- prima (proprio, creato da sé, o admin): vedere il lavoro della squadra è
-- un'altra cosa dal poterlo cambiare, e allargare le due insieme sarebbe
-- allargare più di quanto è stato chiesto.
--
-- ⚠️ Non è un'eccezione nell'app: è l'allineamento al modello che Scout ha già
-- per il lavoro condiviso — `places`, `contacts`, `deals`, `richieste_cliente`
-- si leggono tutte con `using (true)` fra gli autenticati. I task erano
-- l'anomalia, ed erano anche l'unica tabella con un indirizzo email nel corpo
-- della policy per la lettura.
--
-- Idempotente: si può rilanciare.
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select to authenticated
  using (true);
