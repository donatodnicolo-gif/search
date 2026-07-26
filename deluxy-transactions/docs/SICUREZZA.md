# Sicurezza di Deluxy Transactions

Questo documento elenca i controlli che ci sono e **perché**. Un controllo senza
motivo scritto è un controllo che prima o poi qualcuno toglie.

## 0. Il principio di fondo

**L'app non muove denaro.** Non ha credenziali bancarie, non chiama nessuna
banca, non ha un endpoint che «esegue» un pagamento. Produce un file SEPA e ne
conserva l'impronta; l'ultimo passo lo fa una persona, nel portale della banca,
con il secondo fattore della banca.

È la difesa più forte che si possa mettere: anche se qualcuno prendesse il
controllo completo di questa applicazione, non potrebbe far partire un bonifico.
Potrebbe al massimo far *comparire* una richiesta plausibile — ed è per questo
che esiste tutto il resto di questo documento.

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
