# Deluxy Customer Service

Il **servizio clienti** dell'ecosistema Deluxy. Si aprono e si lavorano i **reclami**
sugli ordini — ognuno con una casistica, le azioni da eseguire e la colpa attribuita a un
**valet** o a un **partner**, da cui nascono i **giudizi** — e attorno restano gli
**ordini da lavorare** e l'**inbox unificata**: **WhatsApp**, **Messenger**, **Instagram**
(API ufficiali Meta) e la **chat del sito** in un'unica schermata.

- Porta di sviluppo: **3140** (`npm run dev`)
- Stack: Next.js 15 (App Router) + Prisma + Postgres, stesso impianto di `deluxy-mail/`
- Design: Deluxy Design System (token in `src/app/tokens.css`)

> L'app si chiamava "Deluxy Messaggi". Sono cambiate solo le **etichette visibili**:
> cartella (`deluxy-messaging/`), progetto Vercel, schema Postgres `messaging` e cookie
> `msg_session` restano quelli, perché rinominarli romperebbe URL, deploy e sessioni.

## Reclami (Customer Service)

**Il giro completo.** Da ogni ordine il bottone **Reclamo** apre il form già pieno con
ordine, cliente e recapiti. Si scegle una **casistica** e questa riempie da sola la
gravità, la colpa tipica e la **checklist delle azioni** da eseguire; poi si attribuisce
la **colpa** e si lavora il reclamo (Aperto → In lavorazione → Risolto → Chiuso).

**Casistiche** (`/reclami/casistiche`). Il catalogo dei tipi di reclamo: nome, gravità
(lieve/media/grave), colpa tipica e le azioni consigliate, una per riga. Un pulsante
carica le **7 casistiche più comuni** (ritardo, mancata consegna, prodotto danneggiato,
prodotto errato, indirizzo sbagliato, biglietto, comportamento del corriere) da adattare —
e non le duplica se le ricarichi.

**Colpa.** Un reclamo può essere imputato a un **valet** (chi consegna: registro locale in
`/reclami/valet`), a un **partner** (letto dal registro Anagrafiche, nessuna copia locale),
a **Deluxy** stessa, al **cliente**, oppure restare *da attribuire*. I giudizi si danno
solo a valet e partner.

**Giudizi** (`/reclami/giudizi`). Per ogni valet e partner, i reclami che gli sono stati
imputati diventano un punteggio e un'etichetta: **Ottimo · Buono · Attenzione · Critico**.
Il punteggio è la somma delle gravità (1/2/3), **dimezzata per i reclami risolti o
chiusi** — rimediare conta. Soglie: 0 Ottimo, ≤2 Buono, ≤6 Attenzione, oltre Critico. Così
un solo reclamo grave ancora aperto accende già "Attenzione", mentre lo stesso reclamo
risolto torna "Buono". Accanto al giudizio automatico si può registrare un **giudizio
manuale** (voto 1-5 + nota): non lo sostituisce, gli si affianca, così resta sempre
visibile da cosa nasce il numero.

## Come funziona (messaggistica)

**In entrata.** Un solo webhook per tutti i prodotti Meta: `POST /api/webhooks/meta`.
Su developers.facebook.com si registra quell'URL per WhatsApp (oggetto
`whatsapp_business_account`), Messenger (`page`) e Instagram (`instagram`); il verify
token e l'App Secret si impostano nella pagina **Impostazioni** dell'app. Ogni messaggio
in arrivo crea o aggiorna una `Conversazione` (canale + id esterno della persona) e
aggiunge un `Messaggio` con dedup sull'id Meta. Gli aggiornamenti di stato WhatsApp
(inviato/consegnato/letto/errore) aggiornano i messaggi in uscita.

**In uscita.** Dall'inbox si risponde: WhatsApp via Cloud API
(`/{phoneNumberId}/messages`), Messenger e Instagram via `/me/messages` col Page Access
Token. Il widget non ha invio esterno: il visitatore riceve col polling.

**Widget.** Snippet da incollare nel sito (mostrato in Impostazioni):
`<script src="https://TUA-APP/widget.js" defer></script>`. Lo script crea il bottone
flottante e apre un iframe su `/widget`; la sessione del visitatore è un token casuale
salvato nel suo browser, la conversazione appare in inbox come canale "Sito".

