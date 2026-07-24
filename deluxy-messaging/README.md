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

**Accesso.** Due pagine con link incrociati: `/login` per entrare e `/registrati` per
creare l'account (sessione firmata, come deluxy-mail). Il primo account registrato è
l'amministratore; i successivi nascono con ruolo operatore.

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
