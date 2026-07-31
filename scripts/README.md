# Script operativi del repo Deluxy — catalogo unico

Questa cartella **non contiene script**: è l'**indice** di tutti gli script operativi del repo, che restano nella cartella della loro app (`<app>/scripts/`). Per ogni script trovi cosa fa, il comando pronto da copiare e le variabili d'ambiente che richiede.

> **Regola: ogni nuovo script va aggiunto qui**, nella sezione della sua tipologia, nello stesso commit che lo introduce.

> ⚠️ **Non confondere con l'app [deluxy-scripts](../deluxy-scripts/README.md)** (porta 3170): lì «script» vuol dire **copione commerciale** — i testi di vendita, inviti e presentazioni che si mandano ai clienti in email o WhatsApp. Gli script di codice sono quelli catalogati qui.

## Prima di iniziare

- I comandi sono scritti per **bash** (Git Bash su Windows). Se `node` non è nel PATH, aggiungilo una volta per sessione:
  ```bash
  export PATH="/c/Program Files/nodejs:$PATH"
  ```
- Le variabili d'ambiente sono indicate **solo per nome**: i valori si prendono dalle pagine elencate in [Link per i token](#link-per-i-token). **Mai scrivere segreti in questo file né in un file committato.**
- I comandi partono dalla **radice del repo** (`C:\Users\nicol\scoutwt`), con un `cd` nella cartella dell'app.
- In PowerShell la sintassi `VAR=valore comando` non funziona: usa `$env:VAR = "valore"` su una riga separata e poi il comando.

---

## 1. Deploy e pubblicazione

### deploy-web.sh — deluxy-scout
Build web di Expo, fix dei font delle icone e deploy in produzione su Vercel (progetto `deluxy-scout`, pinnato per ID), con verifica finale che il dominio serva davvero Scout.

```bash
# dalla radice del repo
cd deluxy-scout && VERCEL_TOKEN=<token> bash scripts/deploy-web.sh
```

