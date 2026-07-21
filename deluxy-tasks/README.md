# Deluxy Tasks

Registro centralizzato delle **attività (task) di una persona**: l'elenco unico
delle cose da fare di ogni utente, condiviso fra tutte le app dell'ecosistema
Deluxy.

- Ogni app (Consegne, Scout, AI Mail, Finance, Budgets, Anagrafiche, …) **manda
  qui** le task che riguardano una persona.
- Tutte le app **rileggono da qui**: così l'utente ha un solo elenco, non uno
  per app.
- L'utente è identificato dall'**email** (la stessa del Deluxy Hub).
- Le letture usano una chiave API di sola lettura; le scritture una chiave con
  permesso di scrittura (una per app), sempre **server-to-server**.

Stack: Next.js 15 + Prisma + **Postgres condiviso** delle app Deluxy (stesso
cluster di hub/anagrafiche, schema `tasks`). Porta **3090**.

---

## Per le altre app Deluxy — come integrarsi

**Regola d'oro:** una task è di una persona (email). Quando la mandi, indica
sempre un tuo `idEsterno` stabile: è così che la aggiorni senza creare doppioni.

### Collegamento

- Base URL produzione: `https://deluxy-tasks.vercel.app` (in locale `http://localhost:3090`)
- Autenticazione: header `x-api-key: <chiave-della-tua-app>` (variabile
  d'ambiente **lato server**, es. `TASKS_API_KEY` — mai nel codice del browser).
- Le letture (GET) hanno il CORS aperto; le scritture vanno fatte server-to-server.
- Salute: `GET /api/v1/health` → `{ ok: true, servizio: "deluxy-tasks" }`.

### Se leggi (tutte le app)

- `GET /api/v1/tasks?utente=<email>&stato=&sistema=&priorita=&tag=&q=&aperte=true&scadenzaEntro=<ISO>&page=&perPage=`
  → `{ totale, pagina, perPagina, dati: [...] }`.
  - `utente` = email dell'assegnatario (la chiave condivisa).
  - `aperte=true` → solo task ancora da fare (esclude completate/annullate).
  - `q` = ricerca a parole su titolo, descrizione, utente, contesto e tag.
  - `scadenzaEntro` = solo task con scadenza ≤ data (ISO 8601).
- `GET /api/v1/tasks/:id` — la task per id nativo di Tasks.
- `GET /api/v1/tasks/by-ref/:sistema/:idEsterno` — ritrova la **tua** task senza
  conoscerne l'id nativo (usa la coppia sistema+idEsterno che hai mandato tu).

### Se scrivi (chiave con scrittura)

- `POST /api/v1/tasks` → **upsert** sulla coppia `(sistema, idEsterno)`.
  201 = creata, 200 = aggiornata. `sistema` di default è il nome della tua
  chiave; puoi sovrascriverlo nel body.

  ```jsonc
  // Body minimo
  {
    "idEsterno": "attivita-482",       // il tuo id stabile (per non duplicare)
    "utenteEmail": "gaia@deluxy.it",   // obbligatorio: a chi è assegnata
    "titolo": "Confermare valletto"    // obbligatorio
  }
  ```

  Campi opzionali: `utenteNome`, `descrizione`, `stato`
  (`aperta|in_corso|completata|annullata`), `priorita`
  (`bassa|media|alta|urgente`), `scadenza` (ISO), `creataDa`, `link` (deep link
  per riaprire la task nella tua app), `contestoTipo`/`contestoId`/`contestoEtichetta`
  (a cosa si riferisce: un partner, una consegna, una mail…), `tag` (array),
  `extra` (JSON libero tuo), e i **livelli di priorità** (vedi sotto).

### Livelli di priorità con date diverse

Una task può avere **più livelli**, ognuno con la sua priorità e la sua data —
es. una data ideale e una data limite. Mandali in `livelli`:

```jsonc
{
  "idEsterno": "bil-Q3",
  "utenteEmail": "gaia@deluxy.it",
  "titolo": "Chiudere il bilancio",
  "livelli": [
    { "priorita": "media",   "data": "2026-07-30", "nota": "ideale" },
    { "priorita": "urgente", "data": "2026-07-22", "nota": "limite" }
  ],
  "livelloSceltoNota": "ideale"   // opz.: quale rendere effettivo (default: la scadenza più vicina)
}
```

`priorita` e `scadenza` **effettive** della task rispecchiano sempre il livello
scelto, così chi non gestisce i livelli legge comunque un valore singolo. Il team
può cambiare il livello attivo dalla UI. Mandare `livelli` **sostituisce** l'intero
set; ometterlo lascia i livelli esistenti invariati.

- `PATCH /api/v1/tasks/:id` — modifica mirata (es. `{ "stato": "completata" }`).
  Completando si valorizza `completataIl`; riaprendo si azzera.
- `DELETE /api/v1/tasks/:id` — archiviazione (soft delete: `attiva=false`). La
  task non sparisce, resta ritrovabile via `by-ref`.

### Idempotenza / niente doppioni

Manda **sempre** lo stesso `idEsterno` per la stessa task: la seconda POST
aggiorna invece di creare. Se una task nella tua app viene chiusa, mandaci
`stato: "completata"` (o `DELETE` per archiviarla): l'elenco condiviso resta
allineato.

---

## Sincronizzazione bidirezionale (stabilire gli aggiornamenti)

Tasks sa a quale progetto appartiene ogni task (`sistema`), conserva lo **stato
di aggiornamento** che ogni progetto le comunica e permette di stabilire chi ha
il dato più recente. La sincronizzazione va in **due direzioni**.

### 1. Freschezza: chi vince quando due scritture si accavallano

Manda con ogni `POST` due campi che descrivono lo stato del tuo dato:

- `asOf` (ISO 8601) — **quando** la task era vera da te. Se mandi una scrittura
  con `asOf` più vecchio dell'ultimo registrato, Tasks la **ignora**
  (`esito: "ignorata_obsoleta"`): niente regressioni. Senza `asOf` la scrittura
  viene sempre applicata.
- `revisioneOrigine` — la **tua** versione della task (numero, hash, ETag…):
  viene conservata e restituita, così puoi riconoscere il tuo stato.

Ogni modifica fa crescere una **`revisione`** interna di Tasks (intero).

### 2. Pull: "cosa è cambiato" dall'ultima volta

- `GET /api/v1/tasks/changes?since=<revisione>&sistema=<tuo>&perPage=`
  → `{ cursore, altre, conteggio, dati: [...] }`. Ti restituisce solo le task con
  `revisione > since` (incluse le archiviate). Conserva `cursore` e ripassalo
  come `since` la volta dopo: così recuperi gli aggiornamenti persi anche se un
  callback non è arrivato. `altre: true` = c'è un'altra pagina (rifai con il
  nuovo cursore).

### 3. Callback (push): Tasks "richiama" il tuo progetto

Quando una task cambia **qui** e la modifica **non** arriva dal tuo progetto
(es. il team la completa dalla UI condivisa), Tasks fa un `POST` al tuo webhook.

- Registra il progetto: `POST /api/v1/progetti` (chiave scrittura) con
  `{ "sistema": "scout", "nome": "Scout", "callbackUrl": "https://…/tasks-callback", "callbackSegreto": "…" }`.
  (in locale: `npm run progetto -- scout "Scout" https://… --segreto …`).
- Tasks chiama il `callbackUrl` con il corpo
  `{ evento, task: {…}, inviatoIl }` dove `evento` ∈
  `creata | aggiornata | completata | archiviata`.
- **Verifica la firma**: header `x-tasks-signature: sha256=<hmac>` =
  HMAC-SHA256 del corpo grezzo con il tuo `callbackSegreto`. Se non combacia,
  scarta la chiamata.
- Il callback è **best-effort** (at-least-once, un timeout di 5s): trattalo in
  modo idempotente e, come rete di sicurezza, sincronizza comunque in pull con
  `changes`. Aggiornando la tua copia **non** rimandare la stessa modifica a
  Tasks come se fosse nuova (eviti i rimbalzi): l'origine che riscrive la propria
  task non genera un altro callback.

---

## Accesso alla UI (chi vede cosa)

L'app **non tiene un proprio elenco utenti**: gira sullo stesso cluster Postgres
del Deluxy Hub e autentica contro `hub."Utente"` (email + password del portale).

- **Admin** → vede **tutte** le task (e può filtrare per persona con `?utente=`).
- **Non admin** → vede le **proprie** task + quelle della propria **squadra**
  (gestione squadre: `npm run squadra`).
- La sessione è un cookie firmato (`TASKS_SESSION_SECRET`, come il Hub). Se il
  segreto non è impostato (sviluppo locale) l'accesso è aperto e la vista è da admin.
- Le API `/api/v1` **non** usano la sessione: usano le chiavi API (`x-api-key`).

## Sviluppo locale

```bash
npm install
# collega il Postgres condiviso (schema "tasks") copiando le stringhe da un'altra app:
npm run db:condiviso -- ../deluxy-hub/.env.vercel-prod
npm run db:push            # crea le tabelle nello schema "tasks"
npm run chiave -- deluxy-scout --scrittura   # crea una chiave (stampata una volta)
npm run seed:demo         # (facoltativo) qualche task di esempio (una con più livelli)
npm run dev               # http://localhost:3090
```

- **Segreti**: `.env` è in `.gitignore`, non committarlo mai.

## Chiavi API

`npm run chiave -- <nome-app> [--scrittura]` crea/rigenera la chiave di un'app.
Viene stampata una sola volta; nel DB resta solo lo SHA-256. Le app che solo
leggono ricevono una chiave senza `--scrittura`.

Convenzione: le app che generano task ricevono `--scrittura` (platform, scout,
mail, partner, budgets, anagrafiche…); chi mostra soltanto l'elenco può avere
una chiave di sola lettura.
