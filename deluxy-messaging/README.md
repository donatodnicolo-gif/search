# Deluxy Messaggi

Inbox unificata dell'ecosistema Deluxy: le conversazioni **WhatsApp**, **Messenger** e
**Instagram** (API ufficiali Meta) più la **chat del sito** (widget incorporabile)
arrivano in un'unica schermata, da cui l'operatore risponde sul canale giusto.

- Porta di sviluppo: **3140** (`npm run dev`)
- Stack: Next.js 15 (App Router) + Prisma + Postgres, stesso impianto di `deluxy-mail/`
- Design: Deluxy Design System (token in `src/app/tokens.css`)

## Come funziona

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
**consegnati** (non ordinati), un mese per volta, con ogni ordine colorato dallo **stato**
della pipeline di Orders (colori letti da `GET /api/v1/stati`). Si filtra per stato
cliccando la legenda e per negozio; in testa il numero e il valore delle consegne del mese.
Gli ordini senza data di consegna indicata non compaiono e vengono contati esplicitamente.

**Richiedi pagamento.** `/pagamenti` raccoglie le coordinate su cui farsi pagare. IBAN e
intestatario si scrivono a mano oppure si fanno **leggere all'AI** (Claude, `src/lib/ai.ts`)
da un messaggio incollato o da un'immagine — schermata di chat, foto di un bonifico — che
restituisce IBAN, intestatario, importo e causale e compone la stringa pulita da inviare
(`IBAN … — intestato a … — importo … — causale «…»`). L'AI propone, ma la verità formale la
dà il **checksum mod-97** (`src/lib/iban.ts`, ISO 13616): una cifra letta male non passa e la
riga resta marcata "da controllare" invece di essere spacciata per buona. La chiave Anthropic
si mette in Impostazioni (cifrata).

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
snippet). I token dei canali NON stanno nell'ambiente: si incollano in Impostazioni e
finiscono cifrati (AES-256-GCM) nel database.

## Avvio

```bash
npm install
npm run db:push   # crea le tabelle (serve DIRECT_URL)
npm run dev       # http://localhost:3140
```
