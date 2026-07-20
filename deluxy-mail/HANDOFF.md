# AI Mail 2.0 (deluxy-mail) — Handoff tecnico

> Documento di ripartenza. Aggiornato: **20 luglio 2026**.
> Leggi anche `CLAUDE.md` alla radice del repo e il design system in `deluxy-design-system/`.

---

## 1. Cos'è e stato del prodotto

Client di posta aziendale **AI-first** per Deluxy (consegne di fiori di lusso a Milano). Legge la posta via IMAP, la smista, la traduce, la riassume, crea attività e prepara bozze di risposta con l'AI (OpenAI).

**Stato: in PRODUZIONE.** Multi-utente, live e usato.

- **URL produzione:** https://deluxy-mail.vercel.app
- **Hosting:** Vercel (team `deluxy`, progetto `deluxy-mail`).
- **DB:** Supabase Postgres (progetto `sxovckndpmdbqfrfkxhl`).
- **Porta locale:** 3070.

---

## 2. Stack

- **Next.js 15** (App Router, Server Components, Server Actions), **React 19**, TypeScript.
- **Prisma 6** + **PostgreSQL**.
- **OpenAI SDK** (modello `gpt-4o-mini`, chiamate con `response_format: json_schema` strict).
- **imapflow** (lettura IMAP), **nodemailer** + MailComposer (invio SMTP, copia in "Inviata" via IMAP APPEND).
- Design system Apple-style (token in `src/app/globals.css` + `deluxy-design-system/`), oro `#B8963E` come accento.

---

## 3. Come far ripartire

### Locale
```
cd deluxy-mail
npm install
# il DB locale è il Postgres di sviluppo di Prisma:
npx prisma dev            # avvia Postgres locale (porta dinamica ~51214)
# .env.local punta a quella porta (DATABASE_URL/DIRECT_URL)
npm run dev               # Next su http://localhost:3070
```
⚠️ **Il Postgres locale di `prisma dev` è CRONICAMENTE INSTABILE**: cade sotto carico (specie se uno script e il dev server accedono insieme), cambia porta a ogni riavvio, e le DDL via proxy falliscono in modo intermittente. Per applicare schema/seed in locale conviene il driver `pg` grezzo (protocollo semplice) invece di Prisma. Aspettati di doverlo riavviare spesso.

### Variabili d'ambiente (`.env` / Vercel)
- `DATABASE_URL` (pooler pgbouncer 6543), `DIRECT_URL` (5432).
- `OPENAI_API_KEY` (chiave `sk-proj-…`), `OPENAI_MODEL` (`gpt-4o-mini`).
- `APP_SECRET` (firma cookie sessione, HMAC).
- `APP_PASSWORD` (legacy), `CRON_SECRET` (cron `/api/sync`).
- **APP DELUXY** (pannello verso le altre app): `ANAGRAFICHE_API_KEY` (chiave di **scrittura** — si genera in deluxy-anagrafiche con `npm run chiave -- deluxy-mail --scrittura`), `FINANCE_API_KEY` (la chiave `api.verificheKey` di deluxy-partner). Opzionali `ANAGRAFICHE_URL` / `FINANCE_URL` (default: gli URL Vercel di produzione). **Senza chiave la carta dell'app compare "da collegare"** e l'invio è bloccato con messaggio chiaro.
- ⚠️ `TZ` è **riservato** su Vercel: il fuso è forzato nel codice (vedi §9).

