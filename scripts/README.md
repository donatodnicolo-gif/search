# Script operativi del repo Deluxy — catalogo unico

Questa cartella **non contiene script**: è l'**indice** di tutti gli script operativi del repo, che restano nella cartella della loro app (`<app>/scripts/`). Per ogni script trovi cosa fa, il comando pronto da copiare e le variabili d'ambiente che richiede.

> **Regola: ogni nuovo script va aggiunto qui**, nella sezione della sua tipologia, nello stesso commit che lo introduce.

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

### npm — migrazioni per app

| App | Comando |
| --- | --- |
| deluxy-anagrafiche · hub · partner · budgets · mail | `cd <app> && npm run db:push` (applica lo schema Prisma) |
| deluxy-hub · partner · budgets | `cd <app> && npm run db:seed` |
| deluxy-mail | `cd deluxy-mail && npm run db:seed` (usa `--env-file=.env`) |
| deluxy-platform-next | `cd deluxy-platform-next && npm run prisma:generate` · `npm run prisma:migrate` · `npm run seed` (workspace `api`; in produzione `npm run prisma:deploy -w api`) |

---

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

---

## 4. Setup e configurazione

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
