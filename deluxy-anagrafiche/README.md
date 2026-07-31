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

- `GET /api/v1/partners?q=&categoria=&citta=&provincia=&regione=&stato=&statoFinanziario=&statoAnalisi=&interesse=&page=&perPage=`
  → `{ totale, dati: [...] }`. `q` è multi-parola su **tutti i campi** (anagrafica
  + referenti); i filtri si combinano in AND. Città e province sono in MAIUSCOLO.
- `GET /api/v1/partners/:id` — accetta anche il vostro `platformId`.
- `tipoLuogo` dice **che cosa è** quel luogo: `sede` (legale/amministrativa) ·
  `negozio` · `showroom` · `magazzino` · `altro`. Vuoto = non indicato. È la
  risposta a «di queste tre anagrafiche uguali, quale è la sede e quali sono i
  negozi?» — non si deduce dal gruppo: la sede legale può non essere
  l'anagrafica madre.
- `sede` è il nome di **quel luogo** dentro l'insegna (Montenapoleone, Flagship):
  le sedi di un gruppo hanno lo stesso `nome`, quindi per distinguerle mostrate
  `sede` e, se manca, `indirizzo`.
- Per "esiste un partner in questa città?" usate i filtri e guardate `totale`.
- Non tenete una copia locale: rileggete. Se vi serve una cache, invalidatela
  spesso (in futuro arriveranno webhook sui cambi — vedi Fase 3 dell'architettura).

### Dati finanziari (fatturazione) — lettura e scrittura

Ogni partner risponde con un blocco **`datiFinanziari`**: `pec`, `codiceSdi`,
`iban`, `banca`, `metodoPagamento`, `condizioniPagamento`, `gruppoPagamento`,
`noteAmministrative`, `amministrazioneNome/Telefono/Email` (il contatto
amministrativo) e **`aggiornamenti`** — per ogni campo chi l'ha scritto
(`sistema`) e quando (`asOf`). P.IVA e codice fiscale restano ai livelli alti
della risposta.

- **`gruppoPagamento` è facoltativo e vuol dire una cosa sola**: quando è
  valorizzato **paga la centrale indicata per tutte le sedi dell'insegna**, e la
  singola sede non va fatturata a parte. Vuoto = ogni sede paga per sé. Chi
  emette fatture o richieste di pagamento lo legga **prima** dell'IBAN.
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

### Valutazione D2C (feedback interni sulle consegne)

Ogni partner può avere una **valutazione D2C**: quanto bene lavora le consegne
D2C. **I feedback sono interni** — li scrive Deluxy (chi ha seguito l'ordine,
il customer service su un reclamo, chi fa un controllo), non il cliente finale.
Nasce dai singoli **feedback**, non si scrive a mano da fuori.

Ogni partner risponde con il blocco **`valutazioneD2C`**:

```json
"valutazioneD2C": {
  "voto": 4.3,                  // media 1–5, null = nessun feedback
  "feedback": 12,               // quanti feedback l'hanno prodotta
  "etichetta": "Buono",         // Eccellente | Buono | Sufficiente | Critico | Da valutare
  "affidabile": true,           // false = meno di 3 feedback: è un'indicazione
  "ultimoFeedback": "2026-07-20T00:00:00.000Z",
  "aggiornatoIl": "2026-07-20T10:02:11.000Z"
}
```

- **`voto: null` NON è zero.** Vuol dire «da valutare»: quel partner non ha
  ancora feedback. Non mettetelo in fondo a una classifica e non usatelo per
  penalizzare — è dato mancante, non giudizio negativo.
- **`affidabile: false`** = sotto i 3 feedback: mostratelo come indicativo.
- Filtri sull'elenco: `votoD2CMin`, `votoD2CMax`, `feedbackD2C=si|nessuno`.

### Valet (le persone che consegnano)

`GET /api/v1/valet` e `GET /api/v1/valet/:id` — **sola lettura**. Serve a chi oggi
si tiene una copia locale dei valet solo per nominarli: Customer Service, per
attribuire la colpa di un reclamo, può leggerli da qui.

- Filtri: `q`, `stato` (`in_servizio`|`sospeso`|`cessato`), `provincia` (guarda
  anche le **province servite**), `attivo=false|tutti`, `page`, `perPage`.
- `:id` accetta l'id del registro **o** il `platformId` (l'id nella piattaforma
  consegne): non serve una tabella di traduzione.
