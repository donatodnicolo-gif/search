# Sicurezza di Deluxy Transactions

Questo documento elenca i controlli che ci sono e **perché**. Un controllo senza
motivo scritto è un controllo che prima o poi qualcuno toglie.

## 0. Il principio di fondo (riscritto il 26/07/2026)

**Questa è l'unica app Deluxy da cui può uscire denaro, e ne esce da una porta
sola.** Prima diceva «l'app non muove denaro»: il titolare ha deciso il
contrario, e questo capitolo dice cosa è stato messo al posto di quel confine.

La porta si chiama **sblocco del pagamento** e la apre una persona sola — il
*pagatore*, impostazione `pagatoreEmail`, oggi `nicolo.donato@deluxy.it` —
superando tre prove su tre canali diversi:

| Prova | Canale | Cosa ferma |
|---|---|---|
| Sessione: password + TOTP | browser + telefono | chi non ha le credenziali |
| **Codice di pagamento** | **email del pagatore** | chi ha browser e telefono ma non la casella |
| **PIN** | solo nella testa del pagatore | chi ha preso anche la casella |

Nessun'altra strada esiste: le chiavi API delle altre app non possono pagare
(non hanno il permesso: non è previsto proprio), gli altri operatori possono
preparare una distinta ma non farla uscire, e un amministratore non può mettere
il PIN al posto del pagatore.

Tre proprietà volute, che vanno mantenute se si tocca questo codice:

1. **Si fallisce chiusi.** Se la posta non è configurata o l'email non parte,
   il codice non esiste e il pagamento non parte. Mai il contrario.
2. **Il codice racconta cosa sta pagando.** L'email contiene distinta, totale e
   beneficiari: un codice che arriva senza averlo chiesto è un allarme, non un
   fastidio. È scritto anche nel testo dell'email.
3. **Il codice è legato a ciò che ha visto.** Vale per l'impronta della distinta
   (riferimenti, IBAN, importi): cambiata la distinta, il codice muore. Non si
   fa autorizzare 100 € per far uscire 10.000 €.

## 0-bis. Il pagamento vero dalla banca (Qonto)

Dal 26/07/2026 l'app **può far partire i bonifici** dal conto Qonto, e non solo
produrre il file SEPA. Le credenziali della banca (chiave API Qonto) vivono
nelle variabili d'ambiente di Vercel, non sul database.

