# Handoff — Deluxy Transactions

> 🏛️ **ARCHITETTURA DEI DATI (OBBLIGATORIA, 24/08/2026)** — Standard Deluxy §7
> ([../../deluxy-standard/STANDARD-DELUXY.md](../../deluxy-standard/STANDARD-DELUXY.md)).
> Il ruolo di QUESTA app: **l'unica da cui può uscire denaro** — nel giro
> dell'ordine D2C riceve le richieste firmate HMAC del «Paga» del Customer
> Service (client già in produzione dal 24/08 in deluxy-messaging, doppio
> binario: per accendere il canale servono una chiave con scrittura + segreto
> HMAC per «deluxy-messaging» e le tre variabili sul suo Vercel). Dall'audit
> 24/08 restano: confrontare nome+IBAN dei beneficiari con Anagrafiche PRIMA
> di accettare una richiesta (oggi nessuno lo fa), `GET /api/health` costante,
> credenziali Qonto nella cassaforte del Hub, l'IBAN reale via da questo file.

Aggiornato: **28 agosto 2026** (collettore unico); fotografia del 17 agosto

## 28/08/2026 — Transactions diventa il COLLETTORE UNICO delle richieste di pagamento

**Decisione dell'utente**: tutte le richieste di pagamento dell'ecosistema
confluiscono qui — Customer Service (fornitori degli ordini), Scout (fornitori
degli eventi), Finance (partner e richieste libere), Piattaforma consegne
(compensi valet). L'app passa da «raccoglie per l'esecuzione automatica» a
«raccoglie TUTTO: l'IBAN si esegue da qui (distinta/Qonto), il resto si chiude
a mano». Architettura passata da una giuria di tre lenti (dati §7, sicurezza,
performance): tre «approvo con modifiche», tutte recepite.

Cosa è stato costruito (tutto deployato, build verde):

- **Metodo di pagamento richiesto dal chiamante**: `Richiesta.metodo`
  (`iban|link|paypal|carta|altro`, default iban) + `riferimentoPagamento` (il
  «come si paga» quando non è un IBAN). Regole SERVER-side in `creaRichiesta`
  (`src/lib/metodi.ts`): Luhn anti-numero-di-carta, link solo http/https,
  riferimento obbligatorio. I non-IBAN **non entrano mai** in distinta/Qonto
  (filtro in `creaDistinta` e in `pagamento-banca`): si chiudono solo con
  «pagata fuori dall'app».
- **Sigillo v2** (`sigilloV`, `audit.ts: sigilloRichiestaV2/sigilloDellaRiga`):
  copre anche metodo+riferimentoPagamento — senza, il riferimento di pagamento
  sarebbe stato l'unico campo di pagamento modificabile dal DB senza allarme.
  Le righe vecchie restano v1 (il versionamento evita di invalidare la coda).
