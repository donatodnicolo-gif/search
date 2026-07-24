# Handoff — Deluxy Messaggi

Ultimo aggiornamento: 24/07/2026

## FATTO

- Scaffold completo dell'app (Next 15 + Prisma, porta 3140, design system Deluxy).
- Schema dati: `Utente`, `Impostazione` (token cifrati AES-256-GCM), `Conversazione`
  (unica per canale+idEsterno), `Messaggio` (dedup su id Meta, stati di consegna).
- Webhook Meta unico (`/api/webhooks/meta`): verifica GET col verify token, firma
  X-Hub-Signature-256 con l'App Secret, ricezione WhatsApp/Messenger/Instagram,
  aggiornamenti di stato WhatsApp.
- Invio: WhatsApp Cloud API, Messenger e Instagram via `/me/messages` (src/lib/meta.ts).
- Inbox a due colonne con polling (elenco 5s, thread 4s), badge canale, non letti,
  stati di consegna e errori d'invio visibili in bolla.
- Widget: `public/widget.js` (bottone flottante + iframe) → pagina `/widget` (pubblica,
  frame-ancestors *), API pubbliche `/api/widget/sessione` e `/api/widget/messaggi`
  autenticate dal token di sessione del visitatore.
- Impostazioni: token canali (cifrati, "vuoto = non toccare"), verify token, App Secret,
  titolo/benvenuto widget, URL webhook e snippet pronti da copiare.
- Login con bootstrap del primo admin; middleware a sessione firmata.
- Tessera "Messaggi" nel catalogo del Hub (`deluxy-hub/src/lib/apps.ts`, icona nuova).

## MANCA

- Database di produzione: creare lo schema/istanza Postgres e fare `npm run db:push`.
- Deploy (Vercel) + `APP_URL_MESSAGGI` nel Hub.
- App Meta reale: registrare il webhook, generare token permanenti, collegare la pagina
  FB e l'account IG professionale. Nota: fuori dalla finestra di 24h Meta rifiuta i
  messaggi liberi (serviranno i template WhatsApp — non ancora gestiti).
- Media in entrata (oggi mostrati come `[tipo]`) e allegati in uscita.
- Più operatori/assegnazione conversazioni; notifiche push.

## Come riprendere

`cd deluxy-messaging && npm install && npm run dev` (porta 3140). Senza `.env` con
`DATABASE_URL` l'app non parte: vedi `.env.example`. Il manuale dell'app è nel README.
