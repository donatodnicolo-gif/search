# Handoff — Deluxy Transactions

Aggiornato: **26 luglio 2026**

## Dove si lavora

- Cartella: `C:\Users\nicol\scoutwt\deluxy-transactions`
- Porta: **3160** — `npm run dev`
- Produzione: **https://deluxy-transactions.vercel.app** (progetto Vercel
  `deluxy-transactions`, deploy con `npx vercel deploy --prod --yes`)
- Database: Postgres condiviso, schema **`transactions`**
- Documenti: [README.md](../README.md) · [SICUREZZA.md](SICUREZZA.md) · [API.md](API.md)

## Cos'è

Il registro centralizzato delle richieste di pagamento. Le altre app Deluxy
chiedono qui via API firmata; qui una persona autorizza; da qui esce la distinta
SEPA. **L'app non muove denaro e non ha credenziali bancarie** — è una scelta di
progetto, vedi SICUREZZA.md §0.

## FATTO

- **Schema Prisma** completo: operatori, sessioni, chiavi API, nonce,
  idempotenza, contatori, beneficiari, richieste, approvazioni, lotti, eventi,
  impostazioni. Importi in **centesimi interi**.
- **API v1** con chiave + firma HMAC + marca temporale + nonce + idempotenza +
  tetti + rate limit + lista IP: `POST /richieste`, `GET /richieste`,
  `GET /richieste/[id]`, `POST /richieste/[id]/annulla`, `GET /health`.
- **Motore di rischio** (10 segnali, fra cui il cambio IBAN per un beneficiario
  già noto e i doppioni a 24 ore).
- **Operatori** con password PBKDF2 e **TOTP** (RFC 6238 scritto in casa, zero
  dipendenze), ruoli, tetto personale, blocco dopo 5 tentativi.
- **Firma delle decisioni** con secondo fattore a ogni approvazione, **doppia
  firma** sopra soglia o sopra rischio, «chi crea non approva», **sigillo**
  contro le modifiche fatte direttamente sul database.
- **Distinte SEPA** `pain.001.001.03` con impronta SHA-256 del file generato.
- **Registro a catena di hash** con pagina di verifica dell'integrità.
- **Rubrica beneficiari** con verifica manuale e rilevamento del cambio IBAN.
- **UI completa**: coda, richieste + dettaglio, nuova richiesta manuale,
  distinte, beneficiari, registro, chiavi, operatori, impostazioni, accesso.
- **Sicurezza browser**: CSP con nonce in produzione, no CORS sulle API,
  SameSite=strict, noindex.
- **Cron** notturno di pulizia dei soli dati tecnici scaduti.
- Verificato in locale: 13 prove sulle API (firma, replay, marca temporale,
  idempotenza, tetti, IBAN), accesso + firma con TOTP, creazione distinta,
  generazione XML, catena del registro integra.

## Stato in produzione (26/07/2026)

Pubblicata e viva: `GET /api/v1/health` risponde
`{"ok":true,"database":true,"cifratura":true}`. Su Vercel sono impostate
`DATABASE_URL`, `DIRECT_URL`, `TRANSACTIONS_ENC_KEY`, `APP_SECRET`,
`CRON_SECRET` (production + preview). Il Hub ha `APP_URL_TRANSACTIONS` ed è
stato ripubblicato: l'icona «Transactions» compare agli admin.

**Il database è vuoto di proposito: nessun operatore, nessuna chiave API.**
I dati usati per le prove sono stati cancellati (comprese le credenziali di
prova, che erano passate per la trascrizione di una sessione). Primo avvio:

```bash
cd deluxy-transactions
npm run operatore -- --email tu@deluxy.it --nome "Nome Cognome" --password "<12+ caratteri>" --ruolo admin
```

Il comando stampa **una volta sola** il segreto TOTP da mettere in Google
Authenticator/1Password. Poi si entra su
https://deluxy-transactions.vercel.app/login, si compilano nome e IBAN
dell'ordinante in Impostazioni (senza, le distinte SEPA non si generano) e si
creano le chiavi delle app da `/chiavi`.

⚠️ Lo stesso `.env` locale punta allo **stesso schema Postgres** della
produzione: quello che si crea in locale si vede online e viceversa.

## MANCA

Nell'ordine consigliato:

1. **Passkey/WebAuthn** al posto del TOTP per la firma — toglie il phishing del
   codice a 6 cifre, che è l'anello debole rimasto.
2. **Cambio password dalla UI**: oggi la password iniziale la mette un admin con
   `npm run operatore` o dalla pagina Operatori, e non si cambia da soli.
3. **Integrazione delle app che chiedono**: oggi nessuna app chiama ancora
   queste API. Il primo candidato è `deluxy-messaging`, che ha già
   `RichiediPagamento` e oggi scrive su `deluxy-partner`
   (`POST /api/richieste-pagamento`). Vedi «Rapporto con Finance» qui sotto.
4. **Riconciliazione bancaria**: leggere l'estratto conto e chiudere il cerchio
   fra distinta inviata e denaro uscito.
5. **Voce nel Hub**: aggiunta al catalogo (`deluxy-hub/src/lib/apps.ts`, id
   `transactions`); serve impostare `APP_URL_TRANSACTIONS` su Vercel perché
   compaia in produzione.

## Rapporto con deluxy-partner (Finance)

Attenzione a non creare due verità. Oggi:

- **Finance** ha già `richiestePagamentoIn` (`POST /api/richieste-pagamento`,
  usata da Messaggi), le distinte SEPA e i saldi partner. Finance è
  l'app **contabile**: sa *perché* si deve del denaro.
- **Transactions** è l'app **autorizzativa**: sa *chi ha detto sì* a un
  pagamento, con quale secondo fattore, e cosa è stato mandato in banca.

La divisione sensata, da confermare con l'utente prima di implementarla:
Finance continua a produrre gli importi dovuti e li **inoltra a Transactions**
come richieste; Transactions autorizza e genera la distinta; Transactions
notifica Finance con il webhook firmato quando lo stato cambia. In quel momento
va **spento** il percorso `Messaggi → Finance` per non avere due code di
approvazione. Finché questo non si decide, le due code coesistono e la cosa va
detta a chi le usa.

## Trappole già pagate

- **`Referrer-Policy: no-referrer` rompe le server action.** Chrome manda
  `Origin: null` e Next risponde 500 «Invalid URL». Serve `same-origin`.
- **CSP senza `unsafe-eval` in sviluppo blocca l'idratazione.** Le pagine si
  vedono e i form funzionano (degradano a POST nativi), ma nessun componente
  client reagisce. In produzione non serve: si usa il nonce.
- **La firma HMAC comprende la query.** Il client deve firmare
  `/api/v1/richieste?limite=5`, non solo il percorso.
- **`TRANSACTIONS_ENC_KEY` non si cambia** dopo il primo avvio.
- Gli script `scripts/*.mjs` ripetono la cifratura invece di importarla da
  `src/lib/crypto.ts`: se cambia l'algoritmo là, vanno allineati anche loro.

## Da fare al prossimo commit che cambia comportamento

Aggiornare questo file, `README.md` e `docs/SICUREZZA.md` nello stesso commit
(regola 0 e 1 di `deluxy-platform-next/docs/REGOLE-DI-LAVORO.md`).
