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

**Ordini (Shopify, multi-store).** I negozi si gestiscono nella pagina `/negozi` (tabella
`NegozioShopify`): se ne collegano più d'uno. Ogni negozio si autentica in due modi
(`src/lib/shopify.ts` → `risolviToken`): un **token statico** `shpat_…` (app legacy) oppure
**Client ID + Client Secret** di un'app Dev Dashboard, che l'app scambia per un token via
*client credentials grant* (`POST /admin/oauth/access_token`, token valido ~24h — ideale su
Vercel). La pagina `/ordini` scarica gli ordini recenti da **tutti i negozi attivi** (Shopify
Admin GraphQL API), li tiene in tabella `Ordine` legati al negozio, e riporta l'esito
per-negozio. Credenziali dei negozi cifrate (AES-256-GCM). La lista ha **ricerca lato
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
