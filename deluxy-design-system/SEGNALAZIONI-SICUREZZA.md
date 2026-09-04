# Segnalazioni di sicurezza — il registro del custode

**Dal 27/08/2026 la sicurezza di tutte le app Deluxy ha un custode: l'agente `architetto-sicurezza`** (`.claude/agents/architetto-sicurezza.md`), che applica il [Libro della Sicurezza](LIBRO-SICUREZZA.md). Le segnalazioni passano PRIMA dall'agente `sicurezza-ostile` (un falso allarme costa il doppio).

## Come funziona

1. **Chi trova un buco di sicurezza o vuole cambiare una difesa NON lo risolve in autonomia**: lo scrive qui sotto (o interpella l'agente `architetto-sicurezza` in sessione).
2. **La segnalazione passa dall'ostile** (`sicurezza-ostile`): sopravvive solo con un **percorso di sfruttamento** (chi è l'attaccante e le credenziali che HA davvero · quale chiamata fa · quale dato preciso ottiene). Senza, è un'ipotesi, non lavoro.
3. **Il custode decide**: correzione locale (l'app era esposta) · regola nuova del Libro (vale **anche per le altre app**) · ridimensionamento/deroga (percorso non raggiungibile o rischio accettato, con il motivo scritto).
4. L'esito si sposta in «Decise», con la data, la minaccia e la voce del Libro.
5. **Non si corregge una difesa senza far smontare anche la TOPPA** dall'ostile (nell'audit 27/08 e nella giuria 5 «buchi»/toppe su ~16 sono caduti sotto verifica).

> Formato: `app · punto (auth/sessione/chiave/scope/webhook/…) · il percorso di sfruttamento (chi/chiamata/dato) o la difesa da cambiare · chi segnala/data`. Un percorso verificato batte una lettura del codice; **mai** provare un exploit su dati veri.

## In attesa — priorità dal Libro (Appendice B)

| Pr. | App | Segnalazione (minaccia) | Voce Libro |
|---|---|---|---|
| 🔴 ESTERNO | search-supplier | webhook: settare `SHOPIFY_WEBHOOK_SECRET` su Vercel (main) + togliere il fallback `if(!enforce) return {ok:true}` — anonimo inietta un ordine falso che l'operatore smista al fornitore | cap. 7 |
| 🔴 ESTERNO | Fondo | nessuna auth: espone il portafoglio reale a chi conosce l'URL — introdurre SSO Hub/password; confermare la protezione Vercel | cap. 15 |
| 🟠 FAIL-OPEN | Finance, Tasks, Acquisti | se manca l'env la sessione apre tutto come admin — fail-closed 503 + check CI «env presente in prod» | cap. 1 |
| 🟠 INSIDER | Hub | cassaforte `/api/keys`: un token legge tutto il caveau in chiaro (→ chiave di scrittura di Anagrafiche) — scope per-app + cifratura | cap. 8 |
| 🟠 INSIDER | Finance | chiave unica in chiaro valida per 5 app, la GET scrive (PATCH proforma = conferma pagamento) — hash + scope, GET non scrive, migrare i consumatori | cap. 3 |
| 🟠 INSIDER | Personale | `?compensi=1` su qualsiasi chiave = tutti gli stipendi — scope `retribuzioni` dedicato | cap. 4 |
| 🟠 INSIDER | Acquisti, Tasks | identità auto-dichiarata (approvatore da `ioEmail`; `sistema`/`attore` dal body) — dalla credenziale | cap. 5 |
| 🟠 INSIDER | Tasks, CRM | Tasks `/api/interno` senza proprietà; CRM senza revoca + admin-per-tutti | cap. 4, 1 |
| 🟡 IGIENE | Hub, Finance, Mail, CRM, Tasks, Fondo, Personale, Acquisti | `next.config` vuoto: header di sicurezza assenti — X-Frame/nosniff/Referrer/Permissions subito, CSP con nonce graduata | cap. 9 |
| 🟡 IGIENE | Mail | allegati serviti col Content-Type del mittente senza nosniff/whitelist (XSS) — modello CS `/api/media` | cap. 10 |
| 🟡 MOBILE | Scout | token+coda in AsyncStorage in chiaro → SecureStore + coda cifrata; Maps ristretta; PAT fuori dal `.env`; verificare signup/anon OFF su Supabase | cap. 13, 12 |
| 🟢 PROGETTO | Finance, Anagrafiche, Personale | IBAN/stipendi/segreti in chiaro sul cluster condiviso — gating (colonne non selezionabili) subito, cifratura AEAD come progetto | cap. 11 |

