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
- **APP DELUXY** (pannello verso le altre app): le chiavi si inseriscono ora **dall'app** in **Impostazioni App** (`/impostazioni-app`, solo admin) — vengono **cifrate** (AES-256-GCM come le password IMAP) e salvate come `Impostazione` globale (`app.anagrafiche.key`/`app.finance.key`/`app.fornitori.key`). In alternativa restano le env `ANAGRAFICHE_API_KEY` / `FINANCE_API_KEY` / `FORNITORI_PASSWORD` su Vercel: il resolver `leggiChiaviApp()` in `lib/chiaviApp.ts` legge **prima il DB cifrato, poi l'env**. Le chiavi non tornano mai al browser (la UI mostra solo *se* è impostata). Chiavi: Anagrafiche = **scrittura** (`npm run chiave -- deluxy-mail --scrittura`), Finance = `api.verificheKey`, Fornitori = password admin di search-deluxy (azione «Trova fornitore» → `GET /api/fornitori?brand&number`, header `x-app-password`/`x-app-user`). Opzionali gli URL `ANAGRAFICHE_URL` / `FINANCE_URL` / `FORNITORI_URL` (non segreti). **Senza chiave la carta dell'app è "da collegare"** e l'invio è bloccato. Le azioni ricevono la chiave via `ctx.chiave` (non leggono più `process.env` direttamente).
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
- **RiassuntoSezione** — il punto della situazione AI su una sezione: `taglio` (`giorni`/`thread`), `giorni`, testo, `punti` (uno per riga), conteggi. Se ne tiene uno per sezione+taglio (l'ultimo).
- **Sezione** — colonne in cui l'AI allinea la posta; `genitoreId` = sottosezione (gerarchia a **due livelli**, la figlia eredita il colore) (nome, descrizione, colore, ordine). Unica `[utenteId, nome]`. La sezione **SPAM** viene creata da sola (vedi §7).
- **Regola** — condizioni (`seMittente`/`seOggetto`/`seContiene`), `istruzioneAI`, `attivitaTesto` (attività su misura da creare), sezione, flag (`creaAttivita`, `creaBozza`, `segnaLetta`, `archivia`, `fermaQui`), `priorita`.
- **Messaggio** — uid, messageId, `thread` (radice della catena di risposte), `threadManuale` (aggancio deciso a mano: unisce mail senza legami naturali, vince su tutto), `direzione` (`entrata`/`uscita`), mittente/destinatari, oggetto, data, corpoTesto/corpoHtml, `letto`/`archiviato`/`cestinato`, `sezioneId`/`smistatoDa` (`manuale`/`regola`/`ai`/`spam`), `priorita`/`prioritaDa`, `riassunto`, `serveRisposta`, `analizzatoIl`, `lingua`/`corpoTradotto`.
- **Attivita** — titolo, dettaglio, scadenza, priorita, fatta, `creataDaAI`, link a `messaggio` o `contattoEmail`.
- **Bozza** — risposta non inviata (origine `ai`/`utente`, modo, a/cc/oggetto/corpo, `inviata`).
- **RiassuntoContatto** — quadro AI di un contatto (situazione, taskAperti). Unica `[utenteId, email]`.
- **RapportoAI** + **PropostaArchivio** — risultato dell'Assistente periodico (oggi/settimana/mese).
- **RiassuntoThread** — riassunto "per punti di vista" di una conversazione. Chiave `[utenteId, chiave]` dove `chiave` = id del messaggio capostipite del thread.
- **ContattoAI** — il "PLUS AI": presenza della riga = contatto seguito dall'AI (entra nella AI Inbox). Campo `istruzioni` = istruzioni AI per quel contatto.
- **IstruzioneThread** — istruzioni AI per una conversazione. Chiave `[utenteId, chiave]` (stessa chiave del RiassuntoThread).
- **Impostazione** — preferenze GLOBALI condivise (es. contesto aziendale dato all'AI).
- **Evento** — appuntamento del calendario (titolo, luogo, inizio/fine, giornataIntera, link opzionale al messaggio). `Utente.tokenCalendario` = token segreto del feed iCal (vuoto = feed spento).

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
- **condizioni.ts** — `condizioneSoddisfatta(testo, condizione)` / `alternative(condizione)`: dentro ogni condizione (mittente/oggetto/testo) le **alternative separate da virgola** valgono in **OR** (una basta); fra condizioni diverse resta la E. Usato da `regole.ts`, `appDeluxy.ts` (regole verso le app) e dalla retrodatazione (`retrodataRegola`, che costruisce un `AND` di gruppi `OR` in SQL). Reso in UI dal componente `ValoreCondizione`.
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
- **Calendario:** `creaEvento` (orari in ora italiana → UTC), `eliminaEvento`, `rigeneraFeedCalendario` / `spegniFeedCalendario` (token del feed iCal). Rotta pubblica **`/api/calendario?token=…`** (esclusa dal middleware): feed iCalendar RFC 5545 generato da `lib/ics.ts`, sola lettura, da abbonare in Google/Apple/Outlook.
- **Utenti (auth-actions.ts):** `accedi`, `creaPrimoAdmin`, `esci`, `creaUtente`, `cambiaStatoUtente`, `reimpostaPassword`, `eliminaUtente`, `salvaFirma`.

Cron: **`/api/sync`** (route, autenticata con `CRON_SECRET`) — su Vercel Hobby può girare **1 volta al giorno** (`vercel.json`). L'auto-refresh a 30s è **client-side** (SyncButton), gira solo con la app aperta e in primo piano.

**`maxDuration = 60`** è impostato sulle pagine che scatenano l'AI (`/`, `/messaggio/[id]`, `/rubrica/[email]`, `/assistente/[id]`) — necessario perché le Server Action NON ereditano il maxDuration del layout, e a 10s (default Vercel) l'analisi AI verrebbe uccisa a metà.

---

## 7. Funzionalità implementate

- **Lettura IMAP** + scarico storico progressivo; invio SMTP con copia in "Inviata".
- **Perf posta in arrivo** (20 lug, sera): «Delega Renè» e «Aggancia» nelle righe erano componenti client con stato + modale ciascuno → ~200 istanze in una lista da 100 righe (idratazione pesante = app lenta). Ora seguono il pattern di `BottoneApp`/`InvioAppDialog`: pulsanti che lanciano un evento (`DelegaReneBottone`/`AgganciaBottone`, zero hook) e UN solo dialogo condiviso montato per pagina (`DelegaReneDialog`/`AgganciaDialog`). Se serve ancora perf: valutare virtualizzazione delle righe o intervallo di sync più lungo (ogni auto-sync fa un drain di storico).
- **Aggancio thread e vista completa dalla riga** (20 lug, sera): nella riga della posta ci sono ora «Aggancia» (modale `AgganciaRiga`, riusa `cercaDaAgganciare`/`agganciaAlThread` — prima solo dalla pagina messaggio) e, sui thread (nel>1), «Apri completo» → `/messaggio/[id]?ampia=1`. Nella pagina messaggio un toggle **«Questo thread ⇄ Con le correlate»**: `messaggiThread(utenteId, id, ampia)` — con `ampia` aggiunge al thread stretto TUTTE le mail scambiate con le stesse persone (controparti del thread, deterministico, cap 60), etichettate «(N correlate)».
- **Delega Renè** (20 lug, sera): su ogni mail (azione «Delega Renè» nella riga della posta e bottone nella pagina messaggio) apri un dialogo, scrivi a parole cosa rispondere («declina con garbo», «chiedi il listino», «accetta e proponi giovedì») e Renè prepara la bozza di risposta seguendo stile + istruzioni mirate. `preparaRispostaDelegata` in sync.ts (riusa `scriviRisposta`, sostituisce l'eventuale bozza AI precedente) → apre `/messaggio/[id]/scrivi?bozza=…`. Non invia: la controlli e la mandi tu. Componente `DelegaRene.tsx` (varianti riga/bottone).
- **Conferma d'invio ben visibile** (20 lug, sera): dopo un invio riuscito compare un banner verde «✓ Messaggio inviato a X» in alto al centro (`components/Flash.tsx`, montato nel layout). Sopravvive al cambio pagina via `sessionStorage` (`mettiFlash` prima di navigare) o compare al volo senza navigare via evento `window` (`mostraFlash`, usato in `BozzaEditor`). Sparisce da solo dopo 4s o al clic.
- **Composizione ricca** (20 lug, sera): editor formattato (`EditorRicco`, contenteditable + execCommand: grassetto/corsivo/sottolineato/elenchi/link) e **allegati** (`Allegati`) su risposta, mail nuova e bozza AI. Il corpo viaggia come **HTML** (multipart html + text/plain derivato via `lib/htmlMail.ts`); le bozze salvano l'HTML; la copia in "Inviata" tiene `corpoHtml`. Allegati via FormData (`leggiAllegati`), tetto 20 MB (`next.config.ts` → `serverActions.bodySizeLimit`), NON salvati nelle bozze (solo all'invio). **Traduzione in uscita**: se la lingua va tradotta si invia solo testo (la formattazione non sopravvive alla traduzione) — caso raro, per le lingue lette resta l'HTML. `sembraHtml` cerca solo i tag noti per non scambiare un testo con `<parola>` per HTML.
- **Sottosezioni + riassunto AI per sezione** (20 lug): in `/sezioni` ogni sezione può avere sottosezioni (menu "Dentro a…"); l'albero si vede anche in sidebar (figlie rientrate) e aprendo la madre si vede **anche** la posta delle figlie. Su ogni sezione e sottosezione c'è il riassunto AI (`riassumiSezioneOra`) in due tagli: **per periodo** (1/3/7/14/30 giorni) o **per conversazione** (fino a 12 thread, ultimi 6 messaggi ciascuno). Il riassunto della madre comprende la posta delle figlie.
- **Sezioni** configurabili + **Regole** (deterministiche e/o con istruzione AI) con **retrodatazione** allo storico e **attività su misura**.
- **Priorità P0–P3** su ogni mail → scatena l'analisi AI (riassunto + attività + bozza + smistamento in sezione). **L'AI riceve TUTTA la conversazione** (20 lug): l'ultima mail è quella analizzata, i messaggi precedenti (max 8, accorciati, tradotti se serve) vanno nel prompt come contesto non fidato — così non crea attività per cose già fatte o già risposte.
- **Aggancio manuale al thread** (20 lug): dal dettaglio di una mail, "⚭ Aggancia una mail" cerca per oggetto/mittente e unisce due conversazioni che non hanno né catena di risposte né oggetto in comune (`threadManuale`, `agganciaAlThread`/`staccaDalThread`). L'aggancio vale per l'intero thread di entrambe le mail e le mail agganciate entrano nel thread anche se più vecchie della finestra dei 400 candidati.
- **Traduzione automatica**: mail in lingua straniera tradotte in italiano (all'arrivo e all'apertura); risposte scritte in italiano e inviate nella lingua originale. Configurabile (`lingueLette`).
- **Conversazioni (thread)**: raggruppamento per catena di risposte e per oggetto (anche con destinatari/oggetti diversi); **riassunto "per punti di vista"** che spiega la posizione di ogni parte.
- **Posta in arrivo = solo posta da smistare** (20 lug): una mail smistata in una sezione (da regola o AI) sta NELLA SUA SEZIONE, come le cartelle di un client classico — non resta anche in posta in arrivo. Senza questo, una sezione ad alto volume (es. le notifiche ordini) replicava sé stessa in home e seppelliva il resto. La vista si chiama "In arrivo" (ex "Tutte"); la AI Inbox invece mostra il contatto in qualunque sezione (tranne SPAM).
- **Rubrica** con quadro AI del contatto (mail ricevute+inviate → prossime attività).
- **PLUS AI** sui contatti + **AI Inbox** (vista dedicata) vs **Tutte** (predefinita). SPAM escluso dalla posta in arrivo.
- **Istruzioni AI mirate** per **contatto** e per **conversazione** (precedenza thread > contatto > globale), applicate a tutte le chiamate AI. Fidate, separate dal corpo mail.
- **Attività**: create dall'AI, **a mano**, o da **comando in linguaggio naturale**; tutte eseguibili dall'AI (scrive la mail).
- **Risposte dalle app sulla mail** (20 lug): quando si richiama un'app (APP DELUXY), l'esito viene salvato in `InvioApp` e mostrato **in fondo alla pagina del messaggio** («Risposte dalle app»: badge app + esito + testo su più righe + link «Apri nell'app»). Nella lista posta la mail ha il badge viola «Risposta app» (`_count.inviiApp`). La risposta di «Trova fornitore» è formattata su più righe (nome, distanza+minuti, indirizzo, telefono, WhatsApp, valutazione, aperto ora).
- **APP DELUXY** (20 lug): pannello a destra della posta con una carta per funzione delle altre app — oggi **Anagrafiche → Registra contatto** (POST /api/v1/partners), **Finance → Crea proforma** (POST /api/proforma), **Finance → Verifica partner** (GET /api/verifiche). **Drag & drop** di una mail su una carta (o sulla carta "Automatico", dove decidono le **Regole APP DELUXY** in /regole: condizioni esatte + nota per l'AI + priorità); su **mobile** il bottone **"→ App"** su ogni riga. Flusso: l'AI estrae i dati dalla mail (json_schema strict, `estraiDatiAzione`; corpo non fidato, mai inventare) → l'utente li vede in un JSON modificabile e **conferma** → chiamata HTTP vera → esito + storico in `InvioApp`. Catalogo e client HTTP in `src/lib/appDeluxy.ts` (per aggiungere un'azione si aggiunge lì: schema, guida, esegui).
- **Tasti "Nuova mail" e "Nuova attività"** in testa alla posta (20 lug): "Nuova mail" apre `/scrivi` (mail da zero, conversazione nuova, bozze riprendibili con badge "nuova mail"); "Nuova attività" apre il dialogo con l'AI che **chiede quale attività bisogna seguire**, la crea (agganciando solo contatti conosciuti) e **propone l'azione che può intraprendere** — col tasto "Procedi" prepara subito la bozza di mail. **Su mobile** (≤900px) i due tasti spariscono: c'è il **pulsante "+" fisso in basso a destra** che apre il foglio "Cosa vuoi creare?" (mail o attività) — tutto in `NuoveAzioni.tsx` (classi `.nuove-inline`/`.fab`/`.scelta-*`).
- **Stile di scrittura di Renè** (20 lug, sera): impostazione globale `stile_scrittura` (in `/rene`, «Come scrivo le mail», admin) letta da OGNI mail generata — risposte (`scriviRisposta`), mail nuove (`scriviMailNuova`) ed esecuzione attività, più le bozze dell'analisi (`analizzaMessaggio`). Serve via `contestoAI()` in sync.ts. Default `STILE_DEFAULT` (in impostazioni.ts): saluto d'apertura + corpo cortese + chiusura + firma — così le mail non escono più mozze/telegrafiche come prima (i vecchi prompt imponevano «asciutto, dritto al punto» e saltavano il «Buongiorno»/commiato).
- **Renè AI** (20 lug, sera — pagina `/rene`, sidebar → Applicazioni): l'agente che tiene la casella in ordine. Giro su periodo a scelta (oggi/7/30 gg): legge posta+SPAM+cestino (digest compatto, 1 sola chiamata AI — `reneAnalizza` in ai.ts), consulta e RISCRIVE il suo **taccuino** (`ReneMemoria`, tetto 1500 caratteri, modificabile a mano dalla pagina), e genera **proposte** (`ReneProposta`: sezione/regola/smista/attivita/evento) che si applicano SOLO dopo conferma — bottoni Approva / **«Approva, e fai sempre così»** (crea una `ReneConseguenza` per quel tipo: dai giri dopo si applica da sola, revocabile) / No. **Anti-tormentone**: ogni proposta ha una firma; una proposta uguale a una già fatta (anche rifiutata) non viene riproposta. **Urgenti senza risposta** calcolate DETERMINISTICAMENTE (P0/P1 o serveRisposta, nessuna nostra mail dopo nel thread — `urgentiSenzaRisposta` in `lib/rene.ts`), non dall'AI. Orchestrazione in `lib/rene.ts` (`eseguiRene`, `applicaPropostaRene`); le sezioni citate dalle proposte si creano al volo se mancano; smistamenti mai sopra `smistatoDa='manuale'`. L'**Assistente AI sparisce dalla posta in arrivo** (il pannello fisso); le vecchie pagine `/assistente/[id]` restano leggibili.
- **Assistente AI** (storico, oggi/settimana/mese): riassunto del periodo + attività + proposte di archiviazione (map-reduce) — superato da Renè, pannello rimosso dalla home.
- **Anti-SPAM automatico all'arrivo** (euristiche gratuite + giudizio AI sui casi dubbi), prudente per non nascondere mail di lavoro; sezione SPAM **recuperabile** (mai cancellati).
- **Multi-utente** con login (email+password), ruoli, admin che crea gli utenti.
- **Mobile**: sidebar a scomparsa (drawer con hamburger); Assistente AI nascosto su mobile per far vedere subito la posta.
- **Appuntamento proposto dall'AI** (20 lug): quando dai una priorità a una mail che è un invito a riunione/appuntamento (anche link Teams/Zoom/Meet), l'analisi estrae l'evento (`analizzaMessaggio` → campo `evento`) e lo salva in `Messaggio.eventoProposto`. La pagina del messaggio mostra la card «Appuntamento trovato dall'AI» con **Aggiungi al calendario** (`accettaEventoProposto` → crea `Evento` legato alla mail, ora in Europe/Rome→UTC) o **Ignora** (`ignoraEventoProposto`). In lista posta la mail ha il badge blu «Appuntamento». Niente inserimenti automatici: si conferma sempre. Parser/lettore in `lib/eventoProposto.ts` (fuori dalle server action perché sincrono).
- **Esegui anche senza mail d'origine** (20 lug, sera): `preparaEsecuzione` ora gestisce le attività NON nate da una mail (es. create dal dialogo "Nuova attività"): l'AI scrive una **mail nuova** (`scriviMailNuova` in ai.ts — destinatari solo fra i mittenti recenti, dati del compito usati tali e quali) come bozza `modo='nuova'` che si apre in `/scrivi?bozza=…`. Nel dialogo "Nuova attività" il tasto **«Procedi: prepara la mail»** ora c'è sempre (prima senza contatto agganciato restava solo «Va bene così», che chiudeva e basta — da lì il «faccio va bene così e non succede nulla»).
- **Esegui nella lista DA FARE** (20 lug): la colonna DA FARE della posta in arrivo (`ColonnaAttivita`) ora ha il tasto **Esegui** (come la pagina Attività) su ogni task con mail/contatto d'origine — prima c'era solo la spunta (che segna «fatta», non esegue: da qui l'equivoco «eseguita ma non succede nulla»).
- **Calendario** (20 lug): pagina `/calendario` — vista mensile + prossimi 30 giorni, appuntamenti a mano (anche giornata intera), eliminazione con conferma. **Le attività con scadenza** compaiono nella griglia sul loro giorno (chip col pallino colore-priorità → apre la mail/attività) e in una sezione **«Attività in scadenza»** ordinata per urgenza (scadenza poi priorità). **Sincronizzazione con le altre agende** via feed iCal segreto (pannello in fondo alla pagina: accendi → copia il link → "Da URL" in Google Calendar / calendario iPhone / Outlook; rigenera o spegni quando vuoi). Su mobile la griglia mostra i giorni a pallini.

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
- **Traduzione in RISPOSTA non rispettava le lingue lette (RISOLTO 20 lug, sera)**: rispondendo a una mail in una lingua che l'utente LEGGE (es. inglese), compariva comunque il banner «scrivi in italiano, traduco io» e all'invio la risposta veniva tradotta. Ora `traduciSeStraniera` (in uscita) e il banner della pagina `scrivi` usano **la stessa regola** della traduzione in arrivo (`leggiSenzaTraduzione` in `lib/lingue.ts`, modulo condiviso): se la lingua è italiano o fra le `lingueLette`, la risposta non si tocca. Prima l'helper viveva solo in sync.ts.
- **Traduceva le lingue "già lette" (RISOLTO 20 lug)**: le mail in inglese venivano tradotte anche con l'inglese spuntato in Impostazioni. La regola viveva **solo nel prompt**, che per giunta si contraddiceva ("DEVI riempire la traduzione" vs "lasciala vuota se è una lingua letta"): il modello seguiva l'imperativo più forte. Ora c'è il guardiano deterministico `leggiSenzaTraduzione()` in `sync.ts` che **scarta la traduzione nel codice** se la lingua rilevata è l'italiano o è fra le `lingueLette` (confronto tollerante a maiuscole/spazi/"inglese (britannico)"), e il prompt è stato riscritto in due passi. Le traduzioni già salvate a torto sono state ripulite da una UPDATE idempotente in `migrate-prod.mjs`. **Lezione**: una scelta dell'utente non va mai affidata al prompt, si applica nel codice.
- **Badge "Tradotto" su testo NON tradotto (RISOLTO 20 lug)**: caso diverso dal precedente — lingua da tradurre (es. spagnolo, non fra le lette), ma l'AI ha rimesso l'ORIGINALE nel campo `traduzione` invece di tradurre. `corpoTradotto` finiva valorizzato con testo straniero e il badge si accendeva. Ora `traduzioneFinta()` in `sync.ts` scarta la traduzione quando è (quasi) identica all'originale (uguaglianza normalizzata o stesso incipit di 300 caratteri); pulizia delle esistenti con una UPDATE in `migrate-prod.mjs`.
- **Auto-refresh**: client-side, solo con app aperta; **intervallo scelto dall'utente** in Impostazioni → "Controlla la posta ogni" (30s/1/2/5/10 min, default **1 minuto**, `Utente.sincronizzaOgniSec`, whitelist lato server). La spunta on/off resta per dispositivo (localStorage). Un refresh a app chiusa richiederebbe un cron più frequente (Pro).
- **Sync inchiodato (RISOLTO 20 lug)**: `ultimoUid` avanzava solo a fine giro; su Vercel un giro con traduzioni + giudizi spam AI superava i 60s, la funzione veniva uccisa e il sync ripartiva sempre dallo stesso blocco (in posta comparivano quasi solo le mail "veloci da salvare", es. le notifiche dal proprio dominio). Ora il cursore avanza **messaggio per messaggio** (`avanzaCursore` in `salvaMessaggi`) e le chiamate AI per giro sono contingentate (5 giudizi spam + 5 traduzioni; il resto si recupera all'apertura). Inoltre la home prende 400 messaggi **senza i corpi** (`omit`) e taglia a 100 righe DOPO il raggruppamento, così le notifiche ad alto volume non spingono fuori il resto della posta.
- **Cursore regredito dallo storico (RISOLTO 20 lug, sera)**: il primo `avanzaCursore` girava anche per lo **storico** (uid bassi) e faceva un update secco: scaricando lo storico, `ultimoUid` REGREDIVA e il sync rimacinava all'infinito mail già viste — la posta nuova non arrivava più. Ora: (1) il cursore avanza solo per lo scarico dei nuovi (`avanzaUltimoUid: true`) e ogni update è **monotono** (`updateMany` con `ultimoUid: { lt }`); (2) `scaricaNuovi` fa prima una **search leggera** e scavalca gli uid già in DB senza rifetcharne il corpo → un cursore rimasto indietro si ripara da solo in un giro; (3) `sincronizzaAccount` gira **a esaurimento** (più blocchi da 25 fino a ~35s di budget); (4) quando non c'è niente di nuovo scarica da solo un blocco di **storico** (niente più bottone in Impostazioni per la posta vecchia); (5) le mail arrivate in **più copie** (stesso Message-ID, uid diversi: alias/inoltri) si salvano una volta sola — prima gonfiavano i thread e doppiavano le attività delle regole. Le copie già salvate prima del fix restano nel DB (pulizia su richiesta).

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
    impostazioni-app/page.tsx # APP DELUXY: stato chiavi (Anagrafiche/Finance/Fornitori) + regole di smistamento
    impostazioni, sezioni, utenti, bozze, inviata, cestino, assistente/[id]
    api/sync/route.ts         # cron
  src/lib/                    # vedi §5
  src/components/             # UI (Shell, Sidebar, PrioritaButtons, EditorIstruzioni,
                              #     NuovaAttivita, NuoveAzioni [tasti + dialogo AI],
                              #     ComposizioneNuova, RiassuntoConversazione, …)
```

---

**Regola operativa Deluxy:** aggiornare QUESTO handoff e la memoria a ogni commit; committare spesso; niente segreti nel repo; confermare le azioni esterne; riportare l'esito reale.
