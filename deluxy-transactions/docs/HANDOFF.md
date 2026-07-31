# Handoff — Deluxy Transactions

Aggiornato: **31 luglio 2026**

> ⚠️ **Leggi prima questo.** Il codice del cancello è finalmente **in
> produzione** (31/07/2026): database migrato e app ripubblicata, `/pin` e
> `/banca` rispondono. Ma **da qui non esce ancora un euro, ed è giusto così**:
> mancano SMTP, il PIN del pagatore e — cosa che prima non era scritta — la
> tabella `Impostazione` è **vuota**, quindi non ci sono nome e IBAN
> dell'ordinante e nemmeno una distinta si può generare. La sequenza è in
> «Punti aperti» in fondo — e l'ordine conta.

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
- **Server di posta configurabile dall'app** (31/07/2026): Impostazioni →
  «Server di posta», con prova della connessione prima del salvataggio, email di
  prova facoltativa, valori cifrati sul database e secondo fattore obbligatorio
  per cambiarli. Le variabili d'ambiente restano e hanno la precedenza. Include
  l'**elenco chiuso dei destinatari** (oggi `nicolo.donato@deluxy.it`): fuori da
  lì l'app non manda niente, controllo dentro `inviaEmail()`. Il perché di ogni
  pezzo è in [SICUREZZA.md](SICUREZZA.md) §0-bis.
- **Sessione che scade per inattività** (31/07/2026): dieci minuti fermi e si
  rientra. Ogni pagina aperta rimette il contatore a zero (colonna
  `Sessione.ultimoUso`, scritta al massimo una volta ogni 30 secondi per non
  fare due UPDATE a navigazione); le 8 ore restano come tetto assoluto. La
  pagina di accesso dice **perché** si è usciti, invece di sembrare un guasto.
  I numeri stanno in [src/lib/sessione.ts](../src/lib/sessione.ts)
  (`INATTIVITA_MINUTI`, `TOCCO_SECONDI`).
- **Impostazioni che si spiegano da sole** (31/07/2026): la pagina è divisa in
  blocchi con un titolo in italiano corrente e una riga di aiuto sotto ogni
  campo («da questa cifra in su servono due firme», non «soglia doppia firma»),
  e in cima avvisa quando manca qualcosa che impedisce di pagare: posta non
  configurata, ordinante senza ragione sociale o IBAN, pagatore che non è un
  operatore attivo, pagatore senza PIN.
- **Rubrica beneficiari** con verifica manuale e rilevamento del cambio IBAN.
- **UI completa**: coda, richieste + dettaglio, nuova richiesta manuale,
  distinte, beneficiari, registro, chiavi, operatori, impostazioni, accesso.
- **Sicurezza browser**: CSP con nonce in produzione, no CORS sulle API,
  SameSite=strict, noindex.
- **Cron** notturno di pulizia dei soli dati tecnici scaduti.
- Verificato in locale: 13 prove sulle API (firma, replay, marca temporale,
  idempotenza, tetti, IBAN), accesso + firma con TOTP, creazione distinta,
  generazione XML, catena del registro integra.

## Stato in produzione (31/07/2026)

Pubblicata e viva: `GET /api/v1/health` risponde
`{"ok":true,"database":true,"cifratura":true}`. Su Vercel sono impostate
`DATABASE_URL`, `DIRECT_URL`, `TRANSACTIONS_ENC_KEY`, `APP_SECRET`,
`CRON_SECRET` (production + preview) — **e nient'altro: niente SMTP, niente
Qonto**. Il Hub ha `APP_URL_TRANSACTIONS` ed è stato ripubblicato: l'icona
«Transactions» compare agli admin.

**31/07/2026 — allineamento fatto.** `npx prisma db push --accept-data-loss` ha
aggiunto le quattro colonne Qonto su `Richiesta` (`pagatoCon`,
`qontoTransferId`, `qontoStato`, `qontoMovimentoId`): il diff era davvero solo
additivo, l'unico avviso riguardava il vincolo di unicità su una colonna che non
esisteva ancora, quindi senza righe da duplicare. Poi
`npx vercel deploy --prod --yes`: i tre commit del cancello (`bddbe50`,
`c1299a7`, `fee50bc`) sono in produzione, `/pin` e `/banca` rispondono
(307 → `/login`).

Verificato sul database il 31/07/2026 (le 13 tabelle e tutte le colonne
combaciano con `schema.prisma`):

- unico operatore `deluxy.delivery@gmail.com`, admin, attivo, **`pinHash` NULL**
  (credenziali consegnate al titolare fuori dalla trascrizione — quelle di prova
  della sessione precedente erano finite in chat e per questo erano state
  cancellate);