**Email (register.it), più caselle.** Le caselle si gestiscono in `/caselle` (tabella
`CasellaEmail`): se ne collegano quante servono, con una **predefinita** per le mail
nuove. *Scarica posta* in inbox legge la posta in arrivo di **tutte** le caselle attive
via IMAP e crea una conversazione per mittente; rispondendo dal thread la mail parte
dalla casella che ha ricevuto (`Conversazione.casellaId`), con oggetto `Re: …`.
Parametri ufficiali register.it — IMAP **`pop.securemail.pro:993`**, SMTP
**`authsmtp.securemail.pro:465`**, utente = indirizzo completo — host *generici*, non del
dominio del cliente ([fonte](https://www.register.it/assistenza/parametri-email/)). Porte
e host restano modificabili (sulla 587 si passa a STARTTLS). La password è cifrata e c'è
un pulsante che prova SMTP **e** IMAP. Nota: quei server presentano un certificato che può
non combaciare col nome usato, quindi si salta la verifica del *nome* — la connessione
resta cifrata (stessa scelta di `deluxy-mail`).

**Accesso.** Due pagine con link incrociati: `/login` per entrare e `/registrati` per
creare l'account (sessione firmata, come deluxy-mail). Il primo account registrato è
l'amministratore; i successivi nascono con ruolo operatore.

**Ordini (dal registro Deluxy Orders).** Gli ordini **non** si prendono più da Shopify: la
fonte è l'app **Deluxy Orders**, il registro centralizzato che sincronizza Shopify per
tutte le app (`src/lib/orders.ts` → `scaricaOrdiniDaOrders`, `GET /api/v1/ordini` con
`x-api-key`). Così la classificazione Deluxy è la stessa ovunque e non si duplica la
sincronizzazione. *Aggiorna da Ordini* nella pagina iniziale è **incrementale**: riparte dal
giorno dell'ordine più recente già presente (il primo giro è l'unico lungo), e deduplica sul
**gid Shopify** (`orderId`), così gli ordini presi in passato da Shopify si aggiornano invece
di duplicarsi. Ogni brand di Orders diventa un negozio in `/negozi` — creato da solo se
manca — che serve alle colonne della bacheca, alla sigla in rubrica e al bottone Fornitore;
lì **non servono più credenziali Shopify**. La lista ha **ricerca lato
server** (su tutti gli ordini, non solo quelli in pagina): testo su numero, cliente,
telefono — normalizzando le cifre, così "+39 333 12" trova "+393331234567" — email,
indirizzo e negozio, più i filtri per negozio e per contatto salvato/da salvare.

**Aggiornamento automatico ogni 15 minuti.** Gli ordini arrivano da soli: un cron Vercel
(`vercel.json` → `/api/cron/ordini`) rifà lo scarico incrementale ogni quarto d'ora, così
un ordine ricevuto alle 9:03 è qui entro le 9:15 senza che nessuno prema niente. In testa
alla pagina Ordini c'è scritto da quanto è passato l'ultimo giro — se il cron si fermasse,
si vedrebbe. *Aggiorna da Ordini* resta per quando non si vuole aspettare. La rotta è
protetta dal `CRON_SECRET` (header `Authorization: Bearer …`, che Vercel manda da solo):
senza segreto configurato risponde 503 invece di restare un endpoint aperto.
Il **salvataggio dei contatti in rubrica ha un cron suo**, ogni ora
(`/api/cron/contatti`): misurato, è la parte lenta — 40 chiamate alla People API, oltre 3
minuti, contro i ~20 secondi degli ordini — e attaccato al giro dei 15 minuti lo avrebbe
fatto scadere, facendo perdere proprio gli ordini che deve salvare.

**Partner (dal registro Anagrafiche).** `/partner` mostra i partner **attivi** letti da
**Deluxy Anagrafiche**, la fonte di verità delle anagrafiche B2B
(`GET /api/v1/partners?stato=attivo`, chiave di sola lettura in Impostazioni). Non ne
teniamo copia — è la regola del registro: si rilegge a ogni apertura, così un partner
dismesso sparisce subito anche di qui, e per modificarli si va in Anagrafiche. Si cerca su
tutti i campi (referenti compresi, la ricerca la fa il registro) e si filtra per categoria
e città; per ogni partner c'è lo stato dei **pagamenti** — lo scrive l'amministrazione, e
cambia il tono con cui gli scrivi — e il bottone **Scrivi**, che apre WhatsApp o la mail.
Quel bottone guarda prima l'insegna e **poi i referenti**: nel registro di oggi nessuno dei
41 partner attivi ha un telefono proprio, ma 28 hanno un referente col numero — senza il
ripiego il bottone sarebbe spento per 37 partner su 41.

**Vista a colonne e collegamenti alle altre app.** `/ordini` ha due viste: **Colonne**
(una per negozio, con conteggio e valore del filtro, card con numero/importo/cliente/città)
ed **Elenco** (tabella). Sotto ogni ordine c'è il bottone **Fornitore**, che apre l'app
Ricerca fornitori già impostata (`search-deluxy/?brand=…&ordine=…`); il brand di ogni
negozio si deduce (Flowers→deluxyflowers.com, Cake→cakedesign.me, Deluxy→deluxy.it) ed è
modificabile in `/negozi`. Cercando, oltre agli ordini locali compare **Archivio storico**:
gli ordini più vecchi dei 60 giorni scaricati da Shopify, letti dall'app **Deluxy Orders**
via `GET /api/v1/ordini` con chiave di sola lettura (`src/lib/orders.ts`, configurata in
Impostazioni) — non se ne duplica l'archivio.

**Calendario ordini.** `/calendario` mostra gli ordini nel giorno in cui vanno
**consegnati** (non ordinati), con ogni ordine colorato dallo **stato** della pipeline di
Orders (colori letti da `GET /api/v1/stati`). Si apre sull'**agenda a partire da oggi** —
i prossimi 60 giorni, con il giorno corrente in evidenza — perché quello che serve è cosa
va consegnato adesso; la **griglia del mese** è a un clic. Si filtra per stato cliccando la
legenda e per negozio; in testa il numero e il valore delle consegne. Gli ordini senza data
di consegna indicata non compaiono e vengono contati esplicitamente.

**Lavorazione degli ordini.** Ogni ordine ha uno stato **nostro** (`Ordine.gestione`,
distinto dalla pipeline di Orders): **Da gestire** → **In pagamento** → **Comunicazione con
cliente** → **Gestito**. Sotto ogni ordine ci sono i pulsanti che lo fanno avanzare:
*Richiedi pagamento* (apre Pagamenti già compilato e segna "in pagamento"), *Contatta
cliente* (apre WhatsApp se c'è il numero, altrimenti la mail, e segna "comunicazione"),
*Gestito ✓* (e *Riapri* per tornare indietro). Il filtro parte da **"Da gestire"**, così si
vede solo il lavoro aperto; si può passare a "Tutti" o a un singolo stato. Lo scarico da
Orders non tocca mai questo campo.

**Menu a scomparsa.** Il pulsante ☰ in alto chiude il menu laterale: gli ordini prendono
tutta la larghezza. La scelta resta in `localStorage` e viene riapplicata prima del primo
disegno, così non lampeggia.

**Richiedi pagamento.** `/pagamenti` raccoglie le coordinate su cui farsi pagare. IBAN e
intestatario si scrivono a mano oppure si fanno **leggere all'AI** (`src/lib/ai.ts`)
da un messaggio incollato o da un'immagine — schermata di chat, foto di un bonifico — che
restituisce IBAN, intestatario, importo e causale e compone la stringa pulita da inviare
(`IBAN … — intestato a … — importo … — causale «…»`). L'AI propone, ma la verità formale la
dà il **checksum mod-97** (`src/lib/iban.ts`, ISO 13616): una cifra letta male non passa e la
riga resta marcata "da controllare" invece di essere spacciata per buona. L'AI è **OpenAI**
(chiave in Impostazioni, cifrata; Anthropic resta come ripiego): `gpt-4o-mini` per il testo
e `gpt-4o` per le **immagini**, perché mini ha sbagliato un IBAN letto da una foto — due
zeri persi, beccati dal checksum — mentre 4o l'ha letto giusto.

**Inoltro a Deluxy Partner.** Salvando, la richiesta viene mandata a Partner, che approva e
paga: `POST {partnerUrl}/api/richieste-pagamento` con header `X-API-Key` e
`X-App: deluxy-messaging` (`src/lib/partner.ts`). L'invio è **idempotente** sul campo
`riferimento`: rimandarla non crea doppioni, la aggiorna finché è in attesa. Partner
pretende un importo maggiore di zero. Se l'invio fallisce la richiesta resta salvata qui, con
il motivo, e si rimanda col pulsante *Invia*; *Aggiorna* chiede a Partner a che punto è.

**Script — le risposte rapide che l'AI impara.** `/script` raccoglie le risposte che diamo
più spesso: titolo, categoria, testo e soprattutto **quando usarlo** (quella riga la legge
l'AI per scegliere). Non sono solo copia-incolla: sono la **memoria** da cui l'AI impara a
rispondere come rispondiamo noi. Nell'inbox, il pulsante **Risposta rapida** prende
l'ultimo messaggio del cliente, lascia scegliere all'AI lo script più adatto e lo fa
adattare al caso (nome, ordine, tono) — il testo finisce **nel riquadro di scrittura, non
parte da solo**: si legge, si corregge, poi si invia. Un avviso dice sempre da quale script
arriva. All'AI vengono mandati **soltanto i nostri script**, e l'id che restituisce viene
verificato contro quell'elenco: se nessuno c'entra lo dice — «rispondi a mano» — invece di
inventare una risposta. Ogni script conta gli **usi**, e i più usati vengono proposti per
primi. Nella pagina c'è anche un **banco di prova**: si incolla un messaggio e si vede cosa
risponderebbe, senza scrivere a nessuno.

**Menu.** Il menu sta **a sinistra** (`src/components/Sidebar.tsx`, stesso impianto di
Deluxy Orders: `.layout` + `.sidebar` sticky + `.main`); la barra in alto tiene solo marchio
e utente. Sotto gli 800px il menu diventa una riga orizzontale scorrevole.

**Clienti (rubrica).** `/clienti` è la rubrica ricavata dagli ordini: una scheda per
persona (dedup sul telefono, altrimenti email) con negozi, numero di ordini, totale speso,
ultimo ordine e stato in rubrica Google. Da lì si portano tutti in Google Contacts.

**Contatti automatici.** A ogni scarico i clienti finiscono in Google Contacts senza
intervento manuale (`src/lib/contatti.ts` → `salvaContattiOrdini`), col nome
`SIGLA Nome Cognome #ordine` — es. `FL Mario Rossi #1042`. La sigla è quella del negozio:
**FL** Flowers, **CK** Cake, **DL** Deluxy, dedotta da nome/dominio e personalizzabile in
`/negozi`. Un contatto per persona (dedup sulle ultime 9 cifre del telefono): se il cliente
riordina, il contatto viene **aggiornato** col numero dell'ordine più recente. Un contatto
già in rubrica ma **non** creato da questa app non viene mai rinominato (riconosciuto dal
marcatore "Deluxy Messaggi" in biografia). Restano i pulsanti manuali per il singolo ordine
e per il blocco.

**Google Contacts.** OAuth server-side (`src/lib/google.ts`): in Impostazioni si mettono
Client ID e Secret del progetto Google Cloud (People API attiva) e si autorizza il
redirect URI mostrato; il pulsante "Collega Google" porta al consenso e il refresh token
torna cifrato nel DB. Server-side (non il token-client del browser) perché su Vercel i
contatti vanno salvati anche senza un operatore davanti.

## Variabili d'ambiente

Vedi [.env.example](.env.example): `DATABASE_URL`/`DIRECT_URL` (Postgres), `APP_SECRET`
(firma sessioni + cifra i token Meta salvati), `APP_URL` (URL pubblico per webhook e
snippet) e `CRON_SECRET` (protegge i cron: **senza, l'aggiornamento automatico degli
ordini non parte** — la rotta risponde 503). I token dei canali NON stanno nell'ambiente:
si incollano in Impostazioni e finiscono cifrati (AES-256-GCM) nel database.

## Avvio

```bash
npm install
npm run db:push   # crea le tabelle (serve DIRECT_URL)
npm run dev       # http://localhost:3140
```
