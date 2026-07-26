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
SEPA. **È l'unica app da cui può uscire denaro**, e ne esce solo dallo sblocco
del pagatore (codice via email + PIN) — vedi SICUREZZA.md §0. Credenziali
bancarie non ce ne sono ancora: il file SEPA lo carica una persona in banca.

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
- **Sblocco del pagamento** (26/07/2026): il file SEPA si genera solo se il
  *pagatore* (impostazione `pagatoreEmail`, oggi `nicolo.donato@deluxy.it`)
  chiede un **codice**, lo riceve **per email** e lo digita con il suo **PIN**.
  Codice di 8 caratteri valido 10 minuti, 5 tentativi, legato all'impronta della
  distinta (cambia la distinta → il codice muore), finestra di sblocco 15
  minuti. Il punto unico che decide è `verificaCancello()` in
  [src/lib/sblocco.ts](../src/lib/sblocco.ts): ogni futura esecuzione bancaria
  deve passare da lì. PIN in PBKDF2, lo imposta la persona da `/pin` con
  password + TOTP (nemmeno un admin lo può mettere per conto di un altro).
- **Chiavi della banca dall'app**: si incollano in Impostazioni → Collegamento
  alla banca, si salvano cifrate sul database e vengono **provate prima** di
  essere salvate. Le variabili d'ambiente restano come alternativa.
- **Link «vai a pagare»**: due indirizzi configurabili (portale della banca e
  pagina di caricamento del file SEPA) che diventano bottoni nella pagina Banca
  e in testa a ogni distinta. Si accettano solo http/https.
- **Banca Qonto** (26/07/2026): lettura del conto (saldo e uscite, pagina
  `/banca`, con riconoscimento delle richieste dal riferimento in causale) e
  **pagamento vero** — un bonifico per richiesta, `POST /v2/sepa/transfers`.
  Sei controlli in fila prima di ogni euro (sblocco, interruttore spento di
  nascita, sigillo, beneficiario *fidato* in Qonto, controllo dell'intestatario
  VoP, saldo), idempotenza derivata dall'id della richiesta, stop al primo
  errore. Codice: [src/lib/qonto.ts](../src/lib/qonto.ts) e
  [src/lib/pagamento-banca.ts](../src/lib/pagamento-banca.ts).
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

Primo operatore creato il 26/07/2026: `deluxy.delivery@gmail.com`, ruolo admin
(credenziali consegnate al titolare fuori dalla trascrizione — quelle di prova
della sessione precedente erano finite in chat e per questo erano state
cancellate).

**Chiavi API create il 26/07/2026** (i valori sono stati consegnati su file, non
in chat; vanno messi nelle variabili d'ambiente dell'app corrispondente come
`TRANSACTIONS_API_KEY` e `TRANSACTIONS_HMAC_SECRET`):

| App | Prefisso | Tetto per richiesta | Tetto al giorno |
|---|---|---|---|
| `deluxy-partner` | `trx_p8610J6y` | 5.000 € | 20.000 € |
| `deluxy-messaging` | `trx_CLl3bYu_` | 500 € | 2.000 € |
| `deluxy-acquisti` | `trx_CJn3ErNv` | 2.000 € | 10.000 € |

I tetti non si modificano dalla UI: per cambiarli si crea una chiave nuova e si
revoca la vecchia. **Nessuna di queste chiavi può approvare**: possono solo
chiedere. Nessuna delle tre app chiama ancora queste API.

Sequenza del primo avvio, se un giorno si riparte da zero:

```bash
cd deluxy-transactions
npm run operatore -- --email tu@deluxy.it --nome "Nome Cognome" --password "<12+ caratteri>" --ruolo admin
```

Il comando stampa **una volta sola** il segreto TOTP da mettere in Google
Authenticator/1Password. Poi si entra su
https://deluxy-transactions.vercel.app/login e si completa:

1. **Impostazioni** → nome e IBAN dell'ordinante (senza, niente distinte) e
   **pagatore** (`pagatoreEmail`, deve essere un operatore attivo);
2. **`/pin`** → il pagatore imposta il proprio PIN, da solo;
3. **`/chiavi`** → una chiave per ogni app che chiederà pagamenti.