- **Serve**: `VERCEL_TOKEN` (https://vercel.com/account/tokens)
- **Nota**: pubblica in **produzione** su `https://deluxy-scout.vercel.app` — azione esterna, da confermare prima di lanciarla. Se la verifica finale fallisce esce con errore: significa che il progetto Vercel ha ripreso l'integrazione Git col repo `search` e sta pubblicando l'app fiorai al posto di Scout.

---

## 2. Database e migrazioni

### mgmt-query.mjs — deluxy-scout
Esegue un file `.sql` (o SQL inline) sul database Supabase di Scout tramite la Management API, senza bisogno della password del DB.

```bash
# dalla radice del repo
cd deluxy-scout && SUPABASE_PAT=<pat> node scripts/mgmt-query.mjs percorso/file.sql
# oppure SQL inline
cd deluxy-scout && SUPABASE_PAT=<pat> node scripts/mgmt-query.mjs -e "select count(*) from places;"
```

- **Serve**: `SUPABASE_PAT` (https://supabase.com/dashboard/account/tokens); opzionale `SUPABASE_REF` (default: project ref di Scout già nel codice)
- **Nota**: esegue **qualsiasi** SQL, incluse `drop`/`delete` — leggere il file prima di lanciarlo.

### allinea-supabase.mjs — deluxy-scout
Porta il backend di Scout al passo col codice **in un colpo solo**: applica le migrazioni previste e rideploya le Edge Functions cambiate. Le migrazioni elencate sono idempotenti (nessuna `drop`/`delete`), quindi rilanciarlo non fa danni — anzi la `0046` va rilanciata apposta quando cambiano i canali di contatto.

```bash
# dalla radice del repo
cd deluxy-scout && SUPABASE_PAT=<pat> node scripts/allinea-supabase.mjs
```

- **Serve**: `SUPABASE_PAT` (https://supabase.com/dashboard/account/tokens); opzionale `SUPABASE_REF`
- **Nota**: la lista di migrazioni e funzioni sta in cima allo script — **aggiungerci le nuove**, altrimenti restano non applicate. È già successo che una schermata risultasse vuota solo perché la Edge Function non era stata rideployata, senza che niente lo dicesse.

### APPLICA-MIGRAZIONI.cmd — deluxy-scout
Lo stesso di `allinea-supabase.mjs`, ma **con un doppio clic**: chiede il token in una finestra, esegue, e resta aperto a mostrare l'esito. Il token non viene salvato da nessuna parte — vive solo in quella finestra.

Esiste perche' il comando da terminale va incollato in due pezzi e in PowerShell, e ogni volta che non viene lanciato restano funzioni **pubblicate ma spente** nell'app (e' successo con cinque funzioni di fila).

- **Serve**: niente da preparare; il token si crea al momento da https://supabase.com/dashboard/account/tokens

### azzera-target-conteggio.sql / azzera-target.sql — deluxy-scout
Azzerano la pagina **Target** di Scout cancellando **solo i negozi mai lavorati**: `stato = 'da_visitare'`, non preferiti e senza nessuna visita, trattativa, contatto, chiamata, task o richiesta di pagamento. Clienti, negozi visitati e tutto ciò che ha una trattativa o un contatto restano.

```bash
# 1) prova a vuoto: dice quanti ne cancellerebbe, non tocca niente
cd deluxy-scout && SUPABASE_PAT=<pat> node scripts/mgmt-query.mjs scripts/azzera-target-conteggio.sql
# 2) cancellazione vera (irreversibile)
cd deluxy-scout && SUPABASE_PAT=<pat> node scripts/mgmt-query.mjs scripts/azzera-target.sql
```

- **Serve**: `SUPABASE_PAT` (https://supabase.com/dashboard/account/tokens)
- **Nota**: **irreversibile e in produzione** — lanciare sempre prima il conteggio. La lista si **ripopola** al primo giro di scoperta Google dalla Mappa e a ogni `import-anagrafiche.mjs`: se si vuole ripartire davvero da zero, non rilanciare l'import.

### migrate-prod.mjs — deluxy-mail
Migrazione idempotente (create table/index/column `IF NOT EXISTS` + pulizia dei messaggi duplicati) applicata automaticamente a ogni build/deploy.

```bash
# dalla radice del repo
cd deluxy-mail && node --env-file=.env scripts/migrate-prod.mjs
```

- **Serve**: `DATABASE_URL` (dal `.env` dell'app; se assente lo script salta senza errore)
- **Nota**: è già dentro `npm run build`, di norma **non va lanciato a mano**. È volutamente non bloccante: logga e prosegue anche se il DB non risponde.

### ripara-testi-sporchi.mjs — deluxy-mail
Rimette a posto il testo delle mail sporcato dagli indirizzi dei link. Il caso: un client di posta avvolge singole **lettere** in un link (`Buongio<a href="mailto:x@y.it">r</a>no`) e la conversione in testo semplice ci infila dentro l'indirizzo — «Buongior mailto:x@y.itno Luca». Non è solo l'anteprima: quel testo è anche **quello che legge l'AI**. Lo script ricava il testo dall'HTML che è ancora nel database.

```bash
# dalla radice del repo — PRIMA conta soltanto
cd deluxy-mail && node --env-file=.env scripts/ripara-testi-sporchi.mjs
# poi, se il numero convince, ripara davvero
cd deluxy-mail && node --env-file=.env scripts/ripara-testi-sporchi.mjs --applica
```

- **Serve**: `DATABASE_URL` (col pooler aggiungere `&pgbouncer=true`)
- **Nota**: senza `--applica` **non scrive niente**. Le mail nuove nascono già pulite (`testoMigliore` in `src/lib/htmlMail.ts`), quindi è una tantum. ⚠️ Ripara solo le mail che hanno ancora l'HTML in casa: quelle vecchie sono state alleggerite (l'HTML abita sul server IMAP) e lo script le salta.

### ripristina-budget-azzerato.mjs — deluxy-budgets
Rimette il budget **D2C di Deluxy.it su gennaio–giugno 2026**, azzerato il 31/07/2026 dal consolidamento di una proposta che portava con sé degli zeri sui mesi già chiusi (692.728 € spariti dal budget pubblicato; totale maison sceso da 1.492.440 a 1.173.904 €). I valori vengono dal seed (`prisma/seed-data.json`, estratto da *Monitoraggio 2026.xlsx*), cioè dalla fonte da cui il budget era nato.

```bash
# dalla cartella dell'app — PRIMA la prova a vuoto, che stampa solo cosa farebbe
cd deluxy-budgets && node scripts/ripristina-budget-azzerato.mjs
# poi, se i numeri convincono, scrive davvero
cd deluxy-budgets && node scripts/ripristina-budget-azzerato.mjs scrivi
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app (lo legge Prisma da solo)
- **Nota**: senza `scrivi` **non tocca niente**. Tocca **solo** i sei mesi indicati e **solo** il canale `D2C` di quella maison, e **salta i mesi che non sono a zero**: se nel frattempo qualcuno ha scritto un numero vero, quella è una decisione e lo script non la cancella. La causa è stata tolta (una proposta non contiene più i mesi che non propone, e il consolidamento mostra il prima/dopo), quindi è una tantum.

### diagnosi-spazio.sql — deluxy-mail
Perché il database è pieno: peso di ogni tabella (con indici e TOAST a parte), righe morte e ultimo VACUUM, peso reale dei corpi delle mail anno per anno. Da incollare nel **SQL Editor di Supabase**.

- **Serve**: nulla — sono tutte `SELECT`, quindi gira anche a database in **sola lettura** (che è la situazione in cui serve).
- **Nota**: da guardare **prima** di spostare il database. Su Postgres «disco pieno» spesso non vuol dire «tanti dati»: cancellando righe lo spazio non si libera finché non passa un VACUUM, e per i campi lunghi il gonfiore può essere enorme. Se il problema è quello, spostare tutto sposta anche il gonfiore.

### libera-spazio.sql — deluxy-mail
Come recuperare spazio: cestino, corpi HTML delle mail vecchie, traduzioni vecchie, e il `VACUUM` che serve a rendere effettivo il recupero. Da usare nel **SQL Editor di Supabase** dopo `diagnosi-spazio.sql`.

- **Serve**: un database che accetti scritture — la prima query del file lo verifica (a disco pieno Supabase è in sola lettura e ogni DELETE fallisce con `25006`).
- **Nota**: ogni blocco che cancella ha **sopra la sua SELECT di conteggio** e il comando distruttivo è **commentato**: si guarda il numero, poi si decommenta. Non va mai eseguito tutto insieme. ⚠️ **Su Postgres cancellare NON libera il disco**: il `DELETE` marca le righe come morte, `VACUUM` rende lo spazio riusabile *dentro* la tabella (il database smette di crescere) e solo `VACUUM FULL` restituisce il disco — ma riscrive la tabella, la blocca per tutta la durata e richiede spazio libero pari alla tabella stessa. Quindi l'ordine è: **prima** si aumenta il disco, **poi** si cancella, **poi** si compatta.

### sposta-database.mjs — deluxy-mail
Copia l'intero database di AI Mail su un altro Postgres (es. da un progetto Supabase pieno a uno nuovo). Solo copia: **dalla sorgente non cancella niente**.

⚠️ **Se la destinazione ospita già un'altra app, AI Mail va in uno schema SUO** (`?schema=mail` in fondo alla stringa). Non è pignoleria: `prisma db push` fa combaciare il database con lo schema, quindi in un `public` condiviso vedrebbe le tabelle dell'altra applicazione come **da cancellare**. Si ferma da solo, ma basta che qualcuno aggiunga `--accept-data-loss` per cancellare l'app accanto. Con uno schema dedicato, `public` gli è proprio invisibile. Lo script si **rifiuta di partire** se trova tabelle altrui in `public` e nessuno schema dichiarato.

```bash
# 1. sulla DESTINAZIONE si creano prima le tabelle
cd deluxy-mail
DATABASE_URL="…nuovo…?schema=mail" DIRECT_URL="…nuovo…?schema=mail" npx prisma db push

# 2. prova a vuoto (legge e conta, non scrive)
node --env-file=.env.sposta scripts/sposta-database.mjs

# 3. copia vera (ripetibile: le righe già copiate si saltano)
node --env-file=.env.sposta scripts/sposta-database.mjs --scrivi
```

- **Serve**: `DA_DATABASE_URL` (sorgente) e `A_DATABASE_URL` (destinazione) in un `.env.sposta` locale — **mai committato**.
- **Nota**: alla fine confronta il numero di righe tabella per tabella e lo stampa: è così che si sa se è andata, senza fidarsi. Lo script **si rifiuta di partire** se nello schema Prisma c'è un modello che non è nel suo elenco di copia (altrimenti una tabella intera resterebbe indietro in silenzio). Il vecchio database **non si spegne** finché il nuovo non ha lavorato qualche giorno.

### npm — migrazioni per app

| App | Comando |
| --- | --- |
| deluxy-anagrafiche · hub · partner · budgets · mail | `cd <app> && npm run db:push` (applica lo schema Prisma) |
| deluxy-hub · partner · budgets | `cd <app> && npm run db:seed` |
| deluxy-mail | `cd deluxy-mail && npm run db:seed` (usa `--env-file=.env`) |
| deluxy-platform-next | `cd deluxy-platform-next && npm run prisma:generate` · `npm run prisma:migrate` · `npm run seed` (workspace `api`; in produzione `npm run prisma:deploy -w api`) |

---

### esporta-dati.mjs / importa-dati.mjs — deluxy-marketing
Travaso completo del database Marketing (es. da SQLite di sviluppo al Postgres di produzione): esporta tutto in un JSON e lo ricarica altrove senza duplicare (idempotente). L'ordine delle tabelle sta in `tabelle.mjs`.

```bash
cd deluxy-marketing && npm run esporta                         # → dati-marketing.json
cd deluxy-marketing && npm run importa -- dati-marketing.json  # nel DB puntato dal .env
```

- **Serve**: `DATABASE_URL` (e `DIRECT_URL` su Postgres) nel `.env` dell'app
- **Nota**: il file esportato contiene email dei clienti → è in `.gitignore`, **mai committarlo**

### configura-db-condiviso.mjs — deluxy-marketing
Configura il `.env` dell'app Marketing copiando le stringhe del Postgres condiviso Deluxy da un'altra app e impostando lo schema dedicato `marketing`. Non stampa mai le credenziali.

```bash
cd deluxy-marketing && npm run configura-db -- ../deluxy-hub/.env
```

- **Serve**: il `.env` di un'altra app Deluxy già sul cluster condiviso (hub, anagrafiche…)

## 3. Import e sincronizzazione dati

### import-places.mjs — deluxy-scout
Importa lead da un CSV nella tabella `places` di Supabase (a batch di 500).

```bash
# dalla radice del repo
cd deluxy-scout && SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<service_role> node scripts/import-places.mjs percorso/lead.csv
# equivalente: npm run import:places -- percorso/lead.csv (con le env già impostate)
```

- **Serve**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard → Project Settings → API)
- **Nota**: fa `insert`, **non** upsert: rilanciarlo sullo stesso CSV **duplica** i lead. Il CSV deve avere l'intestazione con almeno `nome, lat, lng`; altre colonne riconosciute: `indirizzo, settore, categoria, priorita, zona, linea_ipotizzata, aggancio_apertura, fuoco_espansione, stato`. La service role key non va mai messa nell'app.

### import-anagrafiche.mjs — deluxy-scout
Importa il registro centralizzato Deluxy Anagrafiche dentro Scout: partner → `places` (con `anagrafiche_id`), contatti → `contacts`, geocodificando gli indirizzi nuovi.

```bash
# dalla radice del repo
cd deluxy-scout && ANAGRAFICHE_API_KEY=<chiave-lettura> SUPABASE_PAT=<pat> node scripts/import-anagrafiche.mjs --dry
# senza --dry per scrivere davvero
```

- **Serve**: `ANAGRAFICHE_API_KEY` (chiave di **sola lettura**, si genera con `crea-chiave.mjs`), `SUPABASE_PAT` (https://supabase.com/dashboard/account/tokens), chiave Google per il geocoding via `GOOGLE_GEOCODING_KEY` o `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY` nel `.env` dell'app. Opzionali: `ANAGRAFICHE_URL` (default `https://deluxy-anagrafiche.vercel.app`), `SUPABASE_REF`.
- **Nota**: ri-eseguibile (aggiorna invece di duplicare, grazie all'indice unico su `places.anagrafiche_id`). Le anagrafiche già importate non vengono ri-geocodificate perché le geocodifiche costano. Provare **sempre** prima con `--dry`.

### recupera-telefoni.mjs — deluxy-scout
Estrae i telefoni dal testo libero delle anagrafiche e li inserisce come contatto "Recapito" per le affiliazioni Scout che non hanno ancora un numero chiamabile.

```bash
# dalla radice del repo
cd deluxy-scout && ANAGRAFICHE_API_KEY=<chiave-lettura> SUPABASE_PAT=<pat> node scripts/recupera-telefoni.mjs --dry
```

- **Serve**: `ANAGRAFICHE_API_KEY` (sola lettura), `SUPABASE_PAT`; opzionali `ANAGRAFICHE_URL`, `SUPABASE_REF`
- **Nota**: complementare a `import-anagrafiche.mjs` (che porta i contatti "veri"): agisce solo sulle affiliazioni `linea_ipotizzata = 'Re-seller'` rimaste senza telefono. Validazione stretta dei numeri (cellulare 10 cifre da 3, fisso da 0). Provare prima con `--dry`.

### import-excel.mjs — deluxy-anagrafiche
Importa le anagrafiche B2B dal tracker Excel nel registro.

```bash
# dalla radice del repo
cd deluxy-anagrafiche && npm run import:excel
# con un file diverso dal default
cd deluxy-anagrafiche && npm run import:excel -- "C:/Users/nicol/Downloads/ANAGRAFICHE B2B COMPLETE - ACTIVITY TRACKER.xlsx"
```

- **Serve**: `DATABASE_URL` / `DIRECT_URL` nel `.env` dell'app (vedi `configura-db-condiviso.mjs`)
- **Nota**: idempotente ma **distruttivo sul proprio perimetro**: cancella e ricrea solo le anagrafiche con fonte `excel`; quelle create dalla piattaforma o a mano non vengono toccate. Default del percorso: `~/Downloads/ANAGRAFICHE B2B COMPLETE - ACTIVITY TRACKER.xlsx`.

### importa-hubspot-contatti.mjs — deluxy-anagrafiche
Importa i contatti (persone) da HubSpot e li aggancia come referenti ai partner del registro.

```bash
# dalla radice del repo
cd deluxy-anagrafiche && npm run import:hubspot-contatti
```

- **Serve**: `HUBSPOT_ACCESS_TOKEN` (variabile d'ambiente oppure riga `HUBSPOT_ACCESS_TOKEN="..."` nel `.env` dell'app; token da HubSpot → Impostazioni → Integrazioni → App private), più `DATABASE_URL` nel `.env`
- **Nota**: idempotente — i referenti già presenti (per email/telefono/nome) non vengono duplicati. L'associazione contatto→azienda→partner si risolve prima per id, poi per nome azienda normalizzato solo se univoco.

### sync-stato-analisi.mjs — deluxy-partner
Porta il «Cliente per l'anno» di FINANCE (P.P. / Nuovo / Dismesso) nello **stato analisi** delle aziende del registro Anagrafiche.

```bash
# dalla radice del repo — prima la prova a vuoto, poi la scrittura
cd deluxy-partner && npm run sync:stato-analisi -- --dry
cd deluxy-partner && npm run sync:stato-analisi
```

- **Serve**: `DATABASE_URL` nel `.env` di deluxy-partner, più `ANAGRAFICHE_URL` e `ANAGRAFICHE_WRITE_KEY` (in mancanza usa `ANAGRAFICHE_API_KEY`, che dal 20/07/2026 ha scrittura piena)
- **Nota**: idempotente — chi ha già lo stato giusto viene saltato. Aggancia il partner al registro per `anagraficaId`, altrimenti per nome esatto (o per sola insegna se il risultato è univoco, eventualmente disambiguato dalla città) e salva il collegamento trovato. Gli ambigui non vengono toccati: si risolvono a mano in `/match` del registro.

### recupera-qonto-storico.mjs — deluxy-partner
Scarica da Qonto i movimenti di un **intervallo di date** e li aggiunge all'archivio, deduplicati per hash.
Serve perché la sincronizzazione normale parte dal più recente e si ferma a 30 pagine: basta per il
quotidiano, ma il vecchio non entra mai — e infatti l'archivio partiva dal 16/07/2025 mentre Qonto ha i
movimenti dal 13/05/2024.

```bash
# dalla radice del repo — prima la prova a vuoto, poi la scrittura
cd deluxy-partner && node --env-file=.env scripts/recupera-qonto-storico.mjs 2025-01-01 2025-07-31
cd deluxy-partner && node --env-file=.env scripts/recupera-qonto-storico.mjs 2025-01-01 2025-07-31 scrivi
```

- **Serve**: `DATABASE_URL` nel `.env` di deluxy-partner. Le credenziali Qonto **non** si passano a mano: si
  leggono dalla tabella `Impostazione` (chiavi `qonto.login` e `qonto.secretKey`), le stesse che usa l'app.
- **Nota**: senza `scrivi` non tocca niente, dice solo cosa troverebbe. La deduplica usa lo stesso hash
  dell'app (`hashMovimento` in `src/lib/estratto.ts`): se cambiasse, gli stessi movimenti entrerebbero due
  volte. Usato il 29/07/2026 per recuperare gennaio–luglio 2025: **3.423 movimenti**, uscite 2025 da
  668.322 a **1.113.632 €**.

### import-monitoraggio.mjs — deluxy-marketing
Importa il file «Monitoraggio 2026.xlsx» nell'app Marketing: vendite e budget ADV mensili per sito, settimane MKT 2025/2026 (totale e per brand, per il confronto anno su anno), copy RSA con keyword.

```bash
# dalla radice del repo
cd deluxy-marketing && npm run import:monitoraggio -- "C:\Users\nicol\Downloads\Monitoraggio 2026.xlsx"
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: idempotente (upsert su chiavi naturali): rilanciarlo con una versione aggiornata del file aggiorna i numeri senza duplicare.

### deposita-analisi.mjs — deluxy-marketing
Deposita un'analisi nell'app scrivendo direttamente nel database (senza server acceso). Usato dall'attività programmata quotidiana di analisi del Drive.

```bash
# dalla radice del repo
cd deluxy-marketing && node scripts/deposita-analisi.mjs '{"titolo":"…","sintesi":"…","brand":"cross"}'
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app

### sync-drive.mjs — deluxy-marketing
Indicizza in **sola lettura** la cartella locale Google Drive «ADV DELUXY SRL» (Google Drive per Desktop) nell'app Marketing: brand e categoria dedotti dal percorso, rimozione dall'indice dei file spariti dal Drive. Dal 28/07/2026 **crea anche le `Analisi`** dai documenti di categoria *analisi*/*audit* non ancora importati (chiave: percorso del file), leggendo le prime righe dei `.md`/`.txt`; archivi e documenti marcati `SUPERATO` restano fuori.

```bash
# dalla radice del repo
cd deluxy-marketing && npm run sync-drive
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app; `DRIVE_ADV_DIR` se la cartella non è `G:\Il mio Drive\ADV DELUXY SRL`
- **Nota**: idempotente; la cartella Drive **non viene mai scritta**. Stessa sync disponibile dal bottone «Sincronizza ora» nella pagina Documenti Drive dell'app (che nella versione server è anche **ripartibile**: se il tempo finisce si ferma e la passata dopo riprende da dov'era, senza cancellare l'indice).

---

### import-ordini-da-orders.mjs — deluxy-marketing
Importa gli ordini di **tutti e tre i brand** dal registro centrale [deluxy-orders](../deluxy-orders/README.md), invece che da Shopify: gli ordini veri stanno già lì, allineati coi tre negozi, e leggere da una fonte sola evita tre token Admin da custodire e due verità che possono divergere.

```bash
cd deluxy-marketing && npm run import:ordini-orders                    # dal 2025-01-01
cd deluxy-marketing && npm run import:ordini-orders -- --da 2026-01-01
cd deluxy-marketing && npm run import:ordini-orders -- --brand flowers
cd deluxy-marketing && npm run import:ordini-orders -- --annullati     # include gli annullati
```

- **Serve**: `ORDERS_API_KEY` (chiave di **sola lettura** creata in deluxy-orders con `npm run chiave -- deluxy-marketing`); opzionale `ORDERS_URL` (default `https://deluxy-orders.vercel.app`)
- **Nota**: idempotente (upsert su negozio + id Shopify, con l'id ridotto al numero nudo per riconoscere anche gli ordini già importati da Shopify). Gli **annullati non arrivano** se non li si chiede: un annullato resta spesso "pagato" e gonfierebbe il fatturato. Netto merce, spedizione e sconto non esistono in Orders: sulle righe già presenti non vengono toccati.

### import-pubblici-da-orders.mjs — deluxy-marketing
Importa i **pubblici** dal registro centrale Orders: le 39 liste di clienti che Orders ricava dal comportamento d'acquisto (VIP, da riattivare, compra fiori, ha comprato per San Valentino…) diventano pubblici dell'app, pronti da caricare su Meta o Google come Customer Match.

```bash
cd deluxy-marketing && npm run import:pubblici-orders
cd deluxy-marketing && npm run import:pubblici-orders -- --minimo 50   # salta le liste piccole
```

- **Serve**: `ORDERS_API_KEY` (sola lettura), come per gli ordini
- **Nota**: idempotente. I pubblici nascono **"da creare"**: la lista esiste come segmento di clienti, non ancora come pubblico caricato su una piattaforma. Su un pubblico già presente lo **stato non si tocca** — l'import porta i numeri, non i giudizi. Ogni giro registra anche la misura del giorno, così la dimensione si legge nel tempo.

### import-ordini-shopify.mjs / carica-ordini-lotto.mjs — deluxy-marketing
Import degli ordini Shopify nella sezione Ordini: il primo interroga l'Admin API dei negozi configurati, il secondo carica file JSON di ordini già scaricati (anche una cartella intera di pagine).

```bash
cd deluxy-marketing && node scripts/import-ordini-shopify.mjs
cd deluxy-marketing && node scripts/carica-ordini-lotto.mjs <file-o-cartella>
```

- **Serve**: `DATABASE_URL`; per l'Admin API `SHOPIFY_NEGOZI` + `SHOPIFY_TOKEN_<NEGOZIO>` ([token](https://admin.shopify.com) → App e canali di vendita → Sviluppa app)

### import-storico.ts — deluxy-orders
**Import iniziale**: scarica da Shopify **tutti gli ordini di sempre** dei negozi collegati e li salva nel registro Orders. Riusa il motore dell'app (`src/lib/sync.ts`): è ripetibile senza creare doppioni e non sovrascrive la classificazione già impostata. Stampa l'avanzamento e un riepilogo per negozio.

```bash
# dalla radice del repo — tutto lo storico (lungo: decine di minuti)
cd deluxy-orders && npm run import:storico
# solo gli ultimi N giorni
cd deluxy-orders && npm run import:storico -- 365
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app e almeno un negozio collegato (vedi `importa-negozi-da-finance.mjs` o la pagina Impostazioni)
- **Nota**: se si interrompe si può rilanciare — riprende senza duplicare. Per la sync quotidiana c'è il cron `/api/cron/sync`.

### importa-provenienza.ts — deluxy-orders
Riempie **da dove è arrivato ogni ordine** (Google Ads, ricerca, Meta, email, WhatsApp, ordine creato a mano…) sugli ordini già in archivio. Chiede a Shopify solo il percorso d'acquisto e scrive sei colonne: gli ordini nuovi se la portano dietro dalla sync di ogni notte, questo serve **una volta sola per lo storico**. Scrive una pagina alla volta con un `UPDATE … FROM (VALUES …)` e salta gli ordini il cui valore non cambia: è ripetibile.

```bash
# dalla radice del repo — tutti i negozi attivi
cd deluxy-orders && npm run importa:provenienza
# un negozio solo
cd deluxy-orders && npm run importa:provenienza -- Flowers
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app e i negozi collegati
- **Nota**: stampa il conteggio per canale a fine giro. Su 13.971 ordini reali (27/07/2026) restano 1.219 senza provenienza: Shopify non associa nessuna visita agli ordini creati a mano e a molti ordini vecchi — lì il canale resta vuoto invece di essere inventato.

### importa-mittente.ts — deluxy-orders
Riempie **chi manda** (nome, città, provincia, paese dall'indirizzo di fatturazione Shopify) sugli ordini già in archivio, e alla fine **ricalcola l'urgenza** di tutto lo storico (urgenza / pensiero / pianificato / evento). Come lo script della provenienza: una scrittura per pagina da 100, e salta gli ordini il cui valore non cambia, quindi è ripetibile.

```bash
# dalla radice del repo — tutti i negozi attivi
cd deluxy-orders && npm run importa:mittente
# un negozio solo
cd deluxy-orders && npm run importa:mittente -- Flowers
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app e i negozi collegati
- **Nota**: l'urgenza non chiede niente a Shopify (sono due date già in archivio), quindi quella parte è una query sola e dura pochi secondi. Serve per lo storico: gli ordini nuovi arrivano già classificati dalla sync di ogni notte.

### riconcilia-ordini.ts — deluxy-orders
Recupera la **città di consegna** per gli ordini che non ce l'hanno, leggendola dai **tag** dell'ordine o dal **nome del prodotto**, e ricalcola le categorie (che nella loro catena ora includono i tag). Non scrive mai nell'indirizzo: la deduzione va in un campo suo con la prova. Le città trovate nei titoli passano da una **controprova sui fatti** (quegli stessi prodotti, negli ordini indirizzati, dove sono andati davvero?).

```bash
# dalla radice del repo
cd deluxy-orders && npm run riconcilia
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: non chiama Shopify, dura una decina di secondi ed è ripetibile. Lo stesso si fa dal pulsante in Impostazioni.

### verifica-totali.ts — deluxy-orders
Confronta, negozio per negozio, quanti ordini ci sono **su Shopify** e quanti ne ha il registro Orders: serve a dimostrare che l'import è completo e allineato.

```bash
# dalla radice del repo
cd deluxy-orders && npm run verifica:totali
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app e i negozi collegati
- **Nota**: sola lettura, non modifica nulla.

### importa-negozi-da-finance.mjs — deluxy-orders
Copia i negozi Shopify già collegati in Deluxy Partner (Finance) dentro il registro Orders, così non si riconfigurano a mano le stesse credenziali in due app. Non stampa mai token o segreti.

```bash
# dalla radice del repo
cd deluxy-orders && npm run negozi:da-finance
```

- **Serve**: `DATABASE_URL` nel `.env` di Orders; il `.env` di Finance come sorgente (default `../deluxy-partner/.env`)

### sync-ordini.mjs — deluxy-orders
Avvia lo scarico degli ordini Shopify nel registro centralizzato Orders chiamando l'endpoint dell'app (utile per cron esterni o import manuale). Richiede una chiave di **scrittura**.

```bash
# dalla radice del repo — importa gli ultimi 90 giorni (default)
cd deluxy-orders && ORDERS_URL=<url-app> ORDERS_API_KEY=<chiave-scrittura> npm run sync
# numero di giorni personalizzato
cd deluxy-orders && ORDERS_URL=<url-app> ORDERS_API_KEY=<chiave-scrittura> npm run sync -- 30
```

- **Serve**: `ORDERS_API_KEY` (chiave di scrittura, da `npm run chiave -- <app> --scrittura`); opzionale `ORDERS_URL` (default `http://localhost:3150`)
- **Nota**: la sync non tocca la classificazione già impostata sugli ordini. In produzione c'è anche il cron notturno Vercel `/api/cron/sync` (protetto da `CRON_SECRET`).

### vendite-demo.mjs — deluxy-merchandising
Carica **vendite dimostrative** (180 giorni, con stagionalità settimanale e picchi San Valentino / festa della mamma / Natale) sui prodotti in assortimento: servono a vedere funzionare "Vendite & trend", le ipotesi di ordinativo e la lettura AI finché il collegamento a Deluxy Orders non è configurato.

```bash
# dalla radice del repo — carica le vendite dimostrative
cd deluxy-merchandising && npm run vendite:demo
# finestra diversa dai 180 giorni di default
cd deluxy-merchandising && node scripts/vendite-demo.mjs --giorni 90
# rimuove SOLO le righe dimostrative
cd deluxy-merchandising && npm run vendite:demo:pulisci
```

- **Serve**: `DATABASE_URL` (+ `DIRECT_URL`) nell'`.env` dell'app
- **Nota**: inserisce solo righe con `origine = "demo"` e non cancella nient'altro; se ce ne sono già non ne aggiunge (prima `--pulisci`). Il venduto **vero** non passa da qui: arriva da Deluxy Orders con `ORDERS_API_KEY`.

### prodotti-da-vendite.mjs — deluxy-merchandising
Crea il **catalogo prodotti dal venduto reale** già importato da Deluxy Orders: un prodotto per ogni titolo venduto, con le varianti prese dagli SKU e dai nomi di variante scelti dai clienti, e le vendite in archivio agganciate. Serve quando Merchandising ha un catalogo più povero di quello che si vende davvero sui negozi: senza prodotti anagrafati, trend e ipotesi di ordinativo vedono solo i totali.

```bash
# dalla radice del repo — anteprima, senza scrivere niente
cd deluxy-merchandising && npm run prodotti:da-vendite -- --dry
# crea tutto il venduto
cd deluxy-merchandising && npm run prodotti:da-vendite
# solo i titoli venduti almeno 5 volte
cd deluxy-merchandising && npm run prodotti:da-vendite -- --min 5
```

- **Serve**: `DATABASE_URL` (+ `DIRECT_URL`) nell'`.env` dell'app e vendite già importate (quindi `ORDERS_API_KEY`)
- **Nota**: prezzo = media davvero incassata; **costo 0**, categoria `DA_CLASSIFICARE` e giacenza 0 restano da compilare a mano — non si deducono dal titolo, e finché il costo manca il margine resta 0 invece di essere inventato.

### google-ads-script.js — deluxy-marketing (v2)
NON si lancia da terminale: si **incolla in Google Ads** (Strumenti → Azioni collettive → Script), una copia per account **e per lavoro**. Google Ads esegue sempre `main()`: il lavoro si sceglie con la costante `AZIONE` in testa al file — `metriche` (giornaliere, ogni giorno 23-24) · `approvazioni` (stati di review, alert A4, ogni giorno) · `copy` (keyword+annunci, ogni settimana) · `gruppi` (gruppi di annunci, una riga per giorno, e gruppi di asset per le PMax) · `asset` (sitelink/callout/snippet/immagini, ogni settimana) · `esegui` (esegue le operazioni **approvate** in /operazioni: pausa, budget, keyword, negative, campagne nuove in pausa via bulk upload) · `tutto`.

- **Serve**: in testa al file `URL_APP` (l'app in produzione), `CHIAVE_API` (da `npm run chiave -- google-ads-<brand>`), `AZIONE` e `BRAND` (`flowers` | `gifts` | `cake`: senza, le campagne il cui nome non dice il marchio finiscono in "cross")
- **Primo caricamento storico**: `GIORNI_INDIETRO = 400` + `INCLUDI_RIMOSSE = true`, una esecuzione sola, poi si rimette 7 / false
- **Nota**: la scrittura passa SOLO dalla coda approvata a mano nell'app; lo script non decide nulla da solo. In anteprima non manda niente all'app (Google blocca le modifiche ma non le chiamate a internet)

### prova-google-ads-script.js — deluxy-marketing
Banco di prova dello script sopra: finge Google Ads e l'app, e verifica somme delle keyword, accorpamento degli asset, blocchi che si dimezzano sui timeout, guardie della scrittura (budget condivisi, salti di budget, esiti non registrati) e modalità anteprima.

```bash
cd deluxy-marketing && node scripts/prova-google-ads-script.js
```

- **Serve**: niente (nessuna rete, nessun database)

## 4. Setup e configurazione

### chiave.mjs — deluxy-marketing
Crea una chiave API per le API `/api/v1` dell'app Marketing (le usano le sessioni Claude ADV per depositare analisi, azioni e metriche).

```bash
# dalla radice del repo — lettura + scrittura (default)
cd deluxy-marketing && npm run chiave -- <nome-client>
# sola lettura
cd deluxy-marketing && npm run chiave -- <nome-client> --sola-lettura
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: la chiave (`dmk_...`) viene stampata **una sola volta** — nel database resta solo lo SHA-256. Header: `x-api-key`.

### crea-chiave.mjs — deluxy-anagrafiche
Crea (o rigenera) una chiave API per un'app client del registro anagrafiche.

```bash
# dalla radice del repo — sola lettura
cd deluxy-anagrafiche && npm run chiave -- <nome-app>
# lettura + scrittura (solo per la piattaforma consegne)
cd deluxy-anagrafiche && npm run chiave -- deluxy-platform --scrittura
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: la chiave (`dlxk_...`) viene stampata **una sola volta** — nel database resta solo lo SHA-256. Copiarla subito nel `.env` dell'app client come `ANAGRAFICHE_API_KEY`. Rilanciarlo sullo stesso nome **rigenera** la chiave e invalida la precedente. L'unica app che deve avere `--scrittura` è `deluxy-platform-next`.

### permessi-chiave.mjs — deluxy-anagrafiche
Cambia i **permessi** di una chiave che esiste già, **senza rigenerarla**: `crea-chiave.mjs` rifà anche il segreto, quindi per aggiungere uno scope a una chiave in uso bisognerebbe reincollarla ovunque.

```bash
# dalla radice del repo — mostra i permessi
cd deluxy-anagrafiche && node --env-file=.env scripts/permessi-chiave.mjs app-ai-mail
# rende la chiave un driver di PRIMA PARTE (può dichiarare stato e interessi)
cd deluxy-anagrafiche && node --env-file=.env scripts/permessi-chiave.mjs app-ai-mail --scrittura-partner
# e per toglierlo
cd deluxy-anagrafiche && node --env-file=.env scripts/permessi-chiave.mjs app-ai-mail --no-scrittura-partner
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: senza scope indicati **mostra e basta**. Non stampa mai la chiave: solo nome e permessi. ⚠️ `--scrittura-partner` non è un dettaglio: stato commerciale e interessi sono i campi «curati dal team», e da quel momento l'app li può scrivere.

### crea-chiave.mjs — deluxy-orders
Crea (o rigenera) una chiave API per un'app client del registro ordini Orders.

```bash
# dalla radice del repo — sola lettura
cd deluxy-orders && npm run chiave -- <nome-app>
# lettura + scrittura (può riclassificare via PATCH e avviare la sync)
cd deluxy-orders && npm run chiave -- deluxy-partner --scrittura
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: la chiave (`dlxo_...`) viene stampata **una sola volta** — nel database resta solo lo SHA-256. Copiarla nel `.env` dell'app client come `ORDERS_API_KEY`.

### genera-segreti.mjs — deluxy-transactions
Stampa i segreti dell'app pagamenti da mettere in `.env` (locale) e su Vercel. Non scrive niente su disco.

```bash
cd deluxy-transactions && npm run segreti
```

- **Serve**: niente
- **Nota**: `TRANSACTIONS_ENC_KEY` **non si cambia più** dopo il primo avvio — i segreti già cifrati (secondi fattori, chiavi HMAC delle app) non si rileggerebbero.

### crea-operatore.mjs — deluxy-transactions
Crea un operatore che può autorizzare pagamenti. Serve almeno una volta, per il primo amministratore.

```bash
cd deluxy-transactions && npm run operatore -- --email tu@deluxy.it --nome "Nome Cognome" --password "<almeno 12 caratteri>" --ruolo admin
```

- **Serve**: `DATABASE_URL` e `TRANSACTIONS_ENC_KEY` nel `.env` dell'app
- **Nota**: stampa **una sola volta** il segreto TOTP da inserire nell'app di autenticazione. Senza quel codice non si entra e non si firma. Ruoli: `admin` | `approvatore` | `osservatore`.

### crea-chiave.mjs — deluxy-transactions
Autorizza un'app Deluxy a **chiedere** pagamenti (non ad approvarli: quello lo fa solo una persona).

```bash
cd deluxy-transactions && npm run chiave -- --nome deluxy-messaging --tetto 2000 --tetto-giorno 10000 [--ip 1.2.3.4]
```

- **Serve**: `DATABASE_URL` e `TRANSACTIONS_ENC_KEY` nel `.env` dell'app
- **Nota**: stampa **una sola volta** `TRANSACTIONS_API_KEY` e `TRANSACTIONS_HMAC_SECRET`. Servono entrambe: la chiave identifica, il segreto firma ogni chiamata. Metterle nella cassaforte del Hub sotto il progetto dell'app che le userà. I tetti sono in euro.

### configura-db-condiviso.mjs — deluxy-scripts
Scrive il `.env` di Deluxy Scripts copiando `DATABASE_URL` e `DIRECT_URL` dall'env di un'altra app Deluxy (stesso cluster Postgres) e forzando `schema=scripts`. Conserva le altre variabili già presenti e non stampa mai le stringhe di connessione.

```bash
# dalla radice del repo
cd deluxy-scripts && npm run configura-db -- ../deluxy-orders/.env
```

- **Serve**: un file env sorgente che contenga `DATABASE_URL` e `DIRECT_URL`

### crea-chiave.mjs — deluxy-scripts
Crea (o rigenera) la chiave API con cui un'app legge i propri script dall'archivio.

```bash
# dalla radice del repo
cd deluxy-scripts && npm run chiave -- <nome-app>
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: la chiave (`dlxs_...`) viene stampata **una sola volta** — nel database resta solo lo SHA-256. Copiarla nel `.env` dell'app client come `SCRIPTS_API_KEY`.

### seed-app.mjs — deluxy-scripts
Popola il registro delle destinazioni per cui uno script può essere abilitato: le app Deluxy più Google Ads e Shopify.

```bash
# dalla radice del repo
cd deluxy-scripts && npm run seed:app
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: idempotente — le app già presenti non vengono toccate (nome e colore modificati a mano restano).

### configura-db-condiviso.mjs — deluxy-orders
Scrive il `.env` di Orders copiando `DATABASE_URL` e `DIRECT_URL` dall'env di un'altra app Deluxy (stesso cluster Postgres) e forzando `schema=orders`. Conserva le altre variabili già presenti.

```bash
# dalla radice del repo
cd deluxy-orders && node scripts/configura-db-condiviso.mjs ../deluxy-partner/.env
```

- **Serve**: un file env sorgente che contenga `DATABASE_URL` e `DIRECT_URL`
- **Nota**: non stampa mai le stringhe di connessione.

### configura-db-condiviso.mjs — deluxy-anagrafiche
Scrive il `.env` dell'app copiando `DATABASE_URL` e `DIRECT_URL` dall'env di un'altra app Deluxy (stesso cluster Postgres) e forzando `schema=anagrafiche`.

```bash
# dalla radice del repo
cd deluxy-anagrafiche && node scripts/configura-db-condiviso.mjs ../deluxy-hub/.env.vercel-prod
```

- **Serve**: un file env sorgente che contenga `DATABASE_URL` e `DIRECT_URL`
- **Nota**: **sovrascrive** `deluxy-anagrafiche/.env`. Non stampa mai le stringhe di connessione.

### create-user.mjs — deluxy-scout
Crea (o aggiorna la password di) un utente di login dell'app in Supabase Auth, già confermato.

```bash
# dalla radice del repo
cd deluxy-scout && SUPABASE_URL=<url> SUPABASE_SERVICE_ROLE_KEY=<service_role> SCOUT_EMAIL=<nome@deluxy.it> SCOUT_PASSWORD=<password> node scripts/create-user.mjs
```

- **Serve**: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase Dashboard → Project Settings → API), `SCOUT_EMAIL`, `SCOUT_PASSWORD` (min 6 caratteri, scelta dall'utente)
- **Nota**: idempotente — se l'utente esiste ne aggiorna la password e lo conferma. La password la sceglie e la digita l'utente: non deve mai passare per l'agente né finire in un file.

### hubspot-setup-properties.mjs — deluxy-scout
Crea su HubSpot le proprietà custom Deluxy su Company (`deluxy_linea`, `deluxy_priorita`) e Deal (`deluxy_linea`, `deluxy_briefing`, `deluxy_note_post`, `deluxy_esito_analisi`, `deluxy_next_step`).

```bash
# dalla radice del repo
cd deluxy-scout && HUBSPOT_TOKEN=<token-privato> node scripts/hubspot-setup-properties.mjs
```

- **Serve**: `HUBSPOT_TOKEN` (HubSpot → Impostazioni → Integrazioni → App private)
- **Nota**: idempotente — le proprietà già esistenti vengono saltate. Attenzione: qui la variabile si chiama `HUBSPOT_TOKEN`, mentre in `deluxy-anagrafiche` la stessa credenziale si chiama `HUBSPOT_ACCESS_TOKEN`.

### carica-guida-cs.mjs — deluxy-messaging
Carica nell'app la parte della **Guida Customer Service Deluxy** che serve a rispondere ai clienti: le **risposte pronte** (Script) coi fatti dichiarabili, le **istruzioni** di tono per brand e canale, e il **documento** di riferimento da cui risalire a ogni regola.

```bash
cd deluxy-messaging && node scripts/carica-guida-cs.mjs --esegui
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: senza `--esegui` non scrive. Idempotente: riconosce Script e Istruzioni dal titolo e li aggiorna invece di duplicarli — per correggere un testo si modifica **dentro lo script** e si rilancia. ⚠️ La divisione non è arbitraria: l'AI delle risposte rapide **non può inventare fatti**, prende il contenuto da uno Script e ne cambia solo la forma seguendo le Istruzioni (prompt in `src/lib/ai.ts`) — quindi ciò che si può *dire* va negli Script, non nelle Istruzioni. Restano **fuori** operatività interna, listini, partner, ricarichi e margini, e i punti su cui i documenti sorgente si contraddicono (numero Postepay, soglie di feedback, link recensioni, compensazioni, orari di contatto): su quelli c'è un'istruzione che vieta di rispondere. Eseguito il 30/07/2026: 27 risposte pronte, 12 istruzioni, 1 documento.

### chiudi-consegne-passate.mjs — deluxy-messaging
Segna come **gestiti** gli ordini la cui consegna è già passata: `gestione` è arrivata dopo, e nessuno è tornato a spuntare i vecchi — con quelli in mezzo, «ordini da gestire» non è un numero di lavoro ma archeologia, e la bacheca delle priorità mente.

```bash
cd deluxy-messaging && node scripts/chiudi-consegne-passate.mjs
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: **senza `--esegui` non scrive niente** — lanciarlo così, guardare il numero, poi rilanciare con `--esegui`. `--giorni N` sposta il confine (default 1 = «prima di ieri»; ieri e oggi restano lavoro aperto). Non tocca gli ordini **senza data di consegna** (non si sa se sono passati) né lo stato della pipeline di Deluxy Orders. Scrive `gestioneDaNome = "Chiusura automatica · consegna passata"` e non il nome di una persona: quel campo dice chi ha spuntato l'ordine, e una firma falsa in un registro di chi-ha-fatto-cosa è peggio del campo vuoto. ⚠️ Scrive in **produzione**. Eseguito il 29/07/2026: **603 ordini chiusi**, restano 304 da gestire (286 dei quali senza data di consegna).

### stato-whatsapp.mjs — deluxy-messaging
Dice **cosa manca perché un numero WhatsApp riceva**: numeri in tabella, credenziali presenti o assenti, ultima chiamata del webhook e — se il token è leggibile — cosa risponde Meta su quei numeri e quali app sono iscritte al WhatsApp Business Account.

```bash
# dalla radice del repo
cd deluxy-messaging && node scripts/stato-whatsapp.mjs
```

- **Serve**: `DATABASE_URL` e `APP_SECRET` nel `.env` dell'app
- **Nota**: sola lettura, non scrive niente. Dei segreti stampa solo «presente/MANCA». ⚠️ Se l'`APP_SECRET` locale non è quello di Vercel, i token salvati dall'app in produzione risultano **illeggibili** e la parte su Meta non parte: è un disallineamento di ambiente, non un token sbagliato.

### token-instagram.mjs — deluxy-messaging
Tira fuori i dati da incollare in `/account-meta`: per ogni Pagina Facebook l'id, l'**ID dell'account Instagram**, il `@nome utente`, il **Page Access Token** e se l'app è già iscritta agli eventi.

```bash
cd deluxy-messaging && node scripts/token-instagram.mjs --mostra-token
```

- **Serve**: `META_TOKEN` nel `.env` dell'app — il token dell'**utente di sistema** (Business Manager → Impostazioni azienda → Utenti → Utenti di sistema → Genera token) con `pages_show_list`, `pages_messaging`, `pages_manage_metadata`, `instagram_basic`, `instagram_manage_messages`
- **Nota**: un «token Instagram» non esiste — Instagram Messaging usa il Page Access Token della Pagina collegata. Sola lettura: non iscrive la Pagina e non tocca il database. Senza `--mostra-token` i token restano mascherati (usalo nel tuo terminale, non in una sessione condivisa). Se non vede nessuna Pagina, all'utente di sistema è stato assegnato solo il WhatsApp Business e non la Pagina.

---

## 5. Asset e documenti

### gen-icons.mjs — deluxy-scout
Genera icona, adaptive icon, splash e favicon di Scout (pin oro su navy) in `assets/`.

```bash
# dalla radice del repo
cd deluxy-scout && node scripts/gen-icons.mjs
```

- **Serve**: niente (richiede la dipendenza dev `sharp`)
- **Nota**: sovrascrive `assets/icon.png`, `adaptive-icon.png`, `splash-icon.png`, `favicon.png` e i due `.svg` sorgente.

### genera-icone.mjs — deluxy-mail
Genera le icone PWA/APK di AI Mail (la "D" oro su tessera scura) in `public/`.

```bash
# dalla radice del repo
cd deluxy-mail && node scripts/genera-icone.mjs
```

- **Serve**: niente (usa `sharp`, che arriva con Next.js)
- **Nota**: nome simile a `gen-icons.mjs` di Scout ma **non è un duplicato**: app, marchio e file di output sono diversi. Riscrive `public/icon-192.png` e `public/icon-512.png`.

### esporta-vcard-google.mjs — deluxy-anagrafiche
Esporta le anagrafiche attive come vCard 3.0 importabile in Google Contacts (contacts.google.com → Importa).

```bash
# dalla radice del repo
cd deluxy-anagrafiche && npm run export:vcard
# con percorso di output personalizzato
cd deluxy-anagrafiche && npm run export:vcard -- C:/Users/nicol/Downloads/contatti.vcf
```

- **Serve**: `DATABASE_URL` nel `.env` dell'app
- **Nota**: senza argomenti scrive in `C:/Users/nicol/Downloads/Deluxy-Anagrafiche-Contatti.vcf` (percorso hardcodato nel default). Il file contiene dati personali dei referenti: non committarlo.

### build-doc-word.mjs — deluxy-platform-next
Rigenera il manuale Word `docs/COME-FUNZIONA-APP-DELUXY.docx` a partire dal Markdown `docs/COME-FUNZIONA-APP-DELUXY.md`.

```bash
# dalla radice del repo
cd deluxy-platform-next && npm run doc:word
```

- **Serve**: niente (opzionale `DOC_DATE` per forzare la data in intestazione)
- **Nota**: regola di lavoro — va rigenerato **a ogni commit che cambia il `.md`**.

---

## 6. Avvio locale e verifiche

Una riga per app; il `cd` parte dalla radice del repo.

| App | Porta | Comandi |
| --- | --- | --- |
| deluxy-hub | 3050 | `cd deluxy-hub && npm run dev` · `npm run build` · `npm start` · `npm run db:push` · `npm run db:seed` |
| deluxy-partner | 3040 | `cd deluxy-partner && npm run dev` · `npm run build` · `npm start` · `npm run db:push` · `npm run db:seed` · `npm run sync:stato-analisi` |
| deluxy-anagrafiche | 3060 | `cd deluxy-anagrafiche && npm run dev` · `npm run build` · `npm start` · `npm run db:push` · `npm run chiave -- <app>` · `npm run import:excel` · `npm run import:hubspot-contatti` · `npm run export:vcard` |
| deluxy-mail | 3070 | `cd deluxy-mail && npm run dev` · `npm run build` (include la migrazione) · `npm start` · `npm run db:push` · `npm run db:seed` |
| deluxy-budgets | 3080 | `cd deluxy-budgets && npm run dev` · `npm run build` · `npm start` · `npm run typecheck` · `npm run db:push` · `npm run db:seed` |
| deluxy-scripts | 3170 | `cd deluxy-scripts && npm run dev` · `npm run build` · `npm start` · `npm run typecheck` · `npm run db:push` · `npm run configura-db -- <env>` · `npm run chiave -- <app>` · `npm run seed:app` |
| deluxy-orders | 3150 | `cd deluxy-orders && npm run dev` · `npm run build` · `npm start` · `npm run db:push` · `npm run chiave -- <app> [--scrittura]` · `npm run negozi:da-finance` · `npm run import:storico` · `npm run verifica:totali` · `npm run importa:provenienza` · `npm run importa:mittente` · `npm run riconcilia` · `npm run sync` |
| deluxy-scout (Expo) | — | `cd deluxy-scout && npm start` · `npm run web` · `npm run android` · `npm run ios` · `npm run build:web` · `npm run typecheck` · `npm test` · `npm run lint` · `npm run import:places -- <file.csv>` |
| deluxy-platform-next | API + web | `cd deluxy-platform-next && npm run dev:api` · `npm run dev:web` · `npm run build` · `npm run prisma:generate` · `npm run prisma:migrate` · `npm run seed` · `npm run doc:word` |

> `deluxy-search-supplier/` si sviluppa e si pubblica dal branch `main` (progetto Vercel `search-deluxy`, Root Directory `deluxy-search-supplier`): i suoi comandi non sono elencati qui perché su questo branch la cartella non ha un `package.json`.

---

## Link per i token

| Credenziale | Dove si prende |
| --- | --- |
| `SUPABASE_PAT` (Supabase access token / Management API) | https://supabase.com/dashboard/account/tokens |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase Dashboard → Project Settings → API |
| `VERCEL_TOKEN` | https://vercel.com/account/tokens |
| Chiave API Deluxy Partner | https://deluxy-partner.vercel.app/impostazioni |
| `ANAGRAFICHE_API_KEY` (registro Anagrafiche) | Si **genera** con `npm run chiave -- <nome-app>` in `deluxy-anagrafiche` (vedi sezione 4) |
| `HUBSPOT_TOKEN` / `HUBSPOT_ACCESS_TOKEN` | HubSpot → Impostazioni → Integrazioni → App private |
| Chiave Google Geocoding | Google Cloud Console → API e servizi → Credenziali (in Scout è nel `.env` come `EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`) |

**Mai incollare i valori di queste credenziali in un file del repo.**
