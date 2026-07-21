# Deluxy Anagrafiche

Registro centralizzato delle anagrafiche partner e prospect B2B: la **fonte di verità
unica** a cui accedono tutte le app dell'ecosistema Deluxy.

- Tutte le app leggono da qui (chiave API di sola lettura).
- Solo la **piattaforma consegne** (deluxy-platform-next / app.deluxy.it) ha la chiave
  di scrittura: quando lì viene creato o modificato un partner, la piattaforma lo invia
  qui automaticamente (vedi `deluxy-platform-next/api/src/partners/anagrafiche-sync.service.ts`).
- I dati iniziali arrivano dal tracker `ANAGRAFICHE B2B COMPLETE - ACTIVITY TRACKER.xlsx`
  (~570 anagrafiche: boutique, fioristi, pasticcerie, ristorazione, gifting, concierge).

Stack: Next.js 15 + Prisma + **Postgres condiviso** delle app Deluxy (stesso
cluster di deluxy-hub e deluxy-partner, schema `anagrafiche`). Porta **3060**.

---

## Per le altre app Deluxy — come integrarsi

Questo è il brief di integrazione: leggetelo prima di far parlare la vostra app
con Anagrafiche. **Regola d'oro: il registro possiede il record, voi lo leggete;
scriverci significa proporre, non sovrascrivere.** Non duplicate i dati
anagrafici nelle vostre app — leggeteli da qui.

### Collegamento (tutte le app)

