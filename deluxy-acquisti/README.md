# Deluxy Acquisti

App che **centralizza gli acquisti** dell'ecosistema Deluxy in un unico posto:

1. **Richieste di acquisto** con flusso di **approvazione** (chi chiede → un responsabile approva/rifiuta → si converte in acquisto).
2. **Acquisti** veri e propri (ordini/fatture verso i fornitori), con imponibile, IVA, totale, categoria e stato.
3. **Movimenti finanziari** collegati a ogni acquisto (acconti, saldi, pagamenti, note di credito, rimborsi) con importi, metodo, scadenze e stato — così si vede sempre **quanto resta da pagare**.
4. **Ricerca con l'AI**: si cerca in italiano ("le fatture dei fiori di giugno non ancora pagate", "ordini sopra 500 €") e l'AI traduce la domanda in un filtro. Incollando una fattura, l'AI **estrae i campi** e precompila il modulo.

Stack: **Next.js 15 + React 19 + Prisma + Postgres** (schema `acquisti` sul cluster condiviso Deluxy), OpenAI per le funzioni AI. Segue il **Deluxy Design System** (stile Apple).

Porta di sviluppo: **3100**.

## Avvio locale

```bash
npm install

# 1) Configura il DB condiviso (schema "acquisti") copiando le stringhe da un'altra app:
npm run db:condiviso -- ../deluxy-hub/.env.vercel-prod
# 2) Crea le tabelle:
npm run db:push
# 3) (facoltativo) Dati d'esempio:
npm run seed:demo
# 4) Avvia:
npm run dev   # http://localhost:3100
```

Per le funzioni AI, imposta `OPENAI_API_KEY` nel `.env` (vedi `.env.example`). Senza chiave l'app funziona lo stesso ma la ricerca AI e l'estrazione da fattura sono spente.

## Accesso

- **UI**: protetta da una password unica del team (`ACQUISTI_APP_PASSWORD`). Se non impostata (sviluppo locale) la UI è aperta.
- **Chi approva**: `ACQUISTI_APPROVATORI` (email separate da virgola). Se vuoto, può approvare chiunque tranne chi ha creato la richiesta (niente auto-approvazione).
- **Identità**: in alto a destra ognuno mette il proprio nome/email (salvati nel browser) per firmare richieste, decisioni e movimenti.

## API per le altre app (chiave `x-api-key`)

Le chiavi si creano con `npm run chiave -- <nome-app> [--scrittura]` (nel DB resta solo lo SHA-256).

| Metodo | Endpoint | Chiave | Descrizione |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | — | Stato del servizio |
| GET | `/api/v1/acquisti` | lettura | Elenco acquisti (`?stato=&fornitore=&categoria=&limit=`) |
| POST | `/api/v1/acquisti` | scrittura | Crea un acquisto |
| GET | `/api/v1/richieste` | lettura | Elenco richieste (`?stato=&richiedente=&limit=`) |
| POST | `/api/v1/richieste` | scrittura | Un'altra app crea una richiesta di acquisto |

Esempio (un'app segnala materiale da comprare):

```bash
curl -X POST https://acquisti…/api/v1/richieste \
  -H "x-api-key: dlac_…" -H "content-type: application/json" \
  -d '{"titolo":"Nastro oro 200m","richiedenteEmail":"magazzino@deluxy.it","categoria":"Confezionamento","importoStimato":180}'
```

## Struttura

- `prisma/schema.prisma` — `RichiestaAcquisto`, `Acquisto`, `MovimentoFinanziario`, `ApiKey`.
- `src/lib/vocab.ts` — stati, categorie, priorità, tipi movimento, formattazione (unica fonte per UI e AI).
- `src/lib/actions.ts` — server actions della UI (crea/approva/converti/registra movimento…).
- `src/lib/ai.ts` — OpenAI: `interpretaRicerca` (ricerca NL → filtro) e `estraiDaFattura`.
- `src/app/api/v1/*` — API pubbliche a chiave. `src/app/api/interno/ai/*` — endpoint AI della UI (gate a cookie).
- `src/components/*` — Dashboard, card, modali, ricerca.

## Note

- Le anagrafiche dei partner restano in `deluxy-anagrafiche`: qui il fornitore è un nome (con P.IVA e `fornitoreId` facoltativi verso quel registro).
- Segreti mai committati: `.env` è in `.gitignore`.

## Custode del layout (obbligatorio — 27/08/2026)

L'interfaccia di questa app ha un **custode**: l'agente `architetto-ux` (definito in `.claude/agents/architetto-ux.md`), che applica il [Libro UX&UI](../deluxy-design-system/LIBRO-UX-UI.md) e il [Design System](../deluxy-design-system/DESIGN-SYSTEM.md) v1.4.

- **Errori di layout/UX e richieste di cambiamento dell'interfaccia NON si risolvono in autonomia**: si segnalano prima nel registro [`deluxy-design-system/SEGNALAZIONI-UX.md`](../deluxy-design-system/SEGNALAZIONI-UX.md), o si interpella direttamente l'agente.
- Il custode valuta ogni segnalazione e decide: correzione locale, regola nuova del Libro (che vale **anche per le altre app**), o deroga motivata.
- Le deroghe concesse a questa app vanno annotate qui sotto, con motivo e data.

## Custode della sicurezza (obbligatorio — 27/08/2026)

La sicurezza di questa app ha un **custode**: l'agente `architetto-sicurezza` (definito in `.claude/agents/architetto-sicurezza.md`), che applica il [Libro della Sicurezza](../deluxy-design-system/LIBRO-SICUREZZA.md).

- **Buchi di sicurezza e cambiamenti di una difesa NON si risolvono in autonomia**: si segnalano nel registro [`deluxy-design-system/SEGNALAZIONI-SICUREZZA.md`](../deluxy-design-system/SEGNALAZIONI-SICUREZZA.md), o si interpella l'agente.
- Ogni segnalazione passa prima dall'agente `sicurezza-ostile` (sopravvive solo con un percorso di sfruttamento: chi/quale chiamata/quale dato); la toppa si smonta come il difetto.
- Il custode valuta e decide: correzione locale, regola nuova del Libro (che vale **anche per le altre app**), o rischio accettato/deroga con il motivo scritto.
- Le deroghe di sicurezza di questa app vanno annotate qui sotto, con minaccia e data.