**Dove stanno le chiavi della banca.** Si incollano dalla pagina Impostazioni e
finiscono sul database **cifrate** AES-256-GCM con `TRANSACTIONS_ENC_KEY`
(in mancanza valgono `QONTO_LOGIN` / `QONTO_SECRET_KEY` dall'ambiente). Prima di
salvarle l'app le prova contro `GET /v2/bank_accounts`: chiavi sbagliate non si
salvano, così non si scoprono davanti a una distinta sbloccata. Dopo il
salvataggio non si rileggono: si sostituiscono.

Perché qui il database è ammesso: chi riuscisse a scrivere sul database e
sostituisse le chiavi Qonto **non ruberebbe niente** — pagherebbe dal proprio
conto.

**Il server di posta (31/07/2026).** Fino al 30/07 stava *solo* nelle variabili
d'ambiente, perché sostituire l'SMTP dirotta i codici di sblocco, e quello sì
che è un furto. Ora si configura anche dalla pagina Impostazioni, e il buco
resta chiuso per due motivi che valgono solo insieme:

1. **I valori sul database sono cifrati** AES-256-GCM con
   `TRANSACTIONS_ENC_KEY`, che vive nell'ambiente. Chi scrive sul database non
   sa produrre un testo cifrato valido: può cancellare o corrompere le righe, e
   allora la posta non parte e **nessun pagamento esce**. L'attacco degrada da
   «rubo i codici» a «blocco i pagamenti» — rumoroso e senza guadagno.
2. **L'ambiente vince sempre sul database.** Se `SMTP_HOST` / `SMTP_USER` /
   `SMTP_PASS` esistono su Vercel, sono quelle a valere e il modulo nell'app non
   ha effetto: un'installazione già irrigidita non si ammorbidisce da una pagina
   web.

In più: serve il ruolo admin **e il secondo fattore** (una sessione rubata non
basta), le credenziali si provano contro il server vero prima di essere salvate,
la password non si rilegge e non entra nel registro, e il cambio è un evento
`posta.configurata` nella catena di hash.

**Le caselle a cui si può scrivere sono un elenco chiuso** (31/07/2026). Il
controllo sta dentro `inviaEmail()` in [src/lib/mail.ts](../src/lib/mail.ts),
cioè nell'unico punto da cui esce un'email: una regola sul destinatario che si
aggira cambiando chiamante non è una regola. È un lucchetto **indipendente** da
`pagatoreEmail`: anche riuscendo a spostare il pagatore su una persona propria,
il codice non partirebbe verso un indirizzo fuori elenco. Oggi l'elenco è
`nicolo.donato@deluxy.it`. Se il pagatore non è in elenco la pagina Impostazioni
lo dice in rosso, e il pagamento resta fermo: si fallisce chiusi.

Un bonifico parte solo dopo **sei** controlli in fila, in
[src/lib/pagamento-banca.ts](../src/lib/pagamento-banca.ts):

| # | Controllo | A cosa risponde |
|---|---|---|
| 1 | **Sblocco del pagatore** (`verificaCancello`) | nessuno paga senza codice via email + PIN |
| 2 | **Interruttore** `qontoEsecuzioneAttiva`, spento di nascita | avere le credenziali nell'ambiente non basta: ci vuole un gesto umano, scritto nel registro |
| 3 | **Sigillo** di ogni richiesta | se importo o IBAN sono stati toccati direttamente sul database, non parte niente |
| 4 | **Beneficiario «fidato» in Qonto** | un IBAN si rende fidato solo dentro l'app della banca, a mano: questo server non può inventarsi un beneficiario nuovo |
| 5 | **Controllo dell'intestatario (VoP)** appena prima di ogni bonifico | la fattura con l'IBAN cambiato: se il nome non corrisponde al conto, quel pagamento non parte |
| 6 | **Saldo disponibile** ≥ totale | non si comincia una distinta che si fermerà a metà |

Più tre proprietà del come, non del cosa:

- **Idempotenza deterministica**: la chiave `X-Qonto-Idempotency-Key` è derivata
  dall'id della richiesta Deluxy. Un doppio clic, un retry di rete o un timeout
  non generano due bonifici.
- **Lo sblocco si consuma prima del primo bonifico**: un codice, un'esecuzione.
  Riprovare vuol dire farsi mandare un codice nuovo.
- **Al primo errore ci si ferma.** Metà distinta pagata è brutto ma chiaro;
  andare avanti dopo un errore della banca vuol dire non sapere cosa è uscito.
  Il messaggio dice esattamente cosa è partito e cosa no.

Il punto 4 merita una riga in più: è l'unico controllo che **non sta su questo
server**. Anche chi prendesse il pieno controllo dell'applicazione potrebbe al
massimo pagare, prima del limite di saldo, beneficiari che una persona aveva già
approvato dentro Qonto. Non è un dettaglio di comodo: è ciò che resta della
vecchia difesa «l'app non muove denaro», e per questo la lista dei beneficiari
fidati in Qonto va tenuta corta.

Quando il VoP risponde `CLOSE_MATCH`, `NO_MATCH` o `NOT_POSSIBLE`, il pagamento
**non parte** e finisce fra le «bloccate», con scritto il nome che la banca dice
essere l'intestatario. Si accetta solo `MATCH`. È una scelta severa e voluta:
in un pagamento «quasi giusto» non esiste.

**Quello che resta fuori.** Nessuna credenziale bancaria è scritta sul database,
e l'app non può creare beneficiari né renderli fidati: quello si fa in Qonto.
Se un domani si accetteranno anche i `CLOSE_MATCH`, o si permetterà di creare
beneficiari via API, va scritto qui — con la motivazione.

## 0-ter. «Questa l'ho già pagata altrove» — perché non è una seconda porta

Dal 03/08/2026 un operatore può, dalla pagina di una richiesta, dichiararla
**già pagata fuori da questa app** (bonifico fatto a mano dal portale della
banca, addebito, contanti, compensazione) oppure **annullarla**.

Sembra un buco nel capitolo 0, e non lo è: **da lì non esce un euro**. Non
genera file SEPA, non chiama la banca, non tocca `verificaCancello()`. È una
*registrazione* di denaro già uscito per un'altra strada — per questo non chiede
il PIN del pagatore, che è la chiave dell'uscita, non della contabilità.

L'abuso possibile non è rubare: è **far sparire dalla coda una richiesta che
nessuno ha pagato**, lasciando un fornitore senza soldi e Finance convinta che
il mese sia chiuso. Contro quello:

1. **secondo fattore** a ogni chiusura, come per una firma;
2. **motivo obbligatorio** (dove, quando, numero dell'operazione): fra sei mesi
   è l'unica traccia;
3. evento dedicato nel registro — `richiesta.pagata_fuori`, non
   `richiesta.pagata`: nel libro mastro le due cose non si confondono;
4. `pagatoCon = "fuori_app"` sulla riga, ripetuto **nel webhook** e nella
   pillola di stato («pagata fuori»): chi legge sa che di quel pagamento l'app
   non ha una prova propria, ha la parola di una persona;
5. il **sigillo** vale anche qui: su una riga manomessa non si scrive «pagata».

Due effetti che non sono facoltativi, e vanno mantenuti se si tocca il codice:

- **la richiesta esce dalla distinta** in cui si trovava (`lottoId = null`),
  altrimenti verrebbe pagata una seconda volta dal file SEPA;
- **se quella distinta era sbloccata, lo sblocco decade** (e i codici in corso
  si annullano): togliere una riga cambia la distinta, e uno sblocco vale per la
  distinta *com'era* — la stessa regola del punto 3 del capitolo 0.

Non si chiude a mano una richiesta che sta in una distinta **già esportata o
pagata**: quel file è fuori, e dire «pagata a mano» nasconderebbe che sta per
essere pagata anche da lì. In quel caso si chiude la distinta.

**Dal 05/09/2026 la stessa dichiarazione può farla l'app di origine via API**
(`POST /api/v1/richieste/<id>/pagata-fuori`, `chiudiDichiarataDallOrigine()`).
Il caso: il Customer Service segna «pagata» un fornitore pagato dal portale
della banca, e qui la richiesta restava in coda — con Finance era già
successo su 7 richieste per 4.794 €, pronte a uscire due volte. Non cambia la
natura della porta: da lì continua a non uscire un euro. Cambia chi dichiara,
e al posto del secondo fattore dell'operatore ci sono: la **firma HMAC** della
chiave (punto 1), il vincolo **solo le richieste di quella chiave** (come
l'annullo via API: un'app non chiude le richieste di un'altra), il **motivo
obbligatorio**, e nell'evento `richiesta.pagata_fuori` il campo
**`dichiaratoDa: <app>`** con l'attore = nome dell'app, così nel registro una
chiusura dichiarata da un'app non si confonde con quella di una persona.
L'abuso resta lo stesso del paragrafo sopra (far sparire una richiesta non
pagata) e resta nelle mani di chi già poteva annullarla; la prova, se c'è,
sta nell'app che ha dichiarato (la ricevuta del CS), non qui. Le due
garanzie non facoltative — via dalla distinta, sblocco che decade — valgono
uguali: è la stessa funzione.

## 1. Chi può chiedere un pagamento (le altre app)

| Controllo | Perché |
|---|---|
| Chiave API in `x-api-key`, sul database solo lo **SHA-256** | chi legge il database non trova chiavi utilizzabili |
| **Firma HMAC-SHA256** del corpo con un segreto separato | la chiave rubata da sola non basta |
| **Marca temporale** ±5 minuti (configurabile) | una richiesta catturata non si rigioca domani |
| **Nonce usa-e-getta** (vincolo di unicità sul database) | non si rigioca nemmeno subito |
| **Idempotenza** su `x-idempotency-key` | un retry di rete non genera due bonifici |
| Idempotenza applicativa su `(origine, riferimentoEsterno)` | la stessa conversazione non genera due richieste |
| **Tetto per richiesta** e **tetto giornaliero** per chiave | l'app compromessa ha un danno massimo limitato |
| **Lista di IP** per chiave (facoltativa) | le app server hanno IP prevedibili |
| **Limite di colpi al minuto** per chiave | rallenta chi prova a caso |
| **Nessun CORS**, niente preflight (`OPTIONS` → 405) | queste API si chiamano da server, non dal browser |
| Ogni rifiuto scrive `sicurezza.allarme` nel registro | un tentativo si vede |

La firma copre `metodo + percorso (query compresa) + timestamp + nonce +
SHA-256 del corpo`: cambiare un filtro nella query invalida la firma.

**Nessuna chiave API può approvare un pagamento.** Il permesso non esiste
proprio: l'approvazione passa solo dalla UI, da una persona.

## 2. Chi autorizza (gli operatori)

| Controllo | Perché |
|---|---|
| **Account nominali**, niente password di team | senza sapere *chi*, la doppia firma non esiste |
| Password **PBKDF2-SHA256, 210.000 giri**, sale per utente | un dump del database non si converte in password |
| **TOTP obbligatorio** all'accesso | la password da sola non basta |
| **TOTP anche a ogni firma** | un computer lasciato sbloccato non autorizza bonifici |
| **5 tentativi** poi blocco di 15 minuti | forza bruta impraticabile |
| Messaggio d'errore **sempre uguale** | non si scopre quali email esistono |
| **Sessioni sul database**, revocabili | disattivare una persona ha effetto immediato |
| Cookie `httpOnly`, `secure`, **`SameSite=strict`**, 8 ore | niente CSRF, niente sessioni eterne |
| **Scadenza a 10 minuti di inattività** (31/07/2026) | il computer lasciato aperto uscendo dalla stanza non resta autorizzato: le 8 ore coprono la giornata, non la pausa caffè |
| **Ruoli**: admin / approvatore / osservatore | chi deve solo guardare, guarda |
| **Tetto personale** di approvazione | non tutti firmano qualunque cifra |

## 3. Come si decide

| Controllo | Perché |
|---|---|
| **Doppia firma** sopra soglia (predefinito 1.000 €) | un solo account compromesso non basta |
| Doppia firma anche sopra un **punteggio di rischio** | non conta solo l'importo |
| **Due persone diverse**: vincolo unico `(richiesta, operatore)` | non si firma due volte da soli |
| **Chi crea non approva** (richieste manuali) | separazione dei ruoli |
| **Tetto assoluto**: sopra, nessuno approva dall'app | freno d'emergenza |
| **Sigillo** SHA-256 su importo/IBAN/beneficiario/causale | se qualcuno tocca la riga sul database, la firma si blocca |
| Importi in **centesimi interi** | nessun errore di arrotondamento sul denaro |
| **Checksum IBAN** (ISO 7064 mod-97) in ingresso | un IBAN sbagliato non arriva in banca |
| Causale obbligatoria, max 140 caratteri | un pagamento senza causale non è ricostruibile |

## 4. Il motore di rischio

Punteggio 0-100, calcolato alla creazione, con i motivi in chiaro sulla scheda:

| Segnale | Punti | Perché |
|---|---|---|
| IBAN che non supera il checksum | 60 | errore o manomissione |
| **IBAN diverso da quello già usato per lo stesso beneficiario** | 45 | è *la* frode dei pagamenti B2B: qualcuno scrive «abbiamo cambiato banca» |
| Beneficiario non fra quelli verificati (se attivo) | 25 | la rubrica è la lista bianca |
| Importo molto sopra la soglia di doppia firma | 25 | |
| IBAN fuori area SEPA | 20 | più difficile da recuperare |
| Stesso importo, stesso beneficiario, ultime 24 ore | 20 | doppio invio o tentativo |
| Primo pagamento a questo beneficiario | 15 | il momento più delicato |
| Importo sopra la soglia di doppia firma | 12 | |
| Causale troppo generica | 10 | |
| Cifra tonda e grossa | 5 | |

## 5. Tracciabilità

- Registro **a sola aggiunta** con **catena di hash**: ogni evento contiene
  l'hash del precedente. `/registro` ricalcola la catena e dice se e dove si
  rompe. Riscrivere la storia richiederebbe di ricalcolare tutto — e comunque
  si vedrebbe.
- Ogni evento porta **attore, ora e indirizzo IP**.
- Le richieste, le approvazioni e gli eventi **non si cancellano mai**. Il cron
  notturno tocca solo dati tecnici scaduti (nonce, contatori, idempotenza,
  sessioni vecchie).
- Ogni distinta conserva l'**impronta SHA-256 del file** consegnato alla banca.

## 6. Segreti a riposo

Cifrati **AES-256-GCM** con `TRANSACTIONS_ENC_KEY`: segreti TOTP degli
operatori, segreti HMAC delle chiavi API. Formato `v1:<iv>:<tag>:<dati>`, così
si può ruotare l'algoritmo senza indovinare cosa c'è dentro.

Nel database **non esiste in chiaro**: nessuna password, nessuna chiave API,
nessun segreto di firma, nessun segreto TOTP.

## 7. Difese del browser

- **CSP con nonce** in produzione (`script-src 'self' 'nonce-…'
  'strict-dynamic'`): uno script iniettato non ha il nonce e non parte. In
  sviluppo servono `unsafe-inline`/`unsafe-eval` perché il dev server costruisce
  i moduli con `eval()`.
- `frame-ancestors 'none'` + `X-Frame-Options: DENY` — niente clickjacking.
- `Referrer-Policy: same-origin`, `Permissions-Policy` con tutto spento,
  `X-Content-Type-Options: nosniff`, `Strict-Transport-Security`,
  `Cross-Origin-Opener-Policy: same-origin`.
- Le pagine non sono indicizzabili (`robots: noindex`).
- Nelle risposte API l'IBAN torna **mascherato** (`IT60••••3456`).

## 8. Deviazioni dichiarate dallo Standard Deluxy

Lo standard (`deluxy-standard/STANDARD-DELUXY.md`) prescrive due cose che qui
sono fatte diversamente. Sono scritte anche là, come vuole la regola d'oro.

1. **§4.4 — password unica di app.** Le altre app usano
   `<APP>_APP_PASSWORD`. Qui ci sono account nominali con TOTP: senza sapere chi
   ha firmato, la doppia firma non è dimostrabile e il registro non serve a
   niente.
2. **§4.3 — CORS aperto sulle API.** Le altre app espongono dati in lettura e
   permettono `Access-Control-Allow-Origin: *`. Qui si creano richieste di
   pagamento: le API rispondono solo a chiamate server-to-server firmate, e il
   preflight è rifiutato.

## 9. Cosa resta da fare

Nell'ordine in cui conviene farlo — dettagli in [HANDOFF.md](HANDOFF.md):

1. **Passkey/WebAuthn** al posto del TOTP per la firma: toglie il phishing del
   codice a 6 cifre, che è l'anello più debole rimasto.
2. **Cambio password dalla UI** (oggi la password iniziale la mette un admin).
3. **Conferma dell'IBAN fuori banda** tracciata in rubrica (chi ha chiamato chi,
   quando), oggi è una nota libera.
4. **Riconciliazione**: leggere l'estratto conto e chiudere il cerchio fra
   distinta inviata e denaro effettivamente uscito.
