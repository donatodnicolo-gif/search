# Il Libro della Sicurezza Deluxy

**Versione 1.0 — 27 agosto 2026**

Il canone della **sicurezza applicativa** di tutte le app Deluxy: autenticazione, sessioni, chiavi, autorizzazione, input, segreti, dati a riposo, webhook, header, database condiviso, mobile. D'ora in poi **ogni app attinge da qui per proteggersi**, e nessuna difesa nuova si inventa in casa quando ne esiste una standard.

**Perché esiste.** Le app Deluxy non sono isole: condividono **un solo cluster Postgres/Supabase**, si scambiano dati con **chiavi API a scope**, e un utente passa dall'una all'altra. La suite è sicura quanto la sua app più debole — una chiave larga, una funzione aperta ad `anon`, un fail-open contaminano tutte le altre. Questo Libro rende uniforme la difesa.

**Autorità.** I riferimenti mondiali (OWASP ASVS 5.0, API Security Top 10 2023, MASVS 2.1, Top 10 2021, Cheat Sheets; NIST SP 800-63B; RFC 9700) danno le regole; lo **Standard Deluxy §7** dà il contratto dati (ogni dato ha una casa sola, lettura via `/api/v1`, mai query su schemi altrui). Questo Libro dice **come si applicano nel parco Deluxy** e **quale implementazione fa da riferimento**. Su un pattern vince il Libro; su una regola generale vince lo standard/ASVS. Caso nuovo → agente **`architetto-sicurezza`** (`.claude/agents/architetto-sicurezza.md`): ricerca → verdetto → voce del Libro; una segnalazione o una toppa passa PRIMA dall'agente **`sicurezza-ostile`** (un falso allarme costa il doppio).

**Come è nato.** 27/08/2026: ricerca sui riferimenti mondiali + analisi di sicurezza del codice di 13 app (7 agenti) + giuria di 3 agenti (attaccante esterno · insider/minimo privilegio · mobile/dati-a-riposo/applicabilità) + **revisione ostile che ha verificato ogni buco e ogni toppa sul codice reale**: 11 accuse confermate, 5 ridimensionate (percorso non raggiungibile o gravità minore), correzioni integrate. Ogni regola cita la sua minaccia (chi/quale chiamata/quale dato) o il requisito ASVS/CWE.

---

## Le dodici leggi

Le regole su cui tutte le fonti convergono, che nessun capitolo può contraddire:

1. **Deny-by-default.** Si nega tutto; si permette per eccezione esplicita; si autorizza a **ogni oggetto** (BOLA) e **ogni funzione** (BFLA), non solo si autentica.
2. **L'identità e i permessi si verificano sul server dalla credenziale.** Mai da un campo del corpo, di un header o dell'URL.
3. **Le password solo con hash lento dedicato** (Argon2id, o scrypt/bcrypt coi parametri sotto) + sale. Mai in chiaro, mai cifrate reversibili, mai `sha256` generico.
4. **Password: lunghezza batte complessità.** Blocklist dei valori compromessi, nessuna rotazione periodica forzata.
5. **I segreti non stanno mai nel client, nel bundle o nel repo.** Solo backend/secret manager, con scope minimo, scadenza e revoca.
6. **TLS ovunque in transito, AEAD a riposo** per i dati sensibili. Niente algoritmi obsoleti.
7. **Sessioni con cookie HttpOnly+Secure+SameSite**, rigenerate al login, con timeout e **revoca reale lato server**.
8. **Validazione e binding a whitelist sul server**, in ingresso e in uscita — anti mass assignment ed eccessiva esposizione.
9. **Rate limiting** su login e API contro brute-force e DoS.
10. **OAuth/webhook: firma verificata** (PKCE+state per OAuth; HMAC per-payload per i webhook), **fail-closed**, confronto a tempo costante.
11. **Gli errori non rivelano nulla; i log registrano gli eventi di sicurezza ma mai segreti/PII.**
12. **Least privilege ovunque:** RLS con policy, `service_role`/secret solo backend, `anon`/PUBLIC revocati, colonne sensibili non selezionabili di default.

