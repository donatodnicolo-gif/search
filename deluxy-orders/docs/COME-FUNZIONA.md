# Come funziona Deluxy Orders

Manuale funzionale. Fonte di verità del comportamento dell'app: aggiornarlo a
ogni commit che cambia comportamento (regola di lavoro Deluxy n. 0).

## Idea
Tutti gli ordini Shopify dei brand Deluxy in un posto solo, riclassificabili
come serve, leggibili dalle altre app. Orders **non vende** e **non consegna**:
raccoglie, ordina e smista informazioni.

## Le pagine

### Ordini (`/`)
Elenco di tutti gli ordini con KPI (numero, valore, negozi attivi) e filtri:
ricerca a parole (numero, cliente, città, prodotto), brand, stato, categoria di
pagamento, destinazione, etichetta. Ogni riga mostra numero, data, cliente,
totale, pagamento, **stato** (cambiabile al volo dal menu a tendina),
destinazione ed etichette. Il pulsante «Sincronizza da Shopify» avvia l'import.

### Bacheca (`/bacheca`)
Vista kanban: una colonna per ogni stato della pipeline (più «Senza stato»).
Ogni card è un ordine; cambiando lo stato dal menu della card l'ordine «si
sposta» di colonna. Filtro per brand.

### Scheda ordine (`/ordini/:id`)
- **Stato**: pillole per spostare l'ordine nella pipeline.
- **Etichette**: si aggiungono/tolgono con un clic.
- **Classificazione e instradamento**: categoria pagamento, destinazione (app),
  tipo consegna, tipo prodotto, canale, fornitore, responsabile, note interne.
- **Dati Shopify**: pagamento, evasione, gateway, cliente, spedizione, righe.
- **Storia**: ogni import e ogni riclassificazione, con autore e data.

### Impostazioni (`/impostazioni`)
- **Negozi Shopify**: aggiunta/rimozione, attiva/sospendi, tipo di
  autenticazione, ultima sync. Pulsante «Sincronizza ora».
- **Pipeline degli stati**: crea/modifica/elimina stati (nome, colore, ordine,
  quale è predefinito e quali sono «di chiusura»). Eliminare uno stato lascia i
  suoi ordini «senza stato», non li cancella.
- **Etichette**: crea/elimina etichette colorate.
- **Chiavi API**: elenco (nome, permesso, uso), attiva/sospendi. La creazione è
  da riga di comando (`npm run chiave`).

## Import da Shopify
Per ogni negozio attivo si scaricano gli ordini via Admin API GraphQL, in sola
lettura. Si salvano dati ordine, cliente, spedizione e righe. I nuovi ordini
partono dallo stato **predefinito**; gli aggiornamenti **non toccano** stato,
etichette, assegnazione, note e la categoria di pagamento se è stata corretta a
mano. Rilanciare l'import non crea doppioni (chiave negozio + id Shopify).

- **Primo carico (tutto lo storico)**: `npm run import:storico` — nessun filtro
  di data, scarica a pagine e salva a blocchi, con ritentativi automatici se
  Shopify applica i limiti di frequenza. Su negozi grandi dura decine di
  minuti; se si interrompe basta rilanciarlo.
- **Aggiornamento quotidiano** (ultimi 90 giorni): pulsante «Sincronizza» nella
  UI, `npm run sync`, oppure il cron notturno Vercel `/api/cron/sync`
  (protetto da `CRON_SECRET`). Via API: `POST /api/v1/sync?giorni=90`
  (`giorni=tutto` per lo storico completo).

## Classificazione «a piacimento»
- **Stato/pipeline**: dove si trova l'ordine nel flusso.
- **Etichette libere**: raggruppamenti trasversali (urgente, VIP, reso…).
- **Categorie**: pagamento (dedotta e correggibile), tipo consegna, tipo
  prodotto, canale.
- **Instradamento**: app di destinazione, fornitore, responsabile.
- **Dimensioni libere** (`classificazioni`, JSON): coppie chiave→valore per
  classificare senza cambiare lo schema (scrivibili via API).

## Lettura dalle altre app
Le altre app leggono con una chiave di sola lettura (`GET /api/v1/ordini`,
`/api/v1/ordini/:id`, `/api/v1/stati`). Chi ha una chiave di scrittura può anche
riclassificare (`PATCH /api/v1/ordini/:id`). Dettaglio in `README.md`.
