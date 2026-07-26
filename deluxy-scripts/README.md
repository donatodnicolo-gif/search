# Deluxy Scripts — l'archivio degli script

**Porta 3170.** Un posto solo dove stanno tutti gli script operativi del gruppo:
Google Ads Script, script Node di import/export, SQL di manutenzione, snippet
Liquid dei temi. Ogni script ha le **sue variabili** e si **abilita o disabilita
per singola app**; le app se li leggono via API a chiave.

> Non sostituisce [scripts/README.md](../scripts/README.md), che resta il
> catalogo dei file `.mjs`/`.ts` versionati nel repo. Qui dentro vivono gli
> script che **non hanno un file** nel repo o che vanno **parametrizzati per
> app**: quelli che oggi si copiano a mano da una chat all'altra.

## Le tre idee

1. **Uno script è un testo con dei buchi.** I buchi si scrivono
   `{{NOME_VARIABILE}}` — maiuscolo con underscore. La sostituzione è testuale,
   quindi funziona in JavaScript, SQL, bash, Liquid, YAML, in tutto.
2. **Ogni buco è una variabile dichiarata**, con tipo (testo, numero,
   vero/falso, scelta fra opzioni, segreto) e un valore predefinito. Le
   variabili scritte nel testo e non ancora dichiarate **vengono create da sole**
   al salvataggio.
3. **Lo script si accende per una app alla volta.** Per ogni app abilitata le
   variabili possono valere qualcosa di diverso: lo stesso script serve Google
   Ads Flowers con `BRAND=flowers` e Google Ads Gifts con `BRAND=gifts`.

Il valore di una variabile si sceglie in quest'ordine:

| Ordine | Da dove | Quando |
| --- | --- | --- |
| 1 | valore impostato **per quell'app** | se c'è |
| 2 | **valore predefinito** della variabile | se il primo manca |
| 3 | nessuno → resta il segnaposto | e la variabile finisce in `daCompilare` |

**I segreti non si salvano mai.** Una variabile di tipo `segreto` (token,
password, chiave API) non ha valore né nel database né nelle API: resta
`{{COSÌ}}` e si compila nel riquadro «Script pronto da copiare», dove il valore
non lascia il browser. I segreti veri stanno nella cassaforte del Hub.

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

- **Script** (`/`) — l'elenco, con ricerca anche dentro il codice e filtro per
  app, linguaggio e stato (attivi / archiviati).
- **Dettaglio** (`/script/<slug>`) — il testo dello script, le variabili, le app
  per cui è acceso con i rispettivi valori, e il riquadro per copiarlo già
  composto.
- **App collegate** (`/app`) — chi può ricevere gli script. Ci stanno le app
  Deluxy ma anche destinazioni che app non sono (Google Ads, Shopify).
- **Impostazioni** (`/impostazioni`) — chiavi API e istruzioni di integrazione.

## API per le altre app

Header obbligatorio `x-api-key`. Il parametro `app` è la chiave dell'app che
chiede: si ricevono **solo** gli script accesi per lei, già composti con i suoi
valori.

| Endpoint | Cosa torna |
| --- | --- |
| `GET /api/v1/health` | che la chiave è buona, più due conteggi |
| `GET /api/v1/app` | le app collegate (le chiavi da usare in `?app=`) |
| `GET /api/v1/script?app=<chiave>` | tutti gli script accesi per quell'app |
| `GET /api/v1/script/<slug>?app=<chiave>` | uno solo |
| `GET /api/v1/script/<slug>/testo?app=<chiave>` | solo il testo, in `text/plain` |

```bash
curl -H "x-api-key: $SCRIPTS_API_KEY" \
  "https://deluxy-scripts.vercel.app/api/v1/script?app=deluxy-marketing"
```

Nel JSON: `testo` è la versione composta, `corpo` quella coi segnaposto,
`variabili` dice per ognuna da dove viene il valore (`app`, `predefinito`,
`segreto`, `mancante`) e `daCompilare` elenca quelle obbligatorie ancora
scoperte.

Una chiave si crea dal terminale — viene stampata una sola volta:

```bash
cd C:/Users/nicol/scoutwt/deluxy-scripts && npm run chiave -- <nome-app>
```

## Variabili d'ambiente

Solo i nomi (i valori stanno nella cassaforte del Hub): vedi
[.env.example](.env.example). `SCRIPTS_APP_PASSWORD` è obbligatoria in
produzione — senza, la UI sarebbe pubblica.

Stato del lavoro e cosa manca: [docs/HANDOFF.md](docs/HANDOFF.md).
