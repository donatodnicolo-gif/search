# Segnalazioni PERFORMANCE — il registro del custode

**Dal 28/08/2026 la velocità e l'integrità di tutte le app Deluxy hanno un custode: l'agente `architetto-performance`** (`.claude/agents/architetto-performance.md`), che applica il [Libro PERFORMANCE](LIBRO-PERFORMANCE.md).

## Come funziona

1. **Chi trova un punto lento o vuole ottimizzare NON lo fa in autonomia**: lo scrive qui sotto (una riga nella tabella «In attesa», CON LA MISURA: ms, KB o numero di query) oppure interpella l'agente `architetto-performance` in sessione.
2. **Ogni segnalazione e ogni proposta passa PRIMA da `performance-ostile`**, che ha il mandato di demolirla: un'accusa sopravvive solo con la misura, una proposta solo se non tocca l'integrità dei dati e regge i volumi veri.
3. **Il custode decide**: correzione locale (l'app era fuori canone), regola nuova del Libro (con bump di versione, vale per tutte le app), o respinta (annotando il perché).
4. **Ogni ottimizzazione applicata riporta la misura PRIMA e DOPO** sullo stesso percorso e gli stessi volumi. Senza le due misure l'esito non entra in «Decise».
5. ⚠️ **Indici e schema del Postgres CONDIVISO (14 app)** non si toccano mai in autonomia: la proposta si registra qui, si applica con `CREATE INDEX CONCURRENTLY` in un momento concordato, mai con `db push` alla cieca.

> Formato della segnalazione: `app · percorso/endpoint · misura (ms/KB/query, dove e su quanti dati) · chi la segnala/data`.

## In attesa

| Data | App | Segnalazione | Fonte |
|---|---|---|---|
| 28/08 | piattaforma · CS · Scout · Mail | **Proposte di SCHEMA sul Postgres condiviso** (Libro, Appendice B): indice `trackingToken`+`updatedAt` su Delivery; unique parziale `Messaggio.idEsterno`; `Ordine.dataConsegna`; `visits.client_id` unique e `ordini.richiesta_id` unique (Scout, Supabase); indici Mail. Si concordano con l'utente → EXPLAIN prima/dopo → `CREATE INDEX CONCURRENTLY` | giuria 28/08 |
| 28/08 | varie | **Confermati in coda** dopo la TOP 10 (Libro, Appendice B): Fondo cruscotto, Calendario cron, Orders bacheca groupBy, Finance summary doppio, Mail take:2000, Marketing anno cablato, search logCheck+fornitori.js, Merch delete+createMany, stipendi/fatturazione con periodo dichiarato | giuria 28/08 |
| 28/08 | varie | **Da misurare prima di toccare**: Tabella RN (Profiler), Dashboard Scout al focus, header cache piattaforma+/valets, Budgets 12 fetch, Merch collezioni, Marketing waterfall gruppi/[id], indici Messaging | giuria 28/08 |

## Decise

| Data | App | Segnalazione | Esito (misura prima → dopo) |
|---|---|---|---|