- La risposta ha `nomeCompleto` già composto e `provinceServite` come **lista**.
- **Qui non ci sono paghe, disponibilità, stipendi né IBAN**: quelli stanno nella
  piattaforma consegne, che è il master dell'operatività e che i valet li paga.

### Reclami di Customer Service: mandate il reclamo, non il voto

Se chiudete un reclamo con la colpa al partner, **non calcolate voi le stelle**:
mandate `gravita` (1 lieve · 2 media · 3 grave) e `stato` del reclamo, e il
registro ricava il voto. Così due app che segnalano lo stesso problema producono
lo stesso voto, e la regola si cambia in un punto solo.

| gravità | reclamo aperto | risolto/chiuso |
| --- | --- | --- |
| 1 lieve | 3 | 4 |
| 2 media | 2 | 3 |
| 3 grave | 1 | 2 |

Rimediare conta (+1 quando è chiuso) e un reclamo **non arriva mai a 5**: quello
resta ai giudizi positivi. Esempio:

```json
{ "riferimento": { "sistema": "messaging", "idEsterno": "<id partner in CS>" },
  "idEsterno": "<id del reclamo>", "gravita": 3, "stato": "risolto",
  "casistica": "Consegna mai arrivata", "ordineNumero": "#1234",
  "autore": "customer service" }
```

Quando il reclamo cambia stato **rimandate lo stesso `idEsterno`**: il feedback
viene aggiornato (il voto sale se è stato risolto) e non se ne crea un secondo.
I campi che non rispedite restano quelli di prima. Alias accettati:
`descrizione`/`esito` → commento, `ordineNumero` → ordine.

**Per mandare un feedback** (con un voto vostro): `POST /api/v1/feedback` con una chiave di
scrittura piena o con lo scope dedicato `--scrittura-feedback` (non tocca il
golden record del partner).

```bash
curl -X POST https://deluxy-anagrafiche.vercel.app/api/v1/feedback \
  -H "x-api-key: dlxk_…" -H "content-type: application/json" -d '{
    "riferimento": {"sistema": "orders", "idEsterno": "1234"},
    "idEsterno": "reclamo-9981",
    "voto": 2,
    "origine": "reclamo", "ordine": "#10231", "autore": "Eleonora",
    "motivi": ["puntualita"],
    "commento": "Consegna in ritardo di 3 ore, cliente richiamato",
    "data": "2026-07-20"
  }'
```

- **Il partner si aggancia** con `partnerId`, oppure `riferimento{sistema,idEsterno}`,
  `platformId`, o `negozio`+`citta`. Se non aggancia risponde **404**: il
  feedback non viene attribuito a un partner a caso. Per trovare l'id la prima
  volta usate `GET /api/v1/partners/match`.
- **`voto`** è obbligatorio. Se la vostra scala non è 1–5 mandate anche
  `scala` (es. `"scala": 10`): il registro normalizza su 5 e conserva il valore
  grezzo. Un voto fuori scala è un **400**, non un voto a caso.
- **`origine`** dice da dove nasce il giudizio (`consegna`, `reclamo`,
  `controllo`, `visita`, `segnalazione`, `altro`) e **`autore`** chi l'ha dato
  dentro Deluxy: mandatelo sempre, un giudizio anonimo vale meno.
- **`idEsterno`** (il vostro id di quel feedback) rende la chiamata
  **idempotente**: rimandandolo aggiornate quel feedback invece di crearne un
  secondo — attenzione, la riga viene sostituita con quello che mandate, quindi
  rispedite il record completo. Senza `idEsterno` ogni chiamata crea un
  feedback nuovo.
