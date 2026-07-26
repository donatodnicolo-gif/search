# Deluxy Scripts — i testi pronti dell'azienda

**Porta 3170 · [deluxy-scripts.vercel.app](https://deluxy-scripts.vercel.app)**

Un posto solo dove stanno le parole con cui Deluxy parla ai clienti: offerte e
script di vendita, inviti a eventi, presentazioni aziendali, solleciti, risposte
ai reclami. Si scrivono una volta, si richiamano quando servono — in un'email,
in un messaggio WhatsApp, in una presentazione — **con i dati di chi li riceve
già dentro**.

## Le tre idee

1. **Un testo è un messaggio con dei buchi.** I buchi si scrivono
   `{{NOME_CLIENTE}}` — maiuscolo con underscore. Valgono nel corpo e
   nell'oggetto dell'email.
2. **Ogni buco è una variabile dichiarata**, con tipo (testo, numero, data,
   scelta fra opzioni) e, se ha senso, un valore fisso. Le variabili scritte nel
   testo e non ancora dichiarate **vengono create da sole** al salvataggio.
3. **Il testo si accende per una app alla volta.** Per ogni app abilitata le
   variabili possono valere qualcosa di diverso: la `{{FIRMA}}` di Customer
   Service non è quella del commerciale.

Il valore di una variabile si sceglie in quest'ordine:

| Ordine | Da dove | Quando |
| --- | --- | --- |
| 1 | valore impostato **per quell'app** | se c'è (firma, recapiti, tono) |
| 2 | **valore fisso** della variabile | se il primo manca |
| 3 | si compila **al momento di mandarlo** | il nome del cliente, la data: cose che si sanno solo lì per lì |

Quello che resta scoperto non viene mai nascosto: nel testo si continua a
leggere `{{DATA}}`, e l'app lo elenca in `daCompilare`. Meglio un segnaposto in
vista, che si nota prima di premere invio, di uno spazio vuoto in mezzo a una
frase.

## Come si usa, in pratica

Nella pagina di un testo, il riquadro **«Usa questo testo»**:

- si sceglie **per quale app** lo si vuole (cambiano firma e recapiti);
- si compilano al volo le variabili rimaste — quello che si scrive lì **non
  viene salvato**, resta nella pagina;
- si porta via il messaggio: **Copia il testo**, **Apri in WhatsApp** (per i
  canali WhatsApp e SMS) o **Scrivi l'email** (apre il client di posta con
  oggetto e corpo già dentro).

## Avvio

```bash
cd C:/Users/nicol/scoutwt/deluxy-scripts && npm install && npm run dev
```

Prima volta, per il database (Postgres condiviso, schema `scripts`):

```bash
cd C:/Users/nicol/scoutwt/deluxy-scripts && npm run configura-db -- ../deluxy-orders/.env && npx prisma db push && npm run seed:app
```

Verifica prima di ogni commit:

```bash
cd C:/Users/nicol/scoutwt/deluxy-scripts && npx tsc --noEmit && npm run build
```

## Le pagine

- **Testi** (`/`) — l'elenco, con ricerca dentro titolo, oggetto e testo, e
  filtri per categoria, canale, app e stato (attivi / archiviati).
- **Dettaglio** (`/script/<slug>`) — il riquadro per usarlo, il testo, le
  variabili e le app per cui è acceso con i rispettivi valori.
- **App collegate** (`/app`) — chi può usare i testi. Ci stanno le app Deluxy ma
  anche reparti o partner esterni.
- **Impostazioni** (`/impostazioni`) — chiavi API e istruzioni di integrazione.

## API per le altre app

Header obbligatorio `x-api-key`. Il parametro `app` è la chiave dell'app che
chiede: si ricevono **solo** i testi accesi per lei, già composti con i suoi
valori.

| Endpoint | Cosa torna |
| --- | --- |
| `GET /api/v1/health` | che la chiave è buona, più due conteggi |
| `GET /api/v1/app` | le app collegate (le chiavi da usare in `?app=`) |
| `GET /api/v1/script?app=<chiave>` | tutti i testi accesi per quell'app |
| `GET /api/v1/script/<slug>?app=<chiave>` | uno solo |
| `GET /api/v1/script/<slug>/testo?app=<chiave>` | solo il messaggio, in `text/plain` (oggetto nell'header `X-Oggetto`) |

```bash
curl -H "x-api-key: $SCRIPTS_API_KEY" \
  "https://deluxy-scripts.vercel.app/api/v1/script?app=deluxy-messaging"
```

Nel JSON: `testo` e `oggetto` sono le versioni composte, `corpo` quella coi
segnaposto, `variabili` dice per ognuna da dove viene il valore (`app`,
`predefinito`, `mancante`) e `daCompilare` elenca quelle ancora scoperte —
quelle che l'app che usa il testo riempirà con i dati che ha già (l'ordine, il
cliente) prima di mandarlo.

Una chiave si crea dal terminale — viene stampata una sola volta:

```bash
cd C:/Users/nicol/scoutwt/deluxy-scripts && npm run chiave -- <nome-app>
```

## Ingresso dal Hub (Single Sign-On)

Aprendo la tessera **Scripts** dal portale non si ridigita la password: il Hub
manda un token cifrato (AES-256-GCM, valido 60 secondi) su `/api/sso`, l'app lo
legge e apre da sé la sessione. Serve che `HUB_SSO_SECRET` abbia lo **stesso
valore** qui e nel Hub.

Se il token manca, è scaduto, è stato manomesso o è destinato a un'altra app,
si finisce sul `/login` di sempre: il salto salta, l'accesso no.

## Variabili d'ambiente

Solo i nomi (i valori stanno nella cassaforte del Hub): vedi
[.env.example](.env.example). `SCRIPTS_APP_PASSWORD` è obbligatoria in
produzione — senza, la UI sarebbe pubblica.

Stato del lavoro e cosa manca: [docs/HANDOFF.md](docs/HANDOFF.md).