- **Allegati** (`Allegato` + `AllegatoDati`, `src/lib/allegati.ts`): ruolo
  `richiesta` (documento a corredo, caricabile anche via API dal chiamante) e
  `prova` (SOLO operatori: la prova non la scrive l'accusato). Magic bytes
  verificati, tetto 1,5 MB, max 5 per richiesta, sha256 dei byte per verifica
  end-to-end e dedup. Byte in tabella separata dai metadati. ⚠️ **Interim
  dichiarato**: byte nel DB; oltre 500 MB complessivi o 2.000 allegati →
  object storage (Vercel Blob).
- **Esiti affidabili**: outbox `NotificaInvio` + `after()` per il primo colpo
  + cron `/api/cron/notifiche` (*/5 min, CRON_SECRET) per i ritentativi (30 s,
  5 min), **rifirmati con timestamp fresco**; dopo 3 tentativi «fallita» col
  bottone «Riprova adesso» nel dettaglio. Il webhook ora parte ANCHE dopo il
  bonifico Qonto (prima era l'unico esito muto) e dopo l'annullo via API.
  Payload esteso: `metodo`, `allegati[]` (metadati+sha256, mai i byte).
  `ChiaveApi.urlNotifica` = webhook di default per-app; l'override
  per-richiesta è vincolato allo stesso host (difesa SSRF).
- **Pull di recupero** (§7.3.5): `GET /api/v1/richieste?aggiornateDa=<ISO>`
  su `Richiesta.aggiornataIl` — il webhook è un avviso, questo è il canale con
  cui il chiamante ritira i cambi persi. Chi tiene uno specchio locale
  (Scout, Salary della piattaforma) DEVE riconciliare da qui nel suo cron.
- **Lettura AI centralizzata**: `POST /api/v1/estrai` (firmata, rate limit
  dedicato 10/min FAIL-CLOSED) e `POST /api/estrai` (UI) — da testo o
  screenshot escono importo/IBAN/intestatario/causale PROPOSTI; il mod-97
  decide, l'esito non scrive mai nulla da solo (regola di Libro). Motore in
  `src/lib/ai-estrai.ts` (fetch puro, gpt-4o-mini testo / gpt-4o immagini /
  claude riserva; chiavi SOLO da env — `OPENAI_API_KEY` impostata su Vercel
  il 28/08). Il CS tiene il suo motore: deviazione dichiarata, convergenza da
  fare quando si toccherà quel file.
- **UI**: modulo manuale con metodo + lettura AI; dettaglio con metodo,
  allegati (upload prova/documento), esiti delle notifiche col rilancio;
  archivio con filtro per app di origine; coda con metodo sulla riga.
- **Vocabolario `categoria`** (giuria, «due tassonomie»): `categoria` è
  l'imputazione di spesa (`fornitore`, `partner`, `valet`, categoria Budgets);
  il TIPO di app è `origine`. Mai usare categoria per capire chi chiama.

**Correzione a questo documento**: più sotto si dice che Finance ha la coda
`richiestePagamentoIn` e che le due code coesistono — **non è più vero**: la
coda inbound di Finance è stata creata e rimossa lo stesso 26/07 (commit
`97b53692`). Il fallback del CS verso `POST /api/richieste-pagamento` di
Finance oggi colpirebbe un 404: da spegnere (fatto nel giro CS del 28/08).

**Restano da fare** (fotografia 17/08 sempre valida): la coda ferma coi
6.656 € — i muri sono operativi (beneficiari fidati Qonto, nomi VoP), non di
codice; revocare le 3 chiavi inerti del 26/07; il confronto nome+IBAN con
Anagrafiche alla creazione.

## Fotografia del 17/08/2026 (letta dal database e dall'API di Qonto)

Nessun commit sull'app dal 3 agosto, e **nessuno ha più aperto l'app dal 3
agosto alle 17:01** (ultimo evento nel registro). Il codice è quello di allora e
la produzione risponde: `GET /api/v1/health` →
`{"ok":true,"database":true,"cifratura":true}`.

**Quello che è cambiato è la coda: si sta riempiendo e nessuno la lavora.**

| | |
|---|---|
| Richieste | **10** — 7 `in_attesa`, 1 `in_lotto` (i 5,79 €), 2 annullate |
| Fermo in attesa | **6.656,17 €** su 7 richieste, la più vecchia dal 31/07 |
| Pagamenti usciti | **zero**, come il 31/07 |
| Saldo Qonto | 99.129,54 € sul «Conto principale» (è l'IBAN dell'ordinante) |
| Beneficiari fidati su Qonto | **0 su 1131** — invariato dal 31/07 |

Le sette in attesa: `TRX-2026-000004` CHIARAKUL ILARIA 249,28 € · `-000005`
TASTE 2.0 S.R.L. 484,00 € · `-000006` LA BOTTEGA DI CIOCCOLATO 9,83 € (ha già
**una firma su due** dall'1/08, si è fermata lì) · `-000007` LOPS ANGELA
2.336,59 € · `-000008/9/10` MUCIACCIA PAOLO 942,42 + 686,31 + 1.947,74 €, tutte
e tre arrivate da Finance il 3/08.

**Il muro non è più uno solo, sono due.** Confrontando gli IBAN delle richieste
aperte con la rubrica di Qonto:

| Richiesta | Nome dalla richiesta | Come lo vede Qonto |
|---|---|---|
| `-000003` | 142 RESTAURANT | «BEYOND 142 SRL», `validated`, non fidato |
| `-000004` | CHIARAKUL ILARIA | **IBAN assente dalla rubrica** |
| `-000005` | TASTE 2.0 S.R.L. | «TASTE 2 0 S R L», `pending`, non fidato |
| `-000006` | LA BOTTEGA DI CIOCCOLATO … SEMPLIFICATA | «La bottega di cioccolato srls», `pending` |
| `-000007` | LOPS ANGELA | «Angela Lops», `pending`, non fidato |
| `-000008/9/10` | MUCIACCIA PAOLO | **IBAN assente dalla rubrica** |

Quindi: per **quattro** richieste su otto il beneficiario in Qonto non esiste
proprio — prima di poterlo rendere fidato va creato. Per le altre esiste ma non
è fidato, e due sono ancora `pending`. Il nome che manda Finance non coincide
mai con quello di Qonto: non è solo il caso «142 RESTAURANT».

⚠️ **Attenzione a cosa dimostra la tabella qui sopra.** Il quinto controllo non
confronta il nome della richiesta con la rubrica di Qonto: chiama la banca
(`POST /sepa/verify_payee`) e accetta **solo `MATCH`** — `CLOSE_MATCH` viene
rifiutato, vedi `pagamento-banca.ts:134`. La rubrica è solo l'indizio che i nomi
arrivano in una forma diversa; l'esito vero del VoP **non è mai stato misurato
su queste richieste**. Farlo è una POST verso Qonto che non muove un euro (e il
proof token vale 23 ore): è il modo più economico di sapere in anticipo quali
passerebbero, prima di bruciare uno sblocco.

**Perché la doppia firma scatta sempre** (rischio 40-65 su tutte): in rubrica
locale ci sono 8 beneficiari e **zero verificati**, mentre
`soloBeneficiariVerificati` è acceso. Quel controllo **non blocca niente**, è un
segnale di rischio da **+25 punti** (`rischio.ts:43`), a cui si somma «primo
pagamento a questo beneficiario» +15. Da soli fanno 40, e la soglia di rischio è
a 10. Chi volesse alleggerire la coda verifichi i beneficiari in rubrica, non
alzi la soglia.

**Le chiavi API sono quattro, non tre.** Alle tre del 26/07 (`trx_p8610J6y`,
`trx_CLl3bYu_`, `trx_CJn3ErNv`, tutte con `ultimoUso` **mai**) se ne è aggiunta
una quarta, di nuovo intestata a `deluxy-partner`: **`trx_ozWW4edK`**, usata
l'ultima volta il 3/08 alle 15:14. È quella con cui Finance sta davvero
scrivendo — le tre vecchie sono attive ma inerti, e andrebbero revocate per non
lasciare in giro chiavi valide che nessuno usa.

> ⚠️ **Leggi prima questo (aggiornato la sera del 31/07/2026).** L'app è
> **configurata e in produzione**, e la catena è stata percorsa fino in fondo su
> un caso vero: richiesta arrivata da Finance → due firme → distinta → codice
> per email → sblocco con PIN → tentativo di bonifico. **Il denaro non è
> uscito**, e per il motivo giusto: su Qonto ci sono **1131 beneficiari e zero
> fidati**, quindi il quarto dei sei controlli ferma tutto.
>
> Due cose da sapere prima di toccare qualsiasi cosa:
>
> 1. **Nessun bonifico è mai partito da questa app.** `pagate: 0` è l'unico
>    risultato mai ottenuto contro l'API vera.
> 2. **Il repo `scoutwt` è condiviso con un'altra sessione** che lavora sullo
>    stesso branch `scout-ui`. Il `HEAD` locale può sembrare tornato indietro:
>    verificare il proprio lavoro **per contenuto** su `origin/scout-ui`
>    (`git merge-base --is-ancestor <mio-commit> origin/scout-ui`), mai
>    confrontando gli SHA.
>
> La sequenza per far uscire il primo euro è in «Punti aperti» in fondo.

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
- **Chiudere una richiesta senza pagarla da qui** (03/08/2026): dalla sua pagina
  **e dalla coda** (due tasti per riga che aprono una finestrella con gli stessi
  campi — `<dialog>` nativo, Esc lo chiude) si può segnarla **già pagata altrove** (bonifico fatto a mano dal portale della
  banca, addebito, carta, contanti, compensazione — con data e nota
  obbligatorie) oppure **annullarla** con un motivo. Serve il codice a 6 cifre,
  come per una firma. **Non è una seconda porta per far uscire denaro**: non
  genera niente e non chiama la banca, quindi non passa dal PIN del pagatore —
  registra denaro già uscito. Tre effetti che contano: la richiesta **esce dalla
  distinta** in cui si trovava (altrimenti la pagherebbe di nuovo il file SEPA),
  se quella distinta era **sbloccata lo sblocco decade**, e l'app di origine
  viene **avvisata col webhook**. Nel registro l'evento è
  `richiesta.pagata_fuori`, distinto da `richiesta.pagata`; sulla riga resta
  `pagatoCon = "fuori_app"` e la pillola dice «pagata fuori». Il perché di ogni
  scelta è in [SICUREZZA.md](SICUREZZA.md) §0-ter. Codice:
  `chiudiFuoriDallApp()` in [src/lib/richieste.ts](../src/lib/richieste.ts),
  azione `chiudiRichiesta` in [src/app/actions.ts](../src/app/actions.ts),
  moduli [ModuloChiusura.tsx](../src/components/ModuloChiusura.tsx) (dettaglio) e
  [ChiusuraRapida.tsx](../src/components/ChiusuraRapida.tsx) (coda). Dalla coda
  l'azione **torna in `/` con riferimento ed esito nell'indirizzo**: la riga
  sparisce nell'istante in cui l'azione riesce, e un messaggio disegnato dentro
  quella riga non si vedrebbe mai. Nell'indirizzo non viaggia il testo da
  mostrare — la frase la compone la pagina, altrimenti basterebbe mandare un link
  per far leggere «pagamento eseguito» dentro l'app.
- **I quattro campi si copiano uno per uno** (03/08/2026): dentro «chiudere senza
  pagarla da qui», in dettaglio e in coda, ci sono IBAN, intestatario, importo e
  causale con un tasto «copia» ciascuno — perché chi segna una richiesta pagata
  altrove sta per ribatterli nel modulo della banca, ed è lì che si sbaglia una
  cifra dell'IBAN. **Si copia una forma diversa da quella che si legge**: IBAN
  senza spazi, importo senza simbolo e senza separatore di migliaia
  (`importoDaIncollare()` in [src/lib/denaro.ts](../src/lib/denaro.ts) — «1.234,56»
  incollato in un campo importo viene letto 1,23). Componente
  [CampiDaCopiare.tsx](../src/components/CampiDaCopiare.tsx), con ripiego su
  `execCommand` dove `navigator.clipboard` non c'è.
- **La riga intera apre il dettaglio** (03/08/2026): in coda e in archivio si
  clicca dove capita, non solo sul riferimento
  ([RigaCliccabile.tsx](../src/components/RigaCliccabile.tsx)). Tre cose che deve
  non fare, ed è il motivo per cui non è un `onClick` e basta: non rubare i clic
  ai comandi dentro la riga (compresa la finestrella di chiusura, che vive in una
  cella e i cui clic risalirebbero fino alla riga), non navigare mentre si sta
  **selezionando testo** (si copia un IBAN dalla riga), e lasciar funzionare
  Ctrl/Cmd e il tasto centrale per la scheda nuova. Il link sul riferimento resta:
  è quello che serve alla tastiera.
- **Il webhook dice anche come e perché** (03/08/2026): al corpo si sono aggiunti
  `pagatoCon` (`distinta` | `qonto` | `fuori_app`) e `motivo`. Campi aggiunti,
  non sostituiti: chi legge solo `stato` continua a funzionare. Finance li
  scrive nel proprio registro (`deluxy-partner`,
  `src/app/api/pagamenti/notifica/route.ts`), così «pagata fuori dall'app» e il
  motivo di un annullamento si leggono senza aprire Transactions.
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
`CRON_SECRET` (production + preview) — **e nient'altro**: posta e chiavi della
banca stanno sul database, cifrate, messe dall'app. Il Hub ha
`APP_URL_TRANSACTIONS` ed è stato ripubblicato: l'icona «Transactions» compare
agli admin.

### Com'è configurata adesso (letto dal database la sera del 31/07/2026)

| Cosa | Valore |
|---|---|
| Operatori | `deluxy.delivery@gmail.com` (nome «Nicolo Donato», PIN impostato) e `nicolo.donato@deluxy.it` (nome «Nicolo Daniele Donato», **è il pagatore**, PIN impostato) |
| Ordinante | `DELUXY SRL`, IBAN `IT51M3609201600364189687708`, BIC vuoto |
| Doppia firma | da **10,00 €** in su, oppure rischio ≥ **10** |
| Tetto assoluto | **5.000 €** |
| Solo beneficiari verificati | acceso |
| Posta | `authsmtp.securemail.pro:465`, utente e mittente `nicolo.donato@deluxy.it`, destinatari ammessi: **solo** `nicolo.donato@deluxy.it` |
| Qonto | chiavi presenti e valide (HTTP 200), **interruttore acceso** |
| Link banca | portale `https://app.qonto.com/`, pagina di caricamento SEPA **vuota** |

⚠️ La soglia di rischio a **10** rende la doppia firma quasi sempre obbligatoria
(un primo pagamento a un fornitore nuovo vale già 15 punti). Se non è voluto, il
valore sensato è intorno a 50.

### La catena percorsa per intero, e dove si è fermata

Il 31/07/2026, sulla richiesta vera `TRX-2026-000003` (5,79 € a «142
RESTAURANT», arrivata da `deluxy-partner`):

1. **09:12** richiesta creata via API da Finance — rischio 40, doppia firma;
2. **09:19** due firme di due operatori distinti → `approvata`;
3. **09:23** `LOTTO-2026-0001` creato;
4. **09:52** codice chiesto e **ricevuto per email** — la posta funziona;
5. **09:53:24** sblocco riuscito con codice + PIN;
6. **09:53:35** bonifico tentato → **`pagate: 0, bloccate: 1`**.

Il blocco è il quarto dei sei controlli: **l'IBAN non è fra i beneficiari
fidati**. Verificato contro l'API di Qonto: **1131 beneficiari, zero fidati**.
L'IBAN della richiesta c'è ed è intestato a **«BEYOND 142 SRL»**
(`status: validated`, `trusted: false`) — non a «142 RESTAURANT», che è il nome
commerciale con cui lo manda Finance.

**31/07/2026 — allineamento fatto.** `npx prisma db push --accept-data-loss` ha
aggiunto le quattro colonne Qonto su `Richiesta` (`pagatoCon`,
`qontoTransferId`, `qontoStato`, `qontoMovimentoId`): il diff era davvero solo
additivo, l'unico avviso riguardava il vincolo di unicità su una colonna che non
esisteva ancora, quindi senza righe da duplicare. Poi
`npx vercel deploy --prod --yes`: i tre commit del cancello (`bddbe50`,
`c1299a7`, `fee50bc`) sono in produzione, `/pin` e `/banca` rispondono
(307 → `/login`).

Le credenziali degli operatori sono state consegnate al titolare fuori dalla
trascrizione: in chat non vanno mai, e quelle di una sessione precedente erano
state cancellate proprio per questo.

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
- **La risposta della banca spariva prima di essere letta** (fino al
  31/07/2026). Gli esiti di `pagaConQonto` erano disegnati solo dentro il
  riquadro «Pagamento sbloccato», ma pagare **consuma lo sblocco**: la pagina si
  ridisegnava sull'altro riquadro e il messaggio non aveva più dove comparire.
  Da fuori: «l'app non risponde». Ora gli esiti stanno in un blocco unico
  presente in entrambi i rami, i motivi dei blocchi tornano come **elenco** e
  finiscono anche nel registro (campo `motivi` dell'evento `pagamento.eseguito`,
  prima c'era solo il conteggio). Regola: un messaggio disegnato solo nel ramo
  che l'azione stessa fa sparire non si vedrà mai.
- **L'altezza della barra in alto era scritta a mano (63px) in quattro punti.**
  Aggiungendole una riga di testo, sidebar, cassetto e sfondo si agganciavano
  7px più in alto e la pagina scrollava in orizzontale su telefono. Ora è
  `--h-topbar`, e la barra è alta esattamente quello.
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
- **Un elenco condiviso fra browser e server non sta in `lib/richieste.ts`.** Le
  voci del menu «come è stata pagata» servono al modulo client e al controllo sul
  server: importarle da lì avrebbe trascinato **Prisma dentro il bundle del
  browser**. Stanno da sole in [src/lib/metodi-fuori.ts](../src/lib/metodi-fuori.ts).
- Gli script `scripts/*.mjs` ripetono la cifratura invece di importarla da
  `src/lib/crypto.ts`: se cambia l'algoritmo là, vanno allineati anche loro.

## Punti aperti al 17/08/2026

Riverificati sui dati veri (vedi «Fotografia del 17/08/2026» in cima). L'ordine
è quello che sblocca il primo euro con meno lavoro:

1. **Misurare il VoP prima di bruciare uno sblocco.** Chiamare
   `POST /sepa/verify_payee` per gli otto IBAN aperti e vedere quali rispondono
   `MATCH`: costa niente, non muove denaro, e dice in anticipo quali richieste
   passerebbero il quinto controllo e quali no. Oggi non lo sa nessuno.
2. **Creare in Qonto i beneficiari che non ci sono** (`CHIARAKUL ILARIA` e i tre
   `MUCIACCIA PAOLO`): finché l'IBAN non è in rubrica, «rendere fidato» non è
   nemmeno un'operazione possibile.
3. **Rendere fidati i beneficiari** — invariato: 0 su 1131, con conferma sul
   telefono. È il quarto controllo, e ferma tutto.
4. **Verificare gli 8 beneficiari nella rubrica dell'app**: toglie 25 punti di
   rischio a testa e smette di far scattare la doppia firma su ogni richiesta.
   È l'alternativa giusta ad alzare la soglia di rischio.
5. **Revocare le tre chiavi API mai usate** (`trx_p8610J6y`, `trx_CLl3bYu_`,
   `trx_CJn3ErNv`): Finance usa `trx_ozWW4edK`, le altre sono attive e inerti.
6. **Decidere cosa fare della coda ferma**: 6.656,17 € in attesa dal 31/07, con
   `TRX-2026-000006` piantata a una firma su due. Se sono state pagate a mano
   dal portale, vanno chiuse come «pagate fuori dall'app» — altrimenti Finance
   continua a crederle in lavorazione.

Il resto dei punti aperti (dal 31/07/2026) resta valido:

## Punti aperti al 31/07/2026

Configurazione, PIN, posta e chiavi della banca sono **fatti** (vedi «Stato in
produzione»). Quello che manca adesso è far uscire il primo euro, e i primi due
punti sono lavoro *dentro Qonto* e *dentro Finance*: non si risolvono scrivendo
codice qui.

1. **Rendere fidato il beneficiario dentro l'app Qonto.** È ciò che ha fermato
   il primo pagamento vero. Attenzione: in Qonto quell'IBAN è intestato a
   **«BEYOND 142 SRL»**, non a «142 RESTAURANT» — si cerca con la ragione
   sociale. Il percorso passa dall'elenco dei beneficiari (con 1131 nomi, la via
   comoda è cominciare un «Nuovo bonifico» e digitare il nome), poi «segna come
   fidato» e **conferma sul telefono**: senza quella conferma non è fatto. Da
   verificare dopo, con una lettura dell'API, prima di bruciare un altro sblocco.
   Vale per **ogni** fornitore da pagare: oggi i fidati sono zero su 1131.
2. **Il nome del beneficiario va corretto alla fonte, in Finance.** Il quinto
   controllo confronta il nome della richiesta con l'intestatario che risponde
   la banca, e accetta solo la corrispondenza piena. Finché Finance manda il
   nome commerciale («142 RESTAURANT») e il conto è intestato alla società
   («BEYOND 142 SRL»), il controllo fallirà anche a beneficiario fidato.
   **Non allentare il controllo qui**: è l'unica difesa contro la fattura con
   l'IBAN cambiato.
3. **Il primo bonifico vero non è mai partito.** `pagate: 0` è l'unico esito mai
   ottenuto. Il giro va chiuso con la cifra piccola che è già in coda (5,79 €)
   prima di considerare la strada affidabile. Dal 03/08/2026 c'è anche l'uscita
   di servizio: se quei 5,79 € vengono pagati a mano dal portale della banca,
   `TRX-2026-000003` si segna **pagata fuori dall'app** e Finance lo viene a
   sapere — ma resta vero che il percorso VoP → bonifico non è mai stato
   completato, e segnarla pagata **non lo dimostra**.
4. **Soglia di rischio a 10**: rende la doppia firma quasi sempre obbligatoria.
   Da confermare con l'utente o riportare a ~50.
5. **Link «vai a pagare»**: compilare in Impostazioni l'indirizzo della pagina
   di caricamento del file SEPA (il portale è già precompilato). Vuoto, il
   bottone ripiega sull'ingresso del portale: non si rompe niente, è un clic in
   più.
6. **Chiavi API delle app**: create il 26/07 per `deluxy-partner`,
   `deluxy-messaging`, `deluxy-acquisti` (valori consegnati su file). **Finance
   la usa già**: `TRX-2026-000003` è arrivata da lì il 31/07. Restano da
   collegare `deluxy-messaging` e `deluxy-acquisti`, e va deciso quando spegnere
   il percorso `Messaggi → Finance` per non tenere due code di approvazione.
7. **I due account sono la stessa persona.** `deluxy.delivery@gmail.com` e
   `nicolo.donato@deluxy.it` sono entrambi del titolare, ed è con quei due che
   si è ottenuta la «doppia firma» sulla prima richiesta. Funziona, ma come
   controllo vale solo se le persone sono davvero due: quando entra qualcun
   altro in azienda, il secondo account va dato a lui.
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