- Base URL produzione: `https://deluxy-anagrafiche.vercel.app`
- Autenticazione: header `x-api-key: <chiave-della-tua-app>` (ogni app ha la sua,
  in una variabile d'ambiente **lato server** — mai nel codice del browser).
- Le letture (GET) hanno il CORS aperto; le scritture vanno fatte server-to-server.

### Se leggi (tutte le app)

- `GET /api/v1/partners?q=&categoria=&citta=&provincia=&regione=&stato=&interesse=&page=&perPage=`
  → `{ totale, dati: [...] }`. `q` è multi-parola su **tutti i campi** (anagrafica
  + referenti); i filtri si combinano in AND. Città e province sono in MAIUSCOLO.
- `GET /api/v1/partners/:id` — accetta anche il vostro `platformId`.
- Per "esiste un partner in questa città?" usate i filtri e guardate `totale`.
- Non tenete una copia locale: rileggete. Se vi serve una cache, invalidatela
  spesso (in futuro arriveranno webhook sui cambi — vedi Fase 3 dell'architettura).

### Dati finanziari (fatturazione) — lettura e scrittura

Ogni partner risponde con un blocco **`datiFinanziari`**: `pec`, `codiceSdi`,
`iban`, `banca`, `metodoPagamento`, `condizioniPagamento`, `noteAmministrative`,
`amministrazioneNome/Telefono/Email` (il contatto amministrativo) e
**`aggiornamenti`** — per ogni campo chi l'ha scritto (`sistema`) e quando
(`asOf`). P.IVA e codice fiscale restano ai livelli alti della risposta.

- **Sono condivisi tra le sedi della stessa insegna** (la fatturazione è della
  società): scrivendoli su una sede valgono per tutte; leggendo una sede
  qualsiasi si ottiene lo stesso blocco.
- **Per capire se il registro ha dati più freschi dei vostri**: confrontate
  `aggiornamenti.<campo>.asOf` con la vostra data. Se il vostro dato è più
  recente, mandatelo.
- **Per mandarli**: `POST /api/v1/partners` (chiave di scrittura) con i campi
  finanziari nel body + `sistema`, `idEsterno` e soprattutto **`asOf`** (quando
  il dato era vero da voi). Potete mandarli **piatti** (`iban`, `pec`, …) **o
  annidati** sotto `datiFinanziari: {...}` — la stessa forma che leggete: il
  registro accetta entrambe. (`aggiornamenti` è di sola lettura, ignorato in
  scrittura.) Il merge applica il più fresco: un `asOf` più
  vecchio di quello registrato viene ignorato (`applicati: []`), i campi vuoti
  si riempiono sempre. IBAN e codice SDI vengono normalizzati (maiuscolo, IBAN
  senza spazi). `noteAmministrative` è additiva (append, mai sovrascritta).

### Se scrivi (oggi solo la piattaforma consegne; le altre app "segnalano")

- `POST /api/v1/partners` con la chiave di scrittura → **upsert** (201 = creato,
  200 = aggiornato).
- **Mandate sempre un vostro identificativo stabile** (oggi `platformId`; a breve
  `sistema` + `idEsterno` per tutte le app): è così che riconosco il record come
  vostro ed evito doppioni.
- Anti-doppioni già attivo: stesso nome + città → aggiorno l'esistente. Le note si
  **accodano**, non si sovrascrivono.
- `PATCH /:id` per modifiche mirate; `DELETE /:id` = archiviazione (soft delete).
- Se la vostra app gira nel browser (es. search/supplier), la scrittura passa da
  una vostra API route/edge function che fa da proxy: la chiave non esce dal server.

### Regole d'ingaggio (attive)

- **Primo contatto senza id**: `GET /partners/match?pIva=…&codiceFiscale=…&nome=…&citta=…`
  (passando anche `idEsterno`) → il match sicuro o i candidati con la confidenza.
  **Mandate più criteri insieme**: è una **cascata** — P.IVA → codice fiscale →
  nome+città; se un criterio forte (P.IVA/CF) non è nel registro, **ricade** sul
  nome. Quindi conviene mandare *sempre anche `nome`* (+`citta`): oggi la P.IVA nel
  registro è quasi ovunque vuota, quindi da sola non aggancia nulla. Le richieste
  finiscono nella pagina *Richieste di aggancio*, dove il team risolve gli ambigui
  e crea il riferimento; da lì risolvete per id.
- Nel POST mandate `sistema` (o si deduce dalla vostra chiave) e `idEsterno` (il
  vostro id per quel partner): registro il riferimento e vi riconosco alla
  prossima. Poi risolvete con `GET /partners/by-ref/:sistema/:idEsterno`.
- Scrivete i **campi che osservate davvero** (telefono, email, indirizzo,
  referenti, data ultimo contatto). Includete `asOf` (ISO): un campo si
  sovrascrive solo se il vostro dato è più fresco, o se la vostra sorgente è più
  autorevole di quella che l'aveva scritto.
- **Non impostate voi** `stato`, `interessi`, `account`: li cura il team e
  vengono ignorati (li trovate in `in_revisione` nella risposta). Le nuove
  anagrafiche nascono come `prospect`.
- **Note** in append, **referenti** in merge per identità (email>tel>nome):
  nessun'app cancella quelli inseriti da altre.

La risposta del POST dice cosa è successo: `{ esito: "creato"|"merged", applicati:
[...], in_revisione: [...], riferimenti: [...] }`.

---

## Avvio

```bash
# .env con DATABASE_URL/DIRECT_URL: si genera copiandole da un'altra app del cluster
node scripts/configura-db-condiviso.mjs ../deluxy-hub/.env
npm install
npm run db:push          # crea le tabelle nello schema "anagrafiche"
npm run import:excel     # importa il tracker (default: ~/Downloads/ANAGRAFICHE B2B COMPLETE - ACTIVITY TRACKER.xlsx)
npm run dev              # http://localhost:3060
```

## Deploy (Vercel)

**Live: https://deluxy-anagrafiche.vercel.app** (UI con password, API con chiavi).

Progetto Vercel `deluxy-anagrafiche` (root = questa cartella). Variabili
d'ambiente in produzione: `DATABASE_URL`, `DIRECT_URL` (come nel `.env`, con
`schema=anagrafiche`) e `ANAGRAFICHE_APP_PASSWORD` (protegge la UI; le API
/api/v1 restano protette dalle chiavi). Poi `npx vercel --prod`.
Dopo il deploy: impostare `APP_URL_ANAGRAFICHE` sul progetto deluxy-hub e
aggiornare `ANAGRAFICHE_URL` nelle app client (piattaforma, deluxy-partner).

L'import è idempotente: rilanciandolo sostituisce solo le anagrafiche con
`fonte = "excel"`, senza toccare quelle create dalla piattaforma o a mano.

## Modello dati

`Partner`: nome, ragione sociale, categoria (BOUTIQUE, FIORISTA, PASTICCERIA, …),
stato del ciclo di vita (`prospect`, `in_contatto`, `in_attesa`, `in_trattativa`,
`da_ricontattare`, `attivo`, `non_interessato`, `dismesso`), `interessi` (array
multi-scelta: consegne, affiliazione, gifting, catering, eventi, pr_activation,
in_store, vendor), città/provincia/regione, indirizzo, email, telefono, P.IVA, CF,
account commerciale, ultima visita, note, `datiExtra` (JSON con i campi specifici
del tracker: stime fatturato, fee, …), `platformId` (id del partner su
app.deluxy.it) e `hubspotId` (company del CRM) — entrambi chiavi di riconciliazione
uniche, `fonte` (`excel` | `platform` | `manuale` | `ui` | `hubspot`), `attivo`
(soft delete).

`Contatto`: persone di riferimento (ruolo, nome, telefono, email, `fonte`),
estratte dal blocco contatti dell'Excel, inviate via API, o importate da HubSpot
(`npm run import:hubspot-contatti`: aggancio azienda→partner per id o nome, dedup
per email/telefono/nome). Vista d'insieme in `/contatti`, elenco completo nella
scheda di ogni partner.

`PassaggioStato`: storico dei cambi di stato/archiviazione (da, a, origine, quando).

`ApiKey`: chiavi delle app client; nel DB c'è solo lo SHA-256.

## Chiavi API

```bash
npm run chiave -- deluxy-platform --scrittura   # lettura + scrittura (solo la piattaforma consegne)
npm run chiave -- deluxy-partner                # sola lettura
npm run chiave -- deluxy-suppliers              # sola lettura
npm run chiave -- deluxy-scout                  # sola lettura
```

La chiave viene stampata una sola volta: copiarla nel `.env` dell'app client
(consegnarla per canale privato, mai committarla). Il nome usato qui è la
**sorgente** che comparirà nella provenienza dei dati e nel ranking di fiducia.
Rilanciare il comando con lo stesso nome rigenera (e revoca) la chiave.

## API REST (`/api/v1`)

Autenticazione: header `x-api-key: <chiave>` (oppure `Authorization: Bearer <chiave>`).

| Metodo | Percorso | Permesso | Descrizione |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | nessuno | Stato del servizio |
| GET | `/api/v1/partners` | lettura | Elenco con filtri e paginazione |
| GET | `/api/v1/partners/:id` | lettura | Dettaglio (`:id` = id registro, `platformId`, o qualsiasi `idEsterno` registrato) |
| GET | `/api/v1/partners/by-ref/:sistema/:idEsterno` | lettura | Risolve il partner dall'id interno di un'altra app |
| GET | `/api/v1/partners/match` | lettura | Aggancio senza id: `pIva`/`codiceFiscale`/`nome`+`citta` → match sicuro o candidati con confidenza |
| POST | `/api/v1/partners` | scrittura | Upsert-merge; identità via `sistema`+`idEsterno` → `platformId` → P.IVA/CF → nome+città |
| PATCH | `/api/v1/partners/:id` | scrittura | Aggiornamento parziale |
| DELETE | `/api/v1/partners/:id` | scrittura | Disattiva (soft delete, `attivo=false`) |

Filtri di `GET /partners`: `q` (multi-parola su tutti i campi e i contatti),
`categoria`, `citta`, `provincia`, `regione`, `stato`, `fonte`, `platformId`,
`attivo` (`false` = solo disattivati, `tutti` = tutti), `page`, `perPage` (max 200).

Risposta dell'elenco: `{ totale, pagina, perPagina, dati: [...] }`.

Esempio:

```bash
curl -H "x-api-key: dlxk_…" "http://localhost:3060/api/v1/partners?categoria=FIORISTA&stato=attivo"
```

Nel body di POST/PATCH il campo `contatti` (lista di `{ruolo, nome, telefono, email}`)
sostituisce integralmente i contatti esistenti.

## Integrazione con la piattaforma consegne

Nel `.env` dell'API della piattaforma (`deluxy-platform-next/api/.env`):

```
ANAGRAFICHE_URL="http://localhost:3060"
ANAGRAFICHE_API_KEY="<chiave con scrittura>"
```

La sync è best-effort: se il registro non risponde, l'operazione sulla piattaforma
va comunque a buon fine e il mancato invio finisce nei log.

## App già integrate

- **deluxy-platform-next** (scrittura): sync automatica dei partner via
  `AnagraficheSyncService`.
- **deluxy-partner** (lettura): la scheda partner mostra la card "Anagrafica dal
  registro centralizzato" (`src/components/AnagraficaCard.tsx` +
  `src/lib/anagrafiche.ts`), con match per nome.