⚠️ **Senza SMTP non esce un euro.** Il codice di pagamento viaggia per email:
finché su Vercel non ci sono `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
`SMTP_FROM`, la generazione del file SEPA resta bloccata. È voluto: si fallisce
chiusi. La pagina Impostazioni lo dice in cima quando manca.

⚠️ Lo stesso `.env` locale punta allo **stesso schema Postgres** della
produzione: quello che si crea in locale si vede online e viceversa.

## MANCA

Nell'ordine consigliato:

0. **SMTP su Vercel** (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`,
   `SMTP_FROM`) e **PIN del pagatore** da `/pin`: finché mancano, lo sblocco non
   funziona e quindi non esce nessun pagamento. È il primo passo, non un
   dettaglio di configurazione.
0-bis. **Qonto**: incollare le chiavi in Impostazioni → Collegamento alla banca
   (in alternativa `QONTO_LOGIN` / `QONTO_SECRET_KEY` su Vercel; si generano in
   Qonto → Integrazioni e partnership → Chiave API), poi rendere
   **fidati** dentro l'app Qonto i beneficiari che si vogliono pagare, poi
   accendere l'interruttore in Impostazioni. **Il primo giro va fatto con una
   cifra piccola verso un beneficiario proprio**: il percorso completo (VoP →
   bonifico) non è mai stato eseguito contro l'API vera, perché non ci sono
   credenziali in sviluppo.
1. **Passkey/WebAuthn** al posto del TOTP per la firma — toglie il phishing del
   codice a 6 cifre, che è l'anello debole rimasto.
2. **Cambio password dalla UI**: oggi la password iniziale la mette un admin con
   `npm run operatore` o dalla pagina Operatori, e non si cambia da soli.
3. **Integrazione delle app che chiedono**: oggi nessuna app chiama ancora
   queste API. Il primo candidato è `deluxy-messaging`, che ha già
   `RichiediPagamento` e oggi scrive su `deluxy-partner`
   (`POST /api/richieste-pagamento`). Vedi «Rapporto con Finance» qui sotto.
4. **Riconciliazione automatica**: oggi `/banca` mostra le uscite e riconosce la
   richiesta dal riferimento in causale, ma **non cambia nessuno stato**. Il
   passo successivo è segnare `pagata` la richiesta quando il movimento è
   uscito davvero, e far notare le uscite che non corrispondono a niente.
5. **Stato dei bonifici nel tempo**: `POST /sepa/transfers` risponde con uno
   stato iniziale; un bonifico può essere respinto dopo. Serve rileggere
   `GET /v2/sepa/transfers` (o i movimenti) e aggiornare `qontoStato`.
6. **Voce nel Hub**: aggiunta al catalogo (`deluxy-hub/src/lib/apps.ts`, id
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
- **La configurazione SMTP sta solo nelle variabili d'ambiente**, non sul
  database come in `deluxy-partner`. Chi entrasse nel database potrebbe
  altrimenti cambiare il server di posta e dirottare i codici di pagamento su
  una casella sua. Non «uniformare» questa differenza senza pensarci.
- **Qonto: l'header non è Basic.** Vuole `Authorization: <login>:<segreto>` in
  chiaro, senza base64. Con base64 risponde 401 e il messaggio non lo dice.
- **Qonto: senza beneficiario «fidato» il bonifico chiede la SCA** (conferma sul
  telefono via OAuth) e con la sola chiave API risponde 403. Il beneficiario si
  rende fidato **solo dentro l'app Qonto**, a mano. Non è un bug da aggirare: è
  il lucchetto che non sta su questo server.
- **Qonto: gli endpoint `external_transfers` sono dismessi dal 31/03/2026.** Si
  usa `POST /v2/sepa/transfers`, che pretende il `vop_proof_token` del controllo
  dell'intestatario (vale 23 ore).
- **Il codice di pagamento non si invalida da solo se la distinta cambia**: lo
  fa il confronto con `improntaDistinta()`. Se un domani si aggiungono campi che
  contano (data di esecuzione, valuta diversa), vanno messi dentro quell'impronta,
  altrimenti si può far firmare una cosa e pagarne un'altra.
- Gli script `scripts/*.mjs` ripetono la cifratura invece di importarla da
  `src/lib/crypto.ts`: se cambia l'algoritmo là, vanno allineati anche loro.

## Da fare al prossimo commit che cambia comportamento

Aggiornare questo file, `README.md` e `docs/SICUREZZA.md` nello stesso commit
(regola 0 e 1 di `deluxy-platform-next/docs/REGOLE-DI-LAVORO.md`).