- tabella **`Impostazione` vuota, zero righe**. Valgono quindi i valori di
  partenza scritti in [src/lib/impostazioni.ts](../src/lib/impostazioni.ts):
  `ordinanteNome` e `ordinanteIban` sono **stringhe vuote** — senza quelli non
  si genera nessuna distinta — e `pagatoreEmail` vale
  `nicolo.donato@deluxy.it`, che **non è un operatore**. Non è un'impostazione
  «da correggere»: non è mai stata salvata nessuna impostazione.

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
- **La configurazione SMTP si fa dall'app, ma cifrata e con l'ambiente che
  vince** (dal 31/07/2026; prima stava *solo* nell'ambiente). La regola da non
  rompere è il motivo, non il posto: chi scrive sul database non deve poter
  *dirottare* i codici di sblocco. Ci riesce solo se i valori sono in chiaro —
  con la cifratura AES-256-GCM può romperli, e allora si fallisce chiusi. Se un
  domani si tolgono la cifratura o la precedenza dell'ambiente, il buco torna.
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
- **Un campo precompilato e non valido bloccava tutto il modulo.** Il salvataggio
  delle impostazioni controlla tutti i campi prima di scriverne uno solo (giusto:
  non si vuole metà configurazione). Ma il campo «pagatore» arriva precompilato
  con il valore di partenza scritto nel codice, che non corrispondeva a nessun
  operatore: il controllo scattava a ogni salvataggio e **rifiutava anche le
  modifiche che non c'entravano**, IBAN dell'ordinante compreso. Da fuori si
  vedeva solo «cambio le impostazioni e tornano quelle vecchie». Ora il pagatore
  si valida **solo se il campo è stato cambiato** (31/07/2026). La regola
  generale: un valore di partenza che non passa la propria validazione trasforma
  un modulo tutto-o-niente in un modulo che non salva mai.
- **Da telefono il menu non si apriva affatto** (fino al 31/07/2026). Sotto gli
  800px la sidebar era `display: none` e il pulsante ☰ spostava solo un margine:
  nessuna delle altre pagine era raggiungibile da mobile. Ora è un cassetto che
  entra da sinistra (`[data-menu-aperto]`), si chiude toccando lo sfondo,
  scegliendo una voce o con Esc, e la preferenza del desktop
  (`data-sidebar-chiusa`) è neutralizzata dentro la media query — altrimenti
  chi aveva chiuso la sidebar sul computer non avrebbe potuto aprirla sul
  telefono. Attenzione se si tocca `.sidebar`: le due modalità convivono nello
  stesso selettore.
- **Due account intestati alla stessa persona si distinguono solo dall'email.**
  Successo davvero il 31/07/2026: `deluxy.delivery@gmail.com` ha `nome` «Nicolo
  Donato» e `nicolo.donato@deluxy.it` ha «Nicolo Daniele Donato». L'intestazione
  mostrava solo il nome, quindi sembrava che l'app negasse lo sblocco al
  pagatore — e il PIN era finito sull'account sbagliato senza nessun errore.
  Ora l'intestazione mostra **l'email**, la distinta dice con quale account sei
  entrato, e la pagina PIN avvisa in cima se non sei il pagatore. Regola: dove
  l'identità decide chi può far uscire denaro, si scrive l'email, mai il nome.
- Gli script `scripts/*.mjs` ripetono la cifratura invece di importarla da
  `src/lib/crypto.ts`: se cambia l'algoritmo là, vanno allineati anche loro.

## Punti aperti al 31/07/2026

Nell'ordine in cui vanno chiusi. I punti 1 e 2 della lista precedente (migrare
il database, pubblicare) sono **chiusi il 31/07/2026**: vedi «Stato in
produzione». Restano questi, e i primi tre li può fare solo una persona con le
credenziali — non si automatizzano da qui.

1. **Configurare la posta**, ora dalla pagina Impostazioni → «Server di posta»
   (in alternativa le variabili su Vercel, che hanno la precedenza; lì
   attenzione all'a-capo: `vercel env add … --value`, non lo stdin). Senza, il
   codice di sblocco non parte e **non esce un euro**.
2. **Impostazioni mai salvate**: la tabella `Impostazione` è vuota. Da
   Impostazioni vanno scritti **nome e IBAN dell'ordinante** (senza, la distinta
   non si genera: non è un dettaglio estetico) e il **pagatore**.
3. **Il pagatore non esiste come operatore**: il valore di partenza di
   `pagatoreEmail` è `nicolo.donato@deluxy.it`, ma l'unico operatore è
   `deluxy.delivery@gmail.com` (admin, creato il 26/07). O si crea l'operatore
   con quell'email (`npm run operatore -- --email …`), o si salva un
   `pagatoreEmail` diverso al punto 2. Finché non si fa, nessuno può pagare.
4. **PIN del pagatore** da `/pin`, con password e TOTP (oggi `pinHash` è NULL).
   Nessun altro lo può mettere al posto suo.
5. **Chiavi Qonto** da Impostazioni → Collegamento alla banca; poi rendere
   *fidati* in Qonto i beneficiari; poi accendere l'interruttore. **Il percorso
   VoP → bonifico non è mai stato eseguito contro l'API vera**: il primo giro va
   fatto con una cifra piccola verso un beneficiario proprio.
6. **Link «vai a pagare»**: compilare in Impostazioni l'indirizzo della pagina
   di caricamento del file SEPA (il portale è già precompilato).
7. **Chiavi API delle app**: create il 26/07 per `deluxy-partner`,
   `deluxy-messaging`, `deluxy-acquisti` (valori consegnati su file). Restano da
   mettere nelle variabili d'ambiente delle rispettive app e, soprattutto, **da
   usare**: nessuna delle tre chiama ancora queste API. Primo candidato Finance.
8. **Un secondo pagatore di riserva**: oggi il potere di pagare sta su una sola
   casella email e un solo PIN. Se si perde l'accesso, l'azienda non paga
   nessuno. Proposto all'utente, non ancora deciso.
9. **Password del database**: l'utente dice di averla cambiata, ma il `.env`
   del 26/07 **si connette ancora** — riverificato il 31/07/2026 — quindi ha
   cambiato la password dell'account Supabase, non quella del database. Se la
   ruota davvero, vanno aggiornate `DATABASE_URL` e `DIRECT_URL` di **dieci
   app** (stesso progetto `zegbztfxisqeowngvgvh`), in locale e su Vercel.

## Da fare al prossimo commit che cambia comportamento

Aggiornare questo file, `README.md` e `docs/SICUREZZA.md` nello stesso commit
(regola 0 e 1 di `deluxy-platform-next/docs/REGOLE-DI-LAVORO.md`).