- **deluxy-suppliers**, **deluxy-scout**: chiavi di sola lettura già generate,
  pronte per l'integrazione (stesso schema di `src/lib/anagrafiche.ts`).

## Architettura di scrittura (multi-sorgente)

Il registro è la fonte di verità: ogni scrittura in arrivo è un *merge* governato
da regole per campo (curati dal team = bloccati, fattuali = vince il più fresco,
additivi = si accumulano), mai una sostituzione. Identità risolta per
riferimento esterno → chiave legale → nome+città. Vedi la nota di architettura
per il modello completo (riferimenti esterni, provenienza per campo, coda proposte)
e le fasi di realizzazione.

## UI

- `/` — Visione globale: elenco con ricerca su tutti i campi, filtri, ordinamenti,
  sezione Novità, cambio stato/interessi in riga, archiviazione, riconciliazione HubSpot
- `/dashboard` — analisi (funnel, aree, interessi, qualità dati) con macro-filtri
- `/sync-hubspot` — confronto e riconciliazione col CRM HubSpot
- `/partner/:id` — scheda con anagrafica, referenti, note, storico stati; `/partner/:id/modifica` per l'edit
- Sidebar con sezioni a espansione: tipologie, stati, interessi, archivio, sync

La UI segue il Deluxy Design System v1.0 (`deluxy-design-system/DESIGN-SYSTEM.md`).
