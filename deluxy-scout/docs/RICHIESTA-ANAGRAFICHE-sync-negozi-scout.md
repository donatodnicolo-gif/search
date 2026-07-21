# Richiesta a Deluxy Anagrafiche — sincronizzazione negozi da Scout

Deluxy Scout deve **portare nel registro i negozi lavorati**: quando in Scout un
negozio viene creato o cambia stato (es. diventa **Cliente**), vogliamo
creare/aggiornare il **partner** corrispondente nel registro.

Scelta condivisa: la scrittura la fa **Scout con una chiave a scope ristretto**
(come già fatto per l'archiviazione dei referenti), solo **server-side** dentro
la Edge Function `anagrafiche` (mai nel browser).

## Cosa serve da voi

### 1. Una chiave con scope "scrittura partner" per Scout
L'attuale `deluxy-scout-referenti` scrive solo i referenti (POST /partners → 403).
Serve una nuova chiave, es. **`deluxy-scout-partner`**, che possa fare
`POST /api/v1/partners` (upsert-merge), possibilmente **limitata ai campi
fattuali** (nome, città, indirizzo, categoria, **stato**, **interessi**) e ai
soli record con riferimento `sistema=scout`, senza toccare i campi curati dal
team (che restano bloccati dalla vostra logica di merge).

La consegnate a parte; noi la impostiamo come secret **`ANAGRAFICHE_PARTNER_KEY`**.

### 2. Conferma della chiamata (già usa il vostro endpoint esistente)
Scout chiama **`POST /api/v1/partners`** (nessun endpoint nuovo necessario), con
`x-api-key: <deluxy-scout-partner>` e questo body:

```json
{
  "sistema": "scout",
  "idEsterno": "<place_id di Scout>",
  "nome": "Bonpoint",
  "citta": "Milano",
  "indirizzo": "Via Alessandro Manzoni, 15",
  "categoria": "moda",
  "stato": "attivo",
  "interessi": ["Consegne"],
  "asOf": "2026-07-21T…Z"
}
```

Identità via `sistema+idEsterno` (upsert-merge): al primo invio **crea** il
partner con riferimento esterno `scout`, ai successivi **aggiorna** (merge per
campo secondo le vostre regole).

### 3. Mappatura stato (Scout → registro) — da confermare
Scout invia già lo stato del registro tradotto:

| Stato in Scout | → Stato registro |
|---|---|
| `da_visitare` | `prospect` |
| `visitato` | `in_contatto` |
| `cliente` | **`attivo`** |
| `perso` | `non_interessato` |

Confermate che va bene (e che `attivo` è lo stato giusto per "cliente Deluxy").

### 4. Interessi (linee)
Scout invia la/e **linea/e** come `interessi` (nomi). Voi filtrate contro il
vostro catalogo (`src/lib/interessi.ts`): i nomi fuori catalogo vengono scartati
in silenzio. Se le linee Deluxy non combaciano col vostro catalogo interessi,
ditecelo: Scout è comunque il **master delle linee** (API `linee`), quindi
possiamo allineare i due cataloghi.

## Lato Scout: già pronto
- Edge Function `anagrafiche`, azione **`upsert_partner`** → `POST /api/v1/partners`
  con `ANAGRAFICHE_PARTNER_KEY`, mappatura stato inclusa.
- Agganciata a: **creazione** negozio, **cambio stato**, **visita rapida** (esito).
  Tutto **best-effort**: se la chiave manca o il registro non risponde, l'azione
  dell'utente in Scout va a buon fine lo stesso e si potrà risincronizzare.

Appena avete la chiave, impostiamo il secret e i negozi lavorati in Scout
iniziano a fluire nel registro. Nessun'altra modifica lato Scout necessaria.