**E una legge di metodo (giurato 3):** una difesa che si accende con un flag dimenticabile è spenta; una difesa che, accesa a freddo, rompe la produzione, va **graduata** con il suo guardrail. Il fail-closed va con il check CI; la cifratura a riposo è una migrazione, non un flag; la CSP restrittiva si verifica sul preview.

---

## 1. Sessioni

**Il modello canonico** (riferimento: AI Mail `src/lib/auth.ts` + `sessione.ts`, Customer Service):

- Cookie **firmato HMAC-SHA256 con un segreto DEDICATO** (mai derivato dalla password), payload che include un **contatore di versione/generazione**; `HttpOnly` + `Secure` in produzione + `SameSite=Lax`.
- **Revoca reale**: la versione sta dentro la firma e viene **ricaricata dal DB** a ogni richiesta; cambio password e disattivazione la incrementano → i cookie vecchi muoiono. Un token firmato sul solo id utente **non si revoca** (CWE-613).
  - ⚠️ **La revoca vive in un choke-point Node richiamato da OGNI rotta dati** (es. `utenteCorrente()`), **mai al gate Edge**: sull'Edge Prisma non arriva, quindi il middleware verifica solo firma+scadenza. Una rotta che dimentica il controllo Node fa passare un cookie revocato ma ancora firmato. Su Vercel, spostare la validazione nel middleware «per prestazioni» **spegne la revoca in silenzio**.
- **Scadenza server-side reale** dentro il token (non solo `maxAge` del cookie). Durata: 30 giorni tollerati **solo** su app a basso rischio **con revoca attiva**; per HR, finanza e il portale → **assoluto ≤12h + idle 30min** (NIST 800-63B AAL2).
- **Confronto a tempo costante** su firma e password (`timingSafeEqual` + guardia di lunghezza). Il `===` su un segreto è un oracolo temporale (CWE-208).
- **Fail-closed in produzione**: se manca il segreto/la password, l'app risponde **503**, non apre. ⚠️ Si accende **INSIEME** al check CI «env critica presente in prod» (cap. 12): il 503 senza quel guardrail spegne un'app funzionante al primo deploy con una env dimenticata.

**Il modello vietato**: cookie = `SHA-256(prefisso + password)` (Finance, Acquisti) — non è una sessione, è il digest di una password scelta da una persona, **crackabile offline** e non revocabile se non cambiando la password (che espelle tutti). Da riscrivere.