## Decise

| Data | Ambito | Esito |
|---|---|---|
| 04/09 | Piattaforma | **Vendite al PARTNER: dati personali e prezzi pubblici usciti dall'API (segnalazione dell'utente, CHIUSA in locale)** — `GET /sales` e `GET /sales/:id` mandavano al partner destinatario, indirizzo, telefono, `customerId`, importo pubblico, sconto e listino del prodotto, e nel registro le righe «modifica» con campi e importi. Toppa in UN punto (`SalesService.perPartner`, applicata a lista e dettaglio): quei campi tolti o a null, al loro posto `prezzoPartner` = importo × (1 − sconto%); registro senza «modifica»; l'ufficio resta «Ufficio Deluxy». La pagina nasconde le righe, ma la difesa è del server (Libro: deny-by-default sui campi, non whitelist di interfaccia). Da deployare con la piattaforma. Stesso ceppo del 02/09 (#100791): il modello Sale porta il cliente dentro e ogni lettura che lo espone va filtrata per ruolo |
| 04/09 | CRM | **DIFESA NUOVA (richiesta dell'utente): la password di squadra si cambia e si recupera dall'app** — `PasswordTeam` (riga unica, scrypt, `versione`) sostituisce l'env dal primo cambio; `TokenResetPassword` (solo SHA-256, monouso, 60 min); link SEMPRE a `CRM_RESET_EMAIL`→`MAIL_UTENTE`, risposta unica; sessioni con `gen` + `sessioneCorrente()` = revoca. **Passata dall'ostile** (4 confermate, 7 ridimensionate, 8+ refutate) e **corretta nello stesso giro**: (c5) la revoca stava SOLO nel layout, che Next non ri-renderizza nelle navigazioni RSC → `dentroOppureFuori()` in testa a tutte le 18 pagine sotto `(app)`; (c4) `/api/interno/*` erano protette solo dal gate Edge → `sessioneApiValida()` 401; (f2) origine del link dagli header = reset-poisoning/preview → `CRM_URL` fisso; (d3) a posta spenta il proprietario non poteva espellere chi ha la password → l'admin del Hub (SSO) cambia SENZA `attuale`; (b4) doppio invio dello stesso token → updateMany condizionato in transazione interattiva; (a3) tetto globale 3/ora esauribile da chiunque → contatore «richieste 24h» in Impostazioni; (f1) `db push` fatto PRIMA del deploy. **Rischi accettati con motivo**: token nella query string dei log Vercel (chi li legge ha già la env); scrypt N=2^14 (alzare a 2^17 solo con `maxmem`); env `CRM_APP_PASSWORD` obbligatoria per il fail-closed anche quando «morta» (documentato in pagina); `/api/novita/sezioni` senza revoca (solo pallini); admin-per-tutti e lockout sul login RESTANO aperti (righe sopra). ⚠️ **Decisione del proprietario ancora aperta (b5)**: la casella di reset è `MAIL_UTENTE` = deluxy.delivery@gmail.com, letta in AI Mail — chi legge quella casella può reimpostare la password e diventare admin del CRM: deve leggerla solo chi ha titolo, altrimenti impostare `CRM_RESET_EMAIL` su una casella del solo amministratore |
| 29/08 | Transactions | **RISCHIO ACCETTATO (ordine diretto dell'utente): il codice a 6 cifre NON si chiede più all'ACCESSO** — il login torna email+password (lockout sui tentativi invariato). Il TOTP resta INTATTO dove il denaro si muove: ogni firma (decidiRichiesta), le chiusure «pagata fuori/annulla», il cambio del server di posta; e l'uscita vera resta dietro il cancello del pagatore (codice email + PIN). Superficie che si apre: una password rubata ora fa ENTRARE (lettura della coda: importi, beneficiari, IBAN completi nel dettaglio) ma non fa uscire un euro né firma nulla. Se il custode vorrà ridurla senza reintrodurre il codice: sessione più corta o vincolo IP sugli operatori |
| 29/08 | Scout ↔ Anagrafiche | **Scoperto: la chiave «driver di prima parte» di Scout non esiste più in chiaro da nessuna parte** — nel registro c'è `deluxy-scout-partner` (scritturaPartner, l'unica che può impostare `stato` via POST upsert), ma la cassaforte di Scout (`chiavi_app`, riga unica `anagrafiche` per TRE nomi di chiave — trappola nota) contiene la chiave di scrittura piena `deluxy-scout` SENZA quello scope, e il secret `ANAGRAFICHE_PARTNER_KEY` della Edge non corrisponde a NESSUNA chiave del registro (hash confrontati). Conseguenza: la sincronizzazione dello stato commerciale da Scout era **silenziosamente inerte** (il POST rispondeva 200 e ignorava `stato`). **Rimedio applicato** (nessuno scope toccato): la Edge `anagrafiche`, quando il POST ignora lo stato, fa la **PATCH mirata** con la stessa chiave — via sancita dal contratto del registro per le chiavi a scrittura piena. ⬜ **Per il custode**: decidere se ruotare `deluxy-scout-partner` (nuova copia in chiaro nella cassaforte, riga separata) o dare `scritturaPartner` alla chiave `deluxy-scout` (già scrittura piena: non allargherebbe nulla) e togliere il ripiego; e bonificare il secret morto della Edge |
| 27/08 | tutte | Nasce il Libro della Sicurezza: analisi di 13 app (7 agenti), giuria a 3 lenti (esterno/insider/mobile-applicabilità), revisione ostile che ha verificato ogni buco sul codice (11 confermati, 5 ridimensionati) → Libro v1.0 + piano di rimedio (Appendice B) |
| 27/08 | Personale | RIDIMENSIONATO: il gate di ruolo mancante sull'UI `/stipendi` NON è raggiungibile oggi (nessun emettitore SSO nel parco, il login a password dà admin). Il buco reale è l'API `?compensi=1`. Il gate UI resta debito latente, da chiudere PRIMA di introdurre un SSO che conii token non-admin |
| 27/08 | piattaforma | RIDIMENSIONATO: RolesGuard allow-by-default apre agli AUTENTICATI, non agli anonimi (debito latente); token conferma=monitoraggio gravità BASSA (guardia stati già presente). Difese già forti: identità riletta dal DB con revoca immediata, mass-assignment chiusa nel service, lockout login su DB |

---

## Hub — recupero password dal login (30/08/2026, richiesta dell'utente)

**Cosa c'era prima**: nessun recupero. Chi dimenticava la password doveva chiedere a un
amministratore, che gliela reimpostava da `/utenti`. **Cosa c'è ora**: «Password dimenticata?»
in fondo al login → link per email → nuova password.

**È una superficie nuova e pubblica** (chi la usa non è loggato, per definizione): le due rotte
sono escluse dal middleware, quindi ogni difesa vive dentro le azioni. Come è stata costruita,
punto per punto del Libro:

| Regola | Come | Verificato |
|---|---|---|
| Token non leggibile a riposo | 32 byte casuali; a DB solo lo **SHA-256** (come `TokenApi`) | tabella `TokenReset`: in chiaro non c'è |
| Monouso + scadenza | `usatoIl` + `scadeIl` a **60 minuti**; al consumo si bruciano **tutti** gli altri link non usati della persona | riuso dello stesso link → «Link non più valido» |
| Niente user-enumeration (§14) | risposta **identica** per email sconosciuta, account disattivato, freno scattato o mail partita | provate email inesistente ed esistente: stessa pagina |
| Revoca sessioni (§1) | il cambio password sposta `sessioniValideDa`: ogni cookie emesso prima muore | `sessioniValideDa` valorizzata; vecchia password non entra più |
| Freno (§2, §14) | **su database** (non in-memory: su serverless non conterebbe): 3/ora per persona, 10/ora per IP | 4ª richiesta in un'ora → nessun token creato |
| Password NIST (§2) | min **12**, blocklist dei valori comuni, vietato nome/email dentro; **nessuna** regola di composizione | i tre rifiuti provati uno per uno |
| Atomicità | password + revoca + token bruciato in **una transazione** | — |
| PII | dell'IP si salva **solo l'hash** (sale = segreto dell'app): serve a contare, non a identificare | — |

### Due cose che restano aperte (decida il custode)

1. **Timing residuo sull'invio SMTP.** La risposta è identica nel testo, ma quando l'email
   esiste l'azione attende l'invio SMTP: un osservatore attento potrebbe distinguere i due casi
   dal tempo di risposta. Chiuderlo del tutto richiede una coda (invio fuori dalla richiesta) —
   non c'è oggi nel Hub. Rischio basso ma **reale**: va deciso se accettarlo per iscritto o
   mettere una coda.
2. **Il lockout sul LOGIN continua a non esserci** — è la priorità che il Libro §2 assegna al
   Hub («oggi pubblico senza alcun freno: è credential-stuffing sull'email admin che apre la
   porta della suite»). Il freno appena scritto vale **solo** per il recupero. La tabella
   `TokenReset` mostra però che il contatore su DB è pratica già in casa: lo stesso schema
   (per-email e per-IP, conteggio **prima** dell'hash) si applica a `accedi`.

**Prerequisito operativo**: la posta del Hub **non è configurata** (né env né cassaforte,
verificato il 30/08). Finché non lo è, il link non parte e la pagina lo dichiara invece di far
aspettare un'email che non arriverà. Si accende da `/chiavi`, progetto `hub`, con
`SMTP_HOST`/`SMTP_USER`/`SMTP_PASS` — senza toccare Vercel e senza redeploy.

## Hub — `POST /api/posta`: la casella prestata alle altre app (30/08/2026)

**Perché**: le credenziali SMTP hanno una casa sola (Standard §7). L'alternativa era una
copia della password della casella in ogni app che manda email — a partire dal recupero
password di ciascuna.

**È un endpoint che spedisce**: senza difese sarebbe un relay per lo spam il giorno che un
token gira. Costruito sulla lista già pagata su AI Mail (automatismi che mandano mail),
adattata a un servizio: scope `posta` obbligatorio (un token per *leggere le chiavi* non
deve poter spedire a nome di Deluxy) · **fail-closed 503** se la posta non è configurata,
mai un 200 senza invio · **tetto orario su DB** 100/token e 300 totali · niente caselle
automatiche · `Idempotency-Key` perché un retry non rispedisca · **registro** in `/chiavi`
con destinatario mascherato, **senza il corpo** e senza l'indirizzo in chiaro.

Verificato: 401 senza token, 403 con scope sbagliato, 503 a posta assente, 400 su
destinatario/oggetto, 422 su `noreply@`, ripetizione che non rispedisce, e il registro che
mostra mascherato ciò che è successo.

### Da tenere d'occhio

- **Il contenuto lo scrive l'app chiamante.** Fra app nostre è accettabile, ma significa che
  chi ha un token `posta` può far partire un messaggio *dall'indirizzo di Deluxy* con il testo
  che vuole: i token vanno dati per app e revocati quando un'app va in pensione. Il registro
  serve esattamente a rispondere alla domanda «chi ha mandato cosa».
- **L'elenco dei prefissi automatici è un ripiego** (`noreply`, `postmaster`, …), non un
  rilevamento vero: senza le intestazioni `Auto-Submitted` non c'è modo di saperlo davvero.

## 31/08/2026 — Scout: i task si leggono in squadra (allargamento DICHIARATO, migr. 0108)

**Cosa cambia.** La policy di SELECT su `tasks` passa da
`owner = auth.uid() OR creato_da = auth.uid() OR email = '<admin>'` a `using (true)`
per gli autenticati. **Solo la lettura**: INSERT, UPDATE e DELETE restano
identiche (proprio, creato da sé, o admin) — vedere il lavoro della squadra è
un'altra cosa dal poterlo cambiare, e allargare le due insieme sarebbe allargare
più di quanto è stato chiesto.

**Perché.** Richiesta esplicita dell'utente («fai vedere a me e a tutti»), nata da
un caso vero: crea un task per Martina Calia e non lo trova più. Misurato prima
della modifica: per un venditore il filtro «Tutti» mostrava **le stesse righe**
del filtro «Assegnati a me» — un elenco che prometteva più di quello che dava.
Dopo: Martina vede 7 task su 7 (prima: solo i suoi).

**Perché non è un'eccezione.** `places`, `contacts`, `deals`, `visits` e
`richieste_cliente` si leggono già tutte con `using (true)` fra gli autenticati:
Scout è un'app di squadra e il lavoro commerciale è condiviso per progettazione.
I task erano l'anomalia — ed erano anche **l'unica tabella con un indirizzo email
scritto nel corpo della policy di lettura**, cioè un privilegio legato a una
persona invece che a un ruolo.

**Superficie.** Chi entra in Scout è un utente autenticato del team commerciale
(tre profili oggi). Un task contiene titolo, scadenza, negozio e assegnatario:
niente recapiti privati oltre a quelli già leggibili in Rubrica dallo stesso
utente. Nessun dato nuovo diventa visibile a chi prima non poteva vederlo in
altro modo.

**Resta da guardare.** L'indirizzo admin scritto a mano sopravvive in UPDATE e
DELETE (eredità della 0022): è un privilegio legato a una persona e non a un
ruolo, e andrebbe sostituito da un ruolo vero quando si toccherà la scrittura.

## 02/09/2026 — Piattaforma: il MITTENTE usciva al partner sulle vendite (#100791, segnalazione dell'utente, CHIUSA)

**Il buco.** La regola del 31/08 dice: sui servizi di tipo VENDITA il cliente
finale è di Deluxy e il partner non ne vede i dati. La mascheratura server
(`soloIMieiSoldi`) toglieva però solo i campi del DESTINATARIO: il MITTENTE
(`senderFirstName/LastName/Phone`) passava intero — sulla #100791 il partner
Lijoi vedeva «Nathan Stevens». Anche `smsPhoneNo` (il telefono del cliente
per gli SMS) non era nella lista.

**La toppa.** I quattro campi entrano nella stessa lista di cancellazione,
nello stesso ramo (vendita o `hideCustomerInfo`, con la deroga «consegna da
fornitore» invariata: chi consegna in proprio i dati li deve avere). Stessa
difesa, perimetro completato — nessuna regola nuova.

**Perché è sfuggito.** La verifica del 31/08 aveva provato i campi del
destinatario (che infatti lo screenshot mostra mascherati): il mittente non
era nella lista dei campi provati. Lezione già nota: la prova va fatta
sull'ELENCO COMPLETO dei campi personali del modello, non su quelli che la
regola nomina.

## 02/09/2026 — Piattaforma: dati del cliente al valet prima di «in consegna» (mittente, SMS, mappa) — CHIUSA

**La regola (utente, 02/09).** «Valet e team leader non vedono i dati del
cliente NEANCHE in tabella finché la consegna non è in consegna.»

**Cosa reggeva già.** Lista e dettaglio passavano da `soloIMieiSoldi`: nome,
telefono, email e citofono del DESTINATARIO nascosti fino a `in_delivery`
(regola 31/08, team leader compreso: è ruolo valet).

**I buchi.** ① La lista dei campi nascosti non copriva il MITTENTE
(`sender*`), il telefono degli SMS (`smsPhoneNo`) né l'anagrafica `customer`
collegata: dal dettaglio uscivano a qualunque stato. Stesso identico buco
chiuso il giorno prima sul lato partner: la prova si era fermata di nuovo ai
campi che la regola nominava. ② La MAPPA (`mapPoints`) era l'unica uscita che
mandava nome e cognome del destinatario SENZA passare dal filtro: li vedeva
il valet a ogni stato, e il partner anche sulle vendite.

**La toppa.** ① I quattro campi entrano nella lista mascherata fino a
«scoperto»; ② i punti della mappa passano da `soloIMieiSoldi` (col select
arricchito dei campi che servono al ramo partner). Gli INDIRIZZI restano
visibili al valet (precisazione 31/08: servono a pianificare il giro).

**Lezione, per la terza volta.** La prova di una mascheratura si fa
sull'ELENCO COMPLETO dei campi personali del modello E su TUTTE le uscite
(lista, dettaglio, mappa, calendario) — non sui campi e sulla rotta che la
regola nomina.


## 03/09/2026 — Piattaforma: rotta PUBBLICA `/api/province-cities/:code/:city` per i siti Shopify (rischio ACCETTATO)

**Perché nasce.** Il tema di deluxy.it chiama da sempre
`GET https://app.deluxy.it/api/province-cities/{PROV}/{Città}` (rotta del
legacy, spento il 31/08) e legge un booleano prima di mettere nel carrello i
prodotti non unici. Senza la rotta il preflight CORS falliva e il carrello
restava vuoto: dal 31/08 al 03/09 metà catalogo era invendibile.

**Che cosa apre.** Una rotta `@Public` in SOLA LETTURA che risponde `true`/
`false` (la città è fra quelle coperte della provincia). Nessun dato
personale, nessuna scrittura, nessuna credenziale. CORS: mai `*` — l'origin
si riflette solo se è nella lista dei siti Deluxy (`deluxy.it`,
`www.deluxy.it`, `deluxygifts.myshopify.com`, più `CORS_SITI_ORIGINS`);
`Vary: Origin` per la cache sul bordo. Esclusa da Swagger.

**Cosa può fare un ostile.** Enumerare le città coperte per provincia
(informazione già pubblica: il sito le mostra) e martellare la rotta: una
query per provincia + cache 60s/1h sul bordo Vercel. Rate limit non
previsto: da aggiungere se si vedesse abuso (punto aperto, non bloccante).

**Decisione.** Rischio accettato: è il ripristino di una superficie che
esisteva già nel legacy, ristretta (allowlist di origin, sola lettura,
booleano). Lezione: prima di spegnere un backend, censire chi lo chiama
anche FUORI dal repo.