### Deploy
```
cd deluxy-mail
npx vercel --prod
```
Il build gira `prisma generate && node scripts/migrate-prod.mjs && next build`.
- `scripts/migrate-prod.mjs` applica **automaticamente** le migrazioni idempotenti (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) usando `DATABASE_URL`. È **non bloccante**: se il DB non risponde, il deploy non fallisce.
- **Quindi: aggiungendo tabelle/colonne allo schema, aggiungi la DDL idempotente anche in `migrate-prod.mjs`.** Non si usa `prisma migrate deploy` (l'host diretto Supabase è solo IPv6, irraggiungibile da build/CLI).

⚠️ **Non posso modificare i segreti Vercel** (guard di sicurezza): chiavi API/env sensibili le imposta l'utente dal dashboard Vercel. Il limite Hobby è **100 deploy/giorno per account**.

---

## 4. Modello dati (Prisma, `prisma/schema.prisma`)

Ogni tabella dati ha `utenteId` → **isolamento multi-utente** (ogni query è filtrata per utente). Password IMAP/SMTP cifrate (AES-256-GCM). Password utenti hashate (scrypt).

- **Utente** — email, nome, passwordHash, ruolo (`admin`/`utente`), firma, `traduzioneAuto`, `lingueLette`, attivo.
- **Account** — casella IMAP/SMTP (host/porte/utente/password cifrate), `ultimoUid`/`primoUid`/`storicoFinito`, `cartellaInviata`.
- **Sezione** — colonne in cui l'AI allinea la posta (nome, descrizione, colore, ordine). Unica `[utenteId, nome]`. La sezione **SPAM** viene creata da sola (vedi §7).
- **Regola** — condizioni (`seMittente`/`seOggetto`/`seContiene`), `istruzioneAI`, `attivitaTesto` (attività su misura da creare), sezione, flag (`creaAttivita`, `creaBozza`, `segnaLetta`, `archivia`, `fermaQui`), `priorita`.
- **Messaggio** — uid, messageId, `thread` (radice della catena di risposte), `direzione` (`entrata`/`uscita`), mittente/destinatari, oggetto, data, corpoTesto/corpoHtml, `letto`/`archiviato`/`cestinato`, `sezioneId`/`smistatoDa` (`manuale`/`regola`/`ai`/`spam`), `priorita`/`prioritaDa`, `riassunto`, `serveRisposta`, `analizzatoIl`, `lingua`/`corpoTradotto`.
- **Attivita** — titolo, dettaglio, scadenza, priorita, fatta, `creataDaAI`, link a `messaggio` o `contattoEmail`.
- **Bozza** — risposta non inviata (origine `ai`/`utente`, modo, a/cc/oggetto/corpo, `inviata`).
- **RiassuntoContatto** — quadro AI di un contatto (situazione, taskAperti). Unica `[utenteId, email]`.
- **RapportoAI** + **PropostaArchivio** — risultato dell'Assistente periodico (oggi/settimana/mese).
- **RiassuntoThread** — riassunto "per punti di vista" di una conversazione. Chiave `[utenteId, chiave]` dove `chiave` = id del messaggio capostipite del thread.
- **ContattoAI** — il "PLUS AI": presenza della riga = contatto seguito dall'AI (entra nella AI Inbox). Campo `istruzioni` = istruzioni AI per quel contatto.
- **IstruzioneThread** — istruzioni AI per una conversazione. Chiave `[utenteId, chiave]` (stessa chiave del RiassuntoThread).
- **Impostazione** — preferenze GLOBALI condivise (es. contesto aziendale dato all'AI).

---

## 5. Moduli `src/lib/` (le funzioni chiave)

- **db.ts** — singleton Prisma.
- **auth.ts** — sessione firmata edge-safe (Web Crypto HMAC): `creaSessione`, `verificaSessione`, `SESSION_COOKIE`. Usata dal `middleware.ts` (cancello di accesso).
- **password.ts** — `hashPassword`/`verificaPassword` (scrypt "salt.hash", solo Node).
- **sessione.ts** — `utenteCorrente()`, `richiediUtente()` (redirect a /login), `richiediAdmin()`.
- **crypto.ts** — `cifra`/`decifra` (AES-256-GCM) per le password IMAP/SMTP.
- **imap.ts** — basso livello IMAP/SMTP: `scaricaNuovi`, `scaricaVecchi`, `salvaInInviata`, `trovaCartellaInviata`, parsing; `ripulisciPerDatabase` (toglie i null byte che bloccherebbero il salvataggio).
- **sync.ts** — orchestrazione. Funzioni principali:
  - `sincronizzaAccount` / `sincronizzaUtente` / `sincronizzaTutti` — scarico IMAP + `salvaMessaggi`.
  - `salvaMessaggi` — salva i nuovi messaggi, applica le **regole** deterministiche, **traduce** se serve, **filtra lo SPAM** all'arrivo, crea le **attività definite dalle regole**.
  - `analizzaMessaggioOra` — analisi AI di un messaggio (sezione, riassunto, attività, bozza). Rispetta `smistatoDa` (`manuale`/`regola`/`spam` non vengono spostati dall'AI).
  - `analizzaContattoOra` / `leggiQuadroContatto` — quadro AI del contatto.
  - `messaggiThread` / `riassumiThreadOra` / `leggiRiassuntoThread` — conversazioni + riassunto per punti di vista.
  - `preparaEsecuzione` — l'AI scrive la mail che porta a termine un'attività.
  - `assicuraSezioneSpam` — crea la sezione SPAM se manca.
  - `istruzioniMirate` — raccoglie le istruzioni AI del **contatto** e del **thread** (precedenza **thread > contatto > globale**).
  - `traduciMessaggioSeServe`.
- **ai.ts** — chiamate OpenAI (tutte con json_schema strict; client con **key ripulita da spazi/a-capo**, timeout 45s, maxRetries 2):
  - `analizzaMessaggio` (analisi completa), `riassumiContatto`, `riassumiThread`, `scriviRisposta`, `pianificaAttivita` (comando in linguaggio naturale → attività), `pianificaConProposta` (come sopra ma aggancia un contatto CONOSCIUTO alle attività e formula la proposta di azione che l'AI può intraprendere), `giudicaSpam`, `rilevaETraduci` + `traduciVerso` (traduzione), `triageLotto` + `sintetizzaPeriodo` (Assistente map-reduce). Tutte le funzioni AI accettano `istruzioni?: string[]` (le istruzioni mirate).
- **regole.ts** — `applicaRegole(regole, msg)` → `EsitoRegole` (sezione, letta, archivia, `istruzioniAI[]`, `attivitaDaCreare[]`).
- **thread.ts** — raggruppamento in conversazioni (union-find su radice della catena + oggetto normalizzato): `raggruppa`, `normalizzaOggetto`, `chiaveThread`.
- **spam.ts** — `valutaSpam(msg, ctx)` → livello `basso`/`medio`/`alto` a punteggio (frasi tipiche, spoofing marchi, link IP/accorciati, maiuscolo…). Whitelist forte: contatto noto / dominio proprio / contatto AI = mai spam.
- **contattiAI.ts** — `emailContattiAI`, `eContattoAI`, `datiContattoAI` (letture difensive: se la tabella manca degradano a vuoto).
- **impostazioni.ts** — `CHIAVI`, `leggiImpostazioni`, `scriviImpostazione`.
- **format.ts** — `FUSO='Europe/Rome'`, `dataBreve`/`dataLunga` (fuso forzato), `PRIORITA`/`CODICI_PRIORITA`.
- **assistente.ts** — Assistente periodico (conta + triage a lotti + sintesi).
- **sanitizzaHtml.ts** — pulizia HTML delle mail (mostrate in iframe sandboxed).

---

## 6. "API" dell'app = Server Actions (`src/lib/actions.ts`)

Tutte scoped per utente via `uid()`. Le principali:

- **Posta/priorità:** `impostaPriorita` (setta priorità + lancia analisi AI; **non lancia mai** errori al client, torna sempre `{ok, messaggio}`), `rianalizza`.
- **Invio:** `inviaMessaggio`, `inviaNuovaMail` (mail scritta da zero dalla pagina `/scrivi`: nessun originale, apre una conversazione nuova), `inviaBozza`, `salvaMinuta` (con `modo='nuova'` e senza `messaggioId` per le mail da zero), `salvaBozza` (invio via SMTP + copia in Inviata + traduzione se la mail originale è straniera).
- **Contatti/AI:** `analizzaContatto`, `cambiaContattoAI` (PLUS AI on/off), `salvaIstruzioniContatto`, `salvaIstruzioniThread`, `riassumiConversazione`.
- **Attività:** `eseguiAttivita` (AI scrive la mail), `creaAttivitaManuale` (attività tua, opzionale contatto → eseguibile dall'AI), `attivitaDaComando` (comando NL → attività via `pianificaAttivita`), `creaAttivitaConProposta` (il dialogo "Nuova attività" della posta: crea le attività, aggancia solo contatti realmente conosciuti — i mittenti recenti — e torna `proposta` + `eseguibileId` per il tasto "Procedi"), `eliminaAttivita`, toggle "fatta".
- **Regole:** `creaRegola` (con **retrodata**: applica subito le parti deterministiche allo storico via `retrodataRegola`), `attivaRegola`, `eliminaRegola`.
- **Assistente:** `contaPeriodoAI`, `avviaAssistenteAI`.
- **Sync/account/impostazioni:** `sincronizzaOra`, `scaricaStorico`, `creaAccount`, `salvaImpostazioni`.
- **Utenti (auth-actions.ts):** `accedi`, `creaPrimoAdmin`, `esci`, `creaUtente`, `cambiaStatoUtente`, `reimpostaPassword`, `eliminaUtente`, `salvaFirma`.

Cron: **`/api/sync`** (route, autenticata con `CRON_SECRET`) — su Vercel Hobby può girare **1 volta al giorno** (`vercel.json`). L'auto-refresh a 30s è **client-side** (SyncButton), gira solo con la app aperta e in primo piano.

**`maxDuration = 60`** è impostato sulle pagine che scatenano l'AI (`/`, `/messaggio/[id]`, `/rubrica/[email]`, `/assistente/[id]`) — necessario perché le Server Action NON ereditano il maxDuration del layout, e a 10s (default Vercel) l'analisi AI verrebbe uccisa a metà.

---

## 7. Funzionalità implementate

- **Lettura IMAP** + scarico storico progressivo; invio SMTP con copia in "Inviata".
- **Sezioni** configurabili + **Regole** (deterministiche e/o con istruzione AI) con **retrodatazione** allo storico e **attività su misura**.
- **Priorità P0–P3** su ogni mail → scatena l'analisi AI (riassunto + attività + bozza + smistamento in sezione).
- **Traduzione automatica**: mail in lingua straniera tradotte in italiano (all'arrivo e all'apertura); risposte scritte in italiano e inviate nella lingua originale. Configurabile (`lingueLette`).
- **Conversazioni (thread)**: raggruppamento per catena di risposte e per oggetto (anche con destinatari/oggetti diversi); **riassunto "per punti di vista"** che spiega la posizione di ogni parte.
- **Rubrica** con quadro AI del contatto (mail ricevute+inviate → prossime attività).
- **PLUS AI** sui contatti + **AI Inbox** (vista dedicata) vs **Tutte** (predefinita). SPAM escluso dalla posta in arrivo.
- **Istruzioni AI mirate** per **contatto** e per **conversazione** (precedenza thread > contatto > globale), applicate a tutte le chiamate AI. Fidate, separate dal corpo mail.
- **Attività**: create dall'AI, **a mano**, o da **comando in linguaggio naturale**; tutte eseguibili dall'AI (scrive la mail).
- **APP DELUXY** (20 lug): pannello a destra della posta con una carta per funzione delle altre app — oggi **Anagrafiche → Registra contatto** (POST /api/v1/partners), **Finance → Crea proforma** (POST /api/proforma), **Finance → Verifica partner** (GET /api/verifiche). **Drag & drop** di una mail su una carta (o sulla carta "Automatico", dove decidono le **Regole APP DELUXY** in /regole: condizioni esatte + nota per l'AI + priorità); su **mobile** il bottone **"→ App"** su ogni riga. Flusso: l'AI estrae i dati dalla mail (json_schema strict, `estraiDatiAzione`; corpo non fidato, mai inventare) → l'utente li vede in un JSON modificabile e **conferma** → chiamata HTTP vera → esito + storico in `InvioApp`. Catalogo e client HTTP in `src/lib/appDeluxy.ts` (per aggiungere un'azione si aggiunge lì: schema, guida, esegui).
- **Tasti "Nuova mail" e "Nuova attività"** in testa alla posta (20 lug): "Nuova mail" apre `/scrivi` (mail da zero, conversazione nuova, bozze riprendibili con badge "nuova mail"); "Nuova attività" apre il dialogo con l'AI che **chiede quale attività bisogna seguire**, la crea (agganciando solo contatti conosciuti) e **propone l'azione che può intraprendere** — col tasto "Procedi" prepara subito la bozza di mail. **Su mobile** (≤900px) i due tasti spariscono: c'è il **pulsante "+" fisso in basso a destra** che apre il foglio "Cosa vuoi creare?" (mail o attività) — tutto in `NuoveAzioni.tsx` (classi `.nuove-inline`/`.fab`/`.scelta-*`).
- **Assistente AI** (oggi/settimana/mese): riassunto del periodo + attività + proposte di archiviazione (map-reduce).
- **Anti-SPAM automatico all'arrivo** (euristiche gratuite + giudizio AI sui casi dubbi), prudente per non nascondere mail di lavoro; sezione SPAM **recuperabile** (mai cancellati).
- **Multi-utente** con login (email+password), ruoli, admin che crea gli utenti.
- **Mobile**: sidebar a scomparsa (drawer con hamburger); Assistente AI nascosto su mobile per far vedere subito la posta.

---

## 8. Sicurezza (difese anti prompt-injection)

- Il **corpo delle email è DATO non fidato**: nei prompt è sempre delimitato e marcato "contenuto non fidato"; le istruzioni scritte dentro NON vanno eseguite.
- Le **istruzioni dell'utente** (regole, istruzioni contatto/thread) sono fidate e separate dal corpo.
- HTML delle mail in **iframe sandboxed** (no script). `sanitizzaHtml` toglie script/on*/javascript:.
- Sessioni firmate HMAC; password hashate; credenziali IMAP cifrate.

---

## 9. Problemi noti / gotchas

- **Postgres locale (`prisma dev`) instabile** — vedi §3. Non è un problema del codice: cade da solo. Per test locali con dati, usa il driver `pg` grezzo per seed/schema.
- **Chiave OpenAI su Vercel**: se incollata con uno spazio/a-capo finale, l'header Authorization diventa invalido e l'SDK riporta "Connection error." (sembra rete ma è la chiave). Il codice ora **ripulisce** la chiave, ma se dà **401** la chiave è proprio sbagliata → va reinserita nel dashboard Vercel (io non posso toccare i segreti).
- **Fuso orario**: Vercel gira in UTC; le date sono formattate esplicitamente in `Europe/Rome` (costante `FUSO` in `format.ts`). `TZ` è riservato su Vercel e non si può impostare.
- **Migrazioni**: solo idempotenti in `scripts/migrate-prod.mjs` (no `prisma migrate deploy`, host diretto Supabase IPv6-only). Le letture delle tabelle nuove sono **difensive** (try/catch → vuoto) così un deploy prima della migrazione non rompe la app.
- **Deploy Hobby**: max 100/giorno per account; le Server Action AI hanno bisogno di `maxDuration=60` sulle pagine.
- **Auto-refresh 30s**: client-side, solo con app aperta. Un refresh a app chiusa richiederebbe un cron più frequente (Pro).
- **Sync inchiodato (RISOLTO 20 lug)**: `ultimoUid` avanzava solo a fine giro; su Vercel un giro con traduzioni + giudizi spam AI superava i 60s, la funzione veniva uccisa e il sync ripartiva sempre dallo stesso blocco (in posta comparivano quasi solo le mail "veloci da salvare", es. le notifiche dal proprio dominio). Ora il cursore avanza **messaggio per messaggio** (`avanzaCursore` in `salvaMessaggi`) e le chiamate AI per giro sono contingentate (5 giudizi spam + 5 traduzioni; il resto si recupera all'apertura). Inoltre la home prende 400 messaggi **senza i corpi** (`omit`) e taglia a 100 righe DOPO il raggruppamento, così le notifiche ad alto volume non spingono fuori il resto della posta.

---

## 10. Sviluppi possibili (non ancora fatti)

- Feedback anti-spam "Segnala / Non è spam" con liste bianche/nere personali (oggi si sposta a mano dalla sezione).
- Retrodatazione delle regole anche per le parti AI (oggi solo deterministiche).
- Autenticazione mittente vera (SPF/DKIM/DMARC) leggendo gli header IMAP, per uno spam più affidabile.
- Invio massivo controllato (es. "scrivi a tutti i partner"): oggi l'AI crea solo l'attività, non invia.
- App Android (era previsto un wrapper Tauri; `src-tauri/` esiste).
- Migrazione a un DB locale stabile per lo sviluppo.

---

## 11. Struttura file (orientamento rapido)

```
deluxy-mail/
  prisma/schema.prisma        # modello dati
  scripts/migrate-prod.mjs    # migrazioni idempotenti (girano nel build)
  src/middleware.ts           # cancello di accesso (sessione)
  src/app/
    layout.tsx                # Shell (drawer mobile), maxDuration
    page.tsx                  # posta in arrivo (Tutte / AI Inbox, thread, spam escluso)
    scrivi/page.tsx           # nuova mail da zero (anche ?bozza= per riprenderla)
    messaggio/[id]/page.tsx   # dettaglio + conversazione + istruzioni thread
    rubrica/[email]/page.tsx  # contatto + PLUS AI + istruzioni + quadro AI
    attivita/page.tsx         # attività + NuovaAttivita (manuale + comando AI)
    regole/page.tsx           # regole (retrodata, attività su misura)
    impostazioni, sezioni, utenti, bozze, inviata, cestino, assistente/[id]
    api/sync/route.ts         # cron
  src/lib/                    # vedi §5
  src/components/             # UI (Shell, Sidebar, PrioritaButtons, EditorIstruzioni,
                              #     NuovaAttivita, NuoveAzioni [tasti + dialogo AI],
                              #     ComposizioneNuova, RiassuntoConversazione, …)
```

---

**Regola operativa Deluxy:** aggiornare QUESTO handoff e la memoria a ogni commit; committare spesso; niente segreti nel repo; confermare le azioni esterne; riportare l'esito reale.