- **`motivi`** accetta solo i tag del catalogo (`puntualita`,
  `qualita_prodotto`, `presentazione`, `biglietto`, `comunicazione`,
  `cortesia`, `conformita_ordine`); gli altri vengono scartati. Il testo libero
  va in `commento`: non deducete i tag dal testo.
- La risposta contiene il feedback salvato e la `valutazioneD2C` aggiornata.
- Per rileggerli: `GET /api/v1/feedback?partnerId=…&origine=&dal=&al=&votoMin=&votoMax=`
  (chiamando con `partnerId` la risposta include anche la valutazione).

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
- **Non impostate voi** `stato` (= stato **commerciale**), `interessi`, `account`:
  li cura il team e vengono ignorati (li trovate in `in_revisione` nella
  risposta). Le nuove anagrafiche nascono come `prospect`.
  **Unica eccezione, automatica**: le scritture che arrivano dall'**app di
  ricerca fornitori** (chiave/`sistema` che contiene `supplier`/`fornitor` o
  che inizia per `search`) aggiungono da sé l'interesse **«Affiliazioni»** —
  chi entra o passa di lì lavora per noi. È additivo: non tocca gli altri
  interessi e resta modificabile dal registro.
- `statoFinanziario` e `statoAnalisi` invece **si scrivono**: nascono in FINANCE
  (deluxy-partner), quindi seguono la regola dei campi fattuali (vince il più
  fresco `asOf`, a parità la sorgente più autorevole; la UI del registro ha
  sempre l'ultima parola). Valori in «Le tre dimensioni di stato».
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

### Le tre dimensioni di stato

Ogni azienda ha **tre stati indipendenti** (catalogo in `src/lib/stati.ts`):

| Dimensione | Campo | Valori | Chi la governa |
| --- | --- | --- | --- |
| **Commerciale** | `stato` (alias in lettura/scrittura: `statoCommerciale`) | `prospect`, `in_contatto`, `in_attesa`, `in_trattativa`, `da_ricontattare`, `attivo` (= Partner), `non_interessato`, `dismesso` | il team commerciale (curato: le app non lo scrivono) |
| **Finanziario** | `statoFinanziario` | `da_verificare` (predefinito), `regolare`, `in_ritardo`, `insoluto`, `piano_di_rientro`, `bloccato` | amministrazione / FINANCE |
| **Analisi** | `statoAnalisi` | `pp` (P.P., pari perimetro), `nuovo`, `dismesso`; vuoto = mai analizzata | FINANCE (`Partner.clienteAnno` di deluxy-partner) |

In scrittura `statoAnalisi` accetta anche le forme di FINANCE (`"P.P."`,
`"Nuovo"`, `"Dismesso"`) e le normalizza sugli slug. I cambi delle tre
dimensioni finiscono tutti in `PassaggioStato`, con prefisso `fin:` e `ana:`
per le due non commerciali.

`Partner`: nome, ragione sociale, categoria (BOUTIQUE, FIORISTA, PASTICCERIA, …),
i tre stati qui sopra, `interessi` (array
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

`FeedbackD2C`: il giudizio **interno** su come il partner ha lavorato una
consegna D2C — `voto` 1–5 (normalizzato da `votoOriginale`/`scala`), `origine`
(consegna/reclamo/controllo/visita/segnalazione), `sistema` (chi l'ha mandato)
+ `idEsterno` (idempotenza), `ordine`, `autore` (chi ha valutato, in Deluxy),
`commento`, `motivi[]`, `dataFeedback`. Da questi si ricalcolano gli aggregati
sul partner (`votoD2C`, `numeroFeedbackD2C`, `ultimoFeedbackD2C`,
`votoD2CAggiornatoIl`): quelli sono di sola lettura, si scrive solo un feedback.
**Nessun feedback = nessun voto** («Da valutare»), mai zero.

`Valet`: le persone che fanno le consegne — anagrafica e recapiti. Paghe,
province assegnate, disponibilità e stipendi **restano nella piattaforma
consegne**: qui non ci sono, e nemmeno l'IBAN. Si leggono con
`GET /api/v1/valet` (sola lettura).

`Modifica`: registro delle modifiche (chi ha cambiato cosa, da che valore a che
valore). Il soggetto è un'azienda o un valet.

`ApiKey`: chiavi delle app client; nel DB c'è solo lo SHA-256.

## Chiavi API

Si gestiscono dalla pagina **`/chiavi`** dell'app (voce «Chiavi API» in fondo alla
sidebar): l'elenco di chi chiama il registro — con che tipologia, con che prefisso e
quando l'ha fatto l'ultima volta — e i comandi che servono: **＋ Nuova chiave**,
**Permessi** (cambia tipologia), **Rigenera**, **Sospendi/Riattiva**, **Elimina**.

Le **tipologie** sono i mestieri delle chiavi; la lettura è sempre inclusa:

| Tipologia | Cosa aggiunge alla lettura | Chi la usa |
| --- | --- | --- |
| Sola lettura | niente | deluxy-suppliers, deluxy-scout, deluxy-messaging |
| Scrittura piena | POST/PATCH/DELETE dei partner | deluxy-platform, deluxy-partner |
| Driver di prima parte | solo POST dei partner, ma può dichiarare stato e interessi | deluxy-scout-partner |
| Archivio referenti | `POST /api/v1/referenti/archivia` | deluxy-scout-referenti |
| Feedback D2C | `POST /api/v1/feedback` | nessuna, ancora |

Stessa tabella, stesso effetto, anche da terminale:

```bash
npm run chiave -- deluxy-platform --scrittura   # lettura + scrittura (solo la piattaforma consegne)
npm run chiave -- deluxy-partner                # sola lettura
npm run chiave -- deluxy-suppliers              # sola lettura
npm run chiave -- deluxy-scout                  # sola lettura
npm run chiave -- <app>-feedback --scrittura-feedback  # lettura + invio feedback D2C
```

La chiave si vede **una volta sola**, alla creazione: copiarla nel `.env` dell'app
client (consegnarla per canale privato, mai committarla). Il nome è la **sorgente**
che comparirà nella provenienza dei dati e nel ranking di fiducia: per questo non si
rinomina, si rigenera. Rigenerare **revoca** la chiave precedente all'istante;
«Sospendi» è la via reversibile per spegnere un'app senza perdere la traccia.

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
| GET | `/api/v1/feedback` | lettura | Feedback D2C: `partnerId`, `origine`, `sistema`, `votoMin/votoMax`, `dal/al`, `page`, `perPage` |
| POST | `/api/v1/feedback` | scrittura **o** feedback | Registra un giudizio interno sul partner e ricalcola la valutazione D2C |

Filtri di `GET /partners`: `q` (multi-parola su tutti i campi e i contatti),
`categoria`, `citta`, `provincia`, `regione`, `stato` (commerciale),
`statoFinanziario`, `statoAnalisi` (`nessuno` = mai analizzate), `fonte`,
`platformId`, `votoD2CMin`/`votoD2CMax`, `feedbackD2C` (`si` = con feedback,
`nessuno` = mai valutate), `attivo` (`false` = solo disattivati, `tutti` =
tutti), `page`, `perPage` (max 200).

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
- `/dashboard` — analisi (funnel, aree, interessi, **valutazione D2C**, qualità dati) con macro-filtri
- `/sync-hubspot` — confronto e riconciliazione col CRM HubSpot
- `/partner/:id` — scheda con anagrafica, **valutazione D2C** (voto, distribuzione,
  elenco dei giudizi interni, ＋ Feedback per registrarne uno), referenti, note,
  storico stati; `/partner/:id/modifica` per l'edit
- Sidebar con sezioni a espansione: tipologie, stati, interessi, archivio, sync

La UI segue il Deluxy Design System v1.0 (`deluxy-design-system/DESIGN-SYSTEM.md`).
