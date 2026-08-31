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