**Adeguare**: Hub (revoca del ruolo), CRM (revoca), Anagrafiche/Tasks/Personale (revoca), Finance/Acquisti (riscrivere la sessione), Finance/Tasks/Acquisti (fail-closed — oggi **fail-OPEN**: se manca l'env trattano tutti come admin).

## 2. Password

- **Hashing**: **Argon2id** (m=19MiB, t=2, p=1 minimo; racc. m=64MiB, t=3) per le app nuove. **scrypt** (N=2^17) resta conforme dove già in uso (Hub/Mail/CS/search): **non si riscrive** senza una minaccia da fermare. **Vietato `sha256` generico** per le password (Finance/Acquisti/passcode search — da correggere). Sale unico per utente, confronto `timingSafeEqual`.
- **Regole NIST**: lunghezza > complessità, **blocklist** dei valori compromessi a ogni scelta, **nessuna rotazione forzata**, nessuna regola di composizione. Graduazione: blocklist + no-rotazione **subito** (costo zero); min 12 per le password di team già distribuite, **min 15 per gli utenti nuovi**.
- **Lockout/throttling sul login OBBLIGATORIO**, riferimento: piattaforma `auth.service.ts` — contatore **su DB** (non in-memory: su serverless multi-istanza l'in-memory non conta), **per-email E per-IP**, conteggio **prima** dell'hash, messaggio unico. Il Hub oggi è **pubblico senza alcun freno**: è credential-stuffing sull'email admin che apre la porta della suite.
- **Password di TEAM** (una password condivisa per tutti): tollerata solo come ripiego, **mai con ruolo admin implicito** (CRM dà admin a chiunque ha la password — viola BFLA), nessuna identità per-utente, nessuna revoca del singolo. Percorso verso l'identità per-utente via il meccanismo SSO (cap. 8).

**Adeguare**: Hub (lockout — priorità), Mail/CS/search (lockout, min password), CRM (togliere admin-per-tutti), tutte le team-password.

## 3. Chiavi API fra app

**Il formato canonico** (riferimento: piattaforma, Anagrafiche, Customer Service, Tasks, Personale):

- Nel DB **solo l'hash SHA-256** della chiave + un **prefisso in chiaro** per riconoscerla; il valore in chiaro si mostra **una volta sola** e **non si rilegge mai** dalla UI. Finance tiene la chiave **in chiaro nel DB e la ri-mostra nella pagina admin** — chi legge il DB condiviso o ha una sessione admin ruba la chiave che vale per 5 app.
- **SCOPE**: due assi **lettura/scrittura** come minimo; **scope per-rotta/per-risorsa** dove ci sono dati sensibili o denaro. Una chiave = una cosa (least privilege).
- **Regola dura: lo scope NON si deduce dal metodo HTTP.** Una GET che scrive è vietata. Finance viola: `PATCH /api/proforma` marca una pro-forma «fatturata» = **conferma un pagamento**, con la stessa chiave «di lettura verifica».
- **Scadenza + rotazione** obbligatorie, con **allarme «in scadenza fra X giorni»** (una scadenza a sorpresa rompe l'integrazione). Solo la piattaforma oggi ha la scadenza.
- **La chiave UNICA di Finance vale per 5 app**: si migra emettendo **N chiavi a scope**, una per app consumatrice, aggiornando i consumatori, **poi** revocando la vecchia — mai una scadenza secca su una chiave condivisa.

**Vietato il «chiamante che sceglie chi è»**: AI Mail ha **una chiave unica senza scope** con cui, via header `x-utente`, si legge la posta di chiunque e si invia a nome di chiunque (il codice stesso lo dichiara). Migrare a multi-chiave con scope.

**Adeguare**: Finance (in chiaro→hash+scope), Mail (unica→multi+scope), Tasks (scope per-sistema), Personale (scope «retribuzioni», cap. 4), piattaforma (scope per-rotta), Anagrafiche (scadenza).

## 4. Autorizzazione

- **Deny-by-default sul guard**: una rotta senza `@Roles`/scope **NEGA**. Il `RolesGuard` della piattaforma è **allow-by-default** (`if (!requiredRoles) return true`): una rotta nuova nasce aperta a **ogni autenticato** (non agli anonimi — il `JwtAuthGuard` gira prima; è debito latente, non una porta anonima). ⚠️ Invertire il default **a freddo** romperebbe `tracking/:token`, `delivered/:token`, `calculations/preview` che sono `@Public`: prima l'**audit delle rotte + i `@Public` espliciti**, poi il taglio.
- **BOLA/proprietà su ogni oggetto**, verificata **nel service**, non nel controller (riferimento: `roleFilter` della piattaforma, che «elenca chi vede tutto e NEGA di default»). Tasks `/api/interno/tasks/:id` PATCH modifica **qualsiasi task** senza controllo di proprietà: un utente qualsiasi con sessione tocca le task di chiunque (CWE-639).
- **Il ruolo si verifica anche sulle LETTURE sensibili, non solo sulle scritture.** Le letture protette quanto le scritture (BFLA).
- **I dati retributivi hanno uno scope dedicato.** Il flag `?compensi=1` di Personale è una **vera barriera server** (i campi non vengono neppure serializzati) ma **senza privilegio**: **qualsiasi chiave, anche di sola lettura, + `?compensi=1` = tutti gli stipendi**. Serve uno scope `retribuzioni` esplicito, o 403. *(Questo è il buco raggiungibile di Personale. Il gate di ruolo mancante sull'UI di `/stipendi` è invece **debito latente**: oggi non esiste un emettitore SSO nel parco e il login a password dà ruolo admin, quindi nessun «non-admin» arriva lì — ma va gated **prima** di introdurre un SSO che conii token non-admin.)*

**Adeguare**: piattaforma (guard), Tasks (proprietà + scope), Hub (matcher `/api`), Personale (scope retributivo; poi gate UI).

## 5. Il chiamante non dichiara chi è

**Regola dura del Libro** (CWE-290): identità e ruolo vengono **dalla credenziale verificata**, mai da un campo del corpo/header/URL.

- **Acquisti**: l'approvatore è preso da `ioEmail`, un campo `hidden` del form salvato nel browser → un membro del team **falsifica `ioEmail`** e **approva le proprie richieste** (segregation of duties annullata). Fix: derivare l'approvatore dalla **sessione firmata per-utente** (che oggi non esiste — dipende dal cap. 1).
- **Tasks**: `sistema`/`attore` presi dal body → spoofing d'origine + callback verso il sistema falsificato. Fix: `sistema` dallo **scope della chiave**, non dal corpo.

La piattaforma è il modello conforme: per il PARTNER il `partnerId` è **forzato al proprio**, ignorando quello del corpo.

## 6. Input e transizioni di stato

- **Whitelist DTO + `forbidNonWhitelisted` + bind esplicito** dei campi protetti (`price`/`status`/`role`/`stato`). La whitelist scarta gli **estranei** ma **non** protegge i campi legittimi-ma-privilegiati (CWE-915). Riferimento: `senzaCampiDiUfficio` della piattaforma (rimuove per il ruolo PARTNER prezzi/paghe/stato, su create+update+risposte, riassegnando il dto). Acquisti accetta `body.stato` → crea un acquisto già «pagato». La piattaforma ha whitelist ma **manca `forbidNonWhitelisted`** (scarta in silenzio, cieco agli audit).
- **Macchina a stati** sulle transizioni con **denaro/approvazione** (bozza→fatturata, inviata→approvata→pagato): la transizione arbitraria è frode. Acquisti mette qualsiasi stato senza validare.

**Adeguare**: Acquisti, piattaforma (`forbidNonWhitelisted`), Finance (proforma), Tasks.

## 7. Webhook e ingressi esterni

**Il canone** (riferimento: Customer Service, webhook Meta):

- **HMAC per-payload verificato sul corpo grezzo**, **FAIL-CLOSED**, confronto a tempo costante, **anti-replay** (timestamp). Doppio segreto dove servono due mittenti (FB+IG). Non fidarsi di campi non firmati del corpo.
- ⚠️ **Il flag facoltativo che ACCENDE la verifica è VIETATO**: `if (process.env.SECRET) { verifica }` significa che **se il segreto manca la verifica salta** — la difesa è spenta per dimenticanza. La verifica è attiva **per costruzione**; se il segreto manca l'endpoint risponde 503, non «ok».
- **I dati da un canale esterno (Shopify/WhatsApp) sono NON FIDATI anche per lo smistamento**, non solo per l'HTML. L'escape XSS non copre l'integrità del contenuto operativo (indirizzo, telefono, importo, foto).

**Il caso search-supplier** (il rischio esterno n.1 del parco): un ordine falso iniettato nella cache KV via webhook viene poi **servito all'operatore come dato autorevole** (`order.js` legge la KV **prima** di Shopify) e **smistato a un fornitore reale** con indirizzo/telefono/importo/foto/bigliettino falsificati. ⚠️ **Correzione precisa**: sul branch `main` (da cui l'app si pubblica) l'HMAC Shopify **esiste già** (`verificaOrigine`, HMAC-SHA256, `timingSafeEqual`); il difetto è il fallback `if (!enforce) return { ok: true }` + il segreto **non impostato su Vercel**. Il fix è **settare `SHOPIFY_WEBHOOK_SECRET` + togliere il fallback**, nello **stesso** deploy — **non** «riscrivere l'HMAC» (rischio di riscrivere codice esistente).

**Adeguare**: search-supplier (segreto + togliere il fallback), piattaforma (webhook Woo senza HMAC, chiave in chiaro), Finance (webhook fatture, confronto non costante).

## 8. SSO, OAuth e la cassaforte del Hub

- **Il Hub è un launcher + un dispenser di segreti, NON un Identity Provider.** Non emette token SSO consumati dalle altre app: apre le app con URL nudi in una nuova scheda, e ogni app autentica per conto suo. Costruire un IdP OIDC completo è sproporzionato per un parco a fiducia interna. Si **canonizza il meccanismo esistente** `HUB_SSO_SECRET` (token cifrato AES-256-GCM con `exp` + verifica dell'app destinataria `app==="x"`, usato da Mail/CRM/Personale/Tasks), fissandone alg, `exp` breve e verifica dell'app.
- **La cassaforte `/api/keys` (rischio insider):** oggi **un solo `HUB_KEYS_TOKEN` legge QUALSIASI chiave del caveau, in chiaro, senza scope per-app** — un'app compromessa (o il token trapelato) chiede `HUBKEY_ANAGRAFICHE` e ottiene la **chiave di scrittura del registro**. *(Insider/post-compromise, non anonimo: serve già possedere `HUB_KEYS_TOKEN`, un segreto server-to-server. È il privilegio che, da solo, contamina tutta la suite.)* Fix: **scope per-app** sulla cassaforte (subito, è controllo) + **cifratura a riposo** dei valori (migrazione, cap. 11).
- **Token di conferma ≠ token di monitoraggio.** La piattaforma usa lo **stesso** `trackingToken` per il link di monitoraggio e per `POST delivered/:token`: chi ha il link di monitoraggio può marcare «consegnata» in anticipo (scatta paga valet + notifiche). *(Gravità bassa: token 192 bit non indovinabile, l'attaccante è il destinatario che possiede già il link, e la guardia sugli stati chiusi è già presente.)* Fix: token di conferma **separato**, affiancato a quello di monitoraggio — **senza** rompere i link già emessi.
- **Segreti mai in query string** (search-supplier passa `?pass=` il passcode admin → finisce in log/Referer/cronologia). **State OAuth validato** (search non lo valida; oggi mitigato dall'HMAC Shopify, ma è difesa in profondità).

**Adeguare**: Hub (cassaforte), piattaforma (token), search-supplier (`?pass=`, state).

## 9. Header di sicurezza

**Il set completo obbligatorio a tutte** (riferimento: piattaforma `vercel.json`, Anagrafiche, Customer Service): CSP con `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy`, + **HSTS** (`max-age` lungo; manca perfino nella piattaforma — difesa in profondità, priorità bassa).

- Oggi **8 app hanno `next.config` vuoto** (Hub, Finance, Mail, CRM, Tasks, Fondo, Personale, Acquisti): `/login` inquadrabile in iframe (clickjacking) su app che custodiscono accesso/IBAN/stipendi; niente `nosniff` amplifica l'XSS-da-allegato di Mail (cap. 10).
- **Graduazione**: gli header semplici (X-Frame, nosniff, Referrer, Permissions, HSTS) **subito ovunque**; la **CSP restrittiva** con nonce **graduata e verificata sul preview** — Next senza `unsafe-inline` può non idratare (la build passa e il login resta morto).
- Metterli nel **`next.config`/middleware dell'app**, non solo in `vercel.json` (che sparisce in un deploy non-Vercel).

## 10. Servire file e allegati

**Il canone** (riferimento: Customer Service `/api/media`): **whitelist dei tipi apribili + `nosniff` SEMPRE + `Content-Disposition: attachment`** (inline solo se il tipo è nella whitelist) + **passare dall'oggetto-padre**, non dall'id diretto (per non far indovinare la foto di un altro).

AI Mail serve l'allegato **col Content-Type scelto dal mittente**, senza `nosniff` né whitelist, con la sola difesa del `Content-Disposition: attachment` e un `next.config` vuoto: un mittente esterno pianta un allegato HTML/SVG che, aperto inline, **esegue nel dominio della posta** (XSS → esfiltra cookie/posta). È la stessa lezione che Customer Service ha già applicato. **Adeguare**: Mail.

## 11. Dati sensibili a riposo

Il cluster Postgres è **condiviso da 14 app**: chi ha un piede nel DB (un'app compromessa, la stringa di connessione) legge in chiaro ciò che non è protetto.

- **Il gating d'accesso è il primo presidio, la cifratura il secondo** — si sommano, non si sostituiscono.
- **Colonne sensibili non selezionabili di default** (riferimento: Scout migrazione 0085 — `REVOKE SELECT` sulla tabella + `GRANT SELECT (colonne sicure)`): la difesa a costo più basso (DDL, non tocca i dati), **subito**. Verificare che le app che oggi fanno `SELECT *` passino dalla via prevista, o le si rompe.
- **Cifratura AEAD a riposo** (AES-256-GCM) per IBAN/dati carta; per gli stipendi la priorità è il gating. ⚠️ **È una MIGRAZIONE, non un flag**: chiave in **KMS versionata, FUORI dal DB**, **separata dalla firma-sessione** (trappola Mail: `APP_SECRET` firma la sessione **e** cifra le password → ruotarlo resetta tutto); ruotare la chiave senza ri-cifrare rende **illeggibile il pregresso**.
- **I segreti d'integrazione cifrati a riposo**: Finance tiene `fic.clientSecret/accessToken/refreshToken`, `qonto.secretKey`, `smtp.pass`, `api.verificheKey` **in chiaro** in `Impostazione.valore` — chi legge quella tabella prende le chiavi di tutti i sistemi collegati. Cifrare come Mail fa per le password IMAP/SMTP (AES-256-GCM), con chiave separata.

**Adeguare**: Finance (IBAN + segreti), Anagrafiche (IBAN/PEC/SDI/CF), Personale (RAL/netto/contributi). Prima il gating (subito), poi la cifratura (progetto).

## 12. Database condiviso, RLS, funzioni

- **RLS su ogni tabella esposta** via PostgREST, con policy esplicite. ⚠️ **RLS ON senza policy nega tutto**: verificare tabella per tabella, o si rompe l'app.
- **REVOKE da `anon` E `public`** (non solo `public`): su Supabase ogni funzione **nasce eseguibile da `anon`**, e `REVOKE ... FROM PUBLIC` **non tocca `anon`** (CWE-732). Modello di riferimento: Scout 0085 — `revoke execute from public, anon` + `grant to authenticated` + **guardia `auth.uid()` in-corpo** + `security definer set search_path`.
- **Ogni dato una casa sola, mai query cross-schema**: si legge via API a scope. Tasks fa `$queryRaw` su `hub."Utente"` (viola il contratto e scavalca scope/revoche del proprietario); Personale è virtuoso (via HTTP).
- **La RLS «piatta» (`using(true)` a `authenticated`)** di Scout è accettabile **solo** a condizione che **email-signup e anonymous sign-in siano SPENTI** sul progetto Supabase: se un estraneo ottenesse un JWT `authenticated`, il modello piatto crollerebbe. È una **precondizione da verificare e monitorare**, non da assumere.

**Adeguare**: tutte le app con tabelle/funzioni Supabase (verifica RLS+revoke); Tasks (cross-schema); Scout (verificare la config signup/anon).

## 13. Mobile (Scout e ogni futura app RN)

- **`SecureStore` (Keychain/Keystore) obbligatorio per i token**; **coda offline cifrata e minimizzata**. Oggi access+refresh token e la coda di visite con PII stanno in **AsyncStorage in chiaro**: su device rooted o da backup si legge il `refresh_token` e si **reimpersona il venditore** fino a revoca (CWE-312, MASVS-STORAGE). ⚠️ Migrazione: la sessione già sui device si sposta al primo avvio o si forza il re-login.
- **Nessun segreto server nel bundle** (già ok: solo `EXPO_PUBLIC_*`, chiave Supabase *publishable*, token HubSpot dietro proxy). La **chiave Maps** è inevitabilmente nel bundle → si **restringe** in console per bundle id/SHA-1 + API, non si nasconde. Il **PAT `sbp_`** (potentissimo) **non** sta nello stesso `.env` dell'app.
- **Pinning**: difesa in profondità **opzionale**, solo sui canali ad alto valore — costo operativo alto, sproporzionato senza dati di pagamento.
- **Bucket foto privato + signed URL** con scadenza (un URL pubblico non scade mai, anche dopo la revoca dell'utente); se è una vetrina volutamente pubblica, **dichiarare** che non contiene PII.

## 14. Rate limiting, logging, monitoraggio

- **Rate limit oltre il login**: webhook, `/api/v1`, endpoint AI a pagamento. Su serverless **su DB o Vercel Firewall, mai in-memory** (il rate-limit widget di CS è per-istanza; l'invio di Mail e il flooding OpenAI di Acquisti/CS sono DoS economico senza freno).
- **Logging degli eventi di sicurezza**: login riusciti/falliti, accessi negati, cambi ruolo, uso di funzioni admin, uso delle chiavi (per **id**, non valore). Append-only. **Mai** password/token/chiavi/PII; **mascherare per FORMA, non per nome** (o un segreto con un nome imprevisto finisce nel log). Registro chiamate API come canone (Mail/piattaforma/Anagrafiche già lo fanno).
- **Errori generici** che non rivelano; chiudere la **user-enumeration via timing** del Hub (esegue `scrypt` solo se l'email è valida → oracolo temporale: eseguire sempre un hash fittizio).
- **Alert** su picchi di 401/403 e uso anomalo delle chiavi.

## 15. Fondo pubblico

**Priorità alta.** Fondo **non ha alcuna autenticazione applicativa**: nessun middleware, nessun cookie, `next.config` vuoto — ed espone `/portafoglio` (posizioni d'investimento **reali**: titolo, quantità, prezzo di carico, ISIN) e `/ceo`. «Solo admin» **non è nel codice**. Chiunque conosca l'URL vede tutto. Fix: **introdurre l'auth** — SSO dal Hub (meccanismo AES-GCM canonico, basso costo, nessuna migrazione dati) o password fail-closed. La Deployment Protection di Vercel **non è accettabile come unica difesa finché non è confermata attiva** (non verificabile dal codice).

## 16. Governance della sicurezza

- **Check in CI** (come il Libro UX): `npm audit`; header presenti; `.env` non committato; **nessun segreto nel bundle** (grep `sk-`/`sb_secret`/`service_role`/`sbp_`/chiavi private/`IBAN`); **env critiche presenti in prod** (è ciò che rende sostenibile il fail-closed dei cap. 1 e 7).
- **Un caso nuovo** lo decide l'agente **`architetto-sicurezza`**; una segnalazione o una **toppa** passa PRIMA dall'agente **`sicurezza-ostile`** — la correzione si smonta come il difetto (nell'audit 27/08, 5 toppe su 11 furono bocciate; in questa revisione 5 accuse su 16 sono state ridimensionate perché il percorso non era raggiungibile).
- **Ogni difesa documentata con la minaccia + la data** (come i commenti datati 27/08): senza la minaccia citata è un irrigidimento, e il prossimo che passa la rimuove non capendone il perché.
- **Registro delle segnalazioni + custode** (cap. successivo): un esito che vive solo in un commit non è monitorato.
- ⚠️ Questo file esiste in DUE copie (repo `app/` e `scoutwt/`, quest'ultimo **pubblico** — attenzione a cosa vi si cita): a ogni bump si allineano entrambe.

---

## Appendice A — Difese di riferimento (dove si copia)

| Difesa | Riferimento |
|---|---|
| Sessione HMAC con revoca per-versione | AI Mail `src/lib/auth.ts` + `sessione.ts`; Customer Service |
| Fail-closed in produzione (503) | Personale/Anagrafiche/CRM `middleware.ts` |
| Lockout login su DB per-email/per-IP | piattaforma `auth.service.ts` |
| Chiave API hash+prefisso+scope | Customer Service / Anagrafiche `lib/api-auth.ts` |
| Scope a due assi, non dedotto dal metodo | Anagrafiche `lib/chiavi.ts` |
| Deny-by-default nel service (proprietà) | piattaforma `deliveries.service.ts` (`roleFilter`, `senzaCampiDiUfficio`) |
| Identità forzata dalla credenziale | piattaforma (`partnerId` forzato al proprio) |
| Webhook HMAC fail-closed + doppio segreto | Customer Service `webhooks/meta/route.ts` |
| SSO cifrato AES-GCM con exp + app | CRM/Personale `lib/sso.ts` |
| Servire allegati (whitelist+nosniff+attachment) | Customer Service `api/media/[id]/route.ts` |
| Header di sicurezza completi | piattaforma `vercel.json` / Anagrafiche `next.config.ts` |
| Segreti cifrati a riposo AES-GCM | AI Mail `lib/crypto.ts` (password caselle) |
| RLS + revoke da anon E public + guardia | Scout migrazione `0085` |
| SecureStore / segreti fuori dal bundle | (target Scout) / Scout `app.config.ts` (EXPO_PUBLIC only) |

## Appendice B — Piano di rimedio (per rischio)

**Perimetro esterno — sfruttabile da un anonimo, prima di tutto:**
1. **search-supplier webhook**: settare `SHOPIFY_WEBHOOK_SECRET` su Vercel (main) + togliere il fallback `if(!enforce) return {ok:true}`. (Anonimo → ordine falso smistato al fornitore.)
2. **Fondo**: introdurre l'auth (SSO Hub o password fail-closed); intanto confermare/attivare la Deployment Protection Vercel. (Anonimo → portafoglio reale.)

**Fail-open — esposizione totale al primo deploy con env mancante, fix a costo minimo:**
3. **Finance/Tasks/Acquisti**: fail-closed 503 + check CI «env presente in prod».

**Privilegi interni (insider / chiave / minimo privilegio):**
4. **Cassaforte Hub**: scope per-app (un token = tutto il caveau → chiave di scrittura di Anagrafiche).
5. **Finance chiave unica**: hash + scope, GET non scrive, migrare i 5 consumatori, poi revocare.
6. **Personale**: scope `retribuzioni` sull'API (`?compensi=1` oggi su qualsiasi chiave).
7. **Identità auto-dichiarata**: Acquisti (approvatore dalla sessione, non da `ioEmail`), Tasks (`sistema` dallo scope).
8. **Tasks `/api/interno`**: controllo di proprietà; **CRM**: revoca sessione + niente admin-per-tutti.
9. **Hub**: lockout sul login + hash fittizio contro l'enumeration via timing.

**Igiene diffusa (subito, basso rischio di rottura):**
10. Header semplici (X-Frame/nosniff/Referrer/Permissions/HSTS) nelle 8 app con `next.config` vuoto; CSP restrittiva graduata con nonce.
11. **Mail**: allegati con whitelist+nosniff (modello CS).
12. **Scout**: SecureStore per i token, coda cifrata, Maps ristretta, PAT fuori dal `.env`; verificare signup/anon OFF su Supabase.

**Dati a riposo (progetto, con migrazione):**
13. Gating d'accesso (colonne non selezionabili) **subito**; cifratura AEAD di IBAN/stipendi/segreti d'integrazione **come progetto**, con chiave KMS versionata separata dalla firma-sessione.

*Ogni tappa passa dall'agente `sicurezza-ostile` prima di correggere, cita la minaccia + la data nel commit, e aggiorna il registro delle segnalazioni.*
