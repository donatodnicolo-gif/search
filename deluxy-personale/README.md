# Deluxy Personale

**La casa dei dati HR dell'ecosistema Deluxy** (Standard §7): organico, funzioni
e mansioni con le loro attività (mansionario), organigramma, inquadramenti
contrattuali e retribuzioni. Modellata sulle app di gestione del personale
(Factorial/Personio): anagrafica → organizzazione → contratto → compenso,
con inquadramento e retribuzione tenuti **come storia** (ogni variazione è una
riga con la sua decorrenza; il "corrente" è l'ultima decorrenza non futura).

- Porta di sviluppo: **3200** · Schema Postgres: **`personale`** (cluster condiviso)
- Produzione: **https://deluxy-personale.vercel.app** (Vercel, region `fra1`)
- UI: Deluxy Design System v1.0 (sidebar da gestionale, token in `src/app/tokens.css`)

## Dove siamo (26/08/2026)

- ✅ App completa e in produzione: Persone (elenco + KPI), scheda persona
  (dati, mansioni, **mansionario personale**, storico inquadramenti, storico
  retribuzioni, cessazione), Organigramma (albero dei riporti, **costruibile
  dalla pagina**: menu «riporta a» su ogni scheda, salvataggio immediato,
  anti-ciclo sia nel menu sia nella server action), Funzioni e mansioni
  (mansionario di ruolo — **e dal 24/08 le persone si assegnano anche da lì**:
  menu su ogni funzione per aggiungere/spostare una persona, menu «Assegna a…»
  su ogni mansione, rimozioni al volo con conferma), Stipendi, Inquadramenti,
  Chiavi delle app.
- ✅ **Mansionario personale** (24/08): su ogni scheda la lista delle cose che
  la persona fa davvero (attività + dettaglio + frequenza), tabella
  `AttivitaPersona`; sotto, in sola lettura, le attività-tipo delle mansioni
  assegnate. Esce anche da `/api/v1/persone` (campo `mansionario`).
- ✅ `/api/health` pubblico con `SELECT 1` vero (convenzione Hub).
- ✅ `/api/v1` di sola lettura con chiave (`x-api-key`): `team` (stesso formato
  del team di Budgets), `persone`, `funzioni`, `organigramma`.
- ✅ Tessera nel catalogo del Hub (`personale`, `sso: true`).
- ✅ **Organico importato dal roster 2026 di Budgets** (24/08): 3 funzioni
  (Maison, Commerciale, Operation coi responsabili), 11 persone, e — secondo
  giro, stesso giorno — **inquadramenti e retribuzioni COME DICHIARATI**:
  l'API di Budgets è stata estesa apposta (`?compensi=1` ora espone importo,
  superminimo, periodicità, contributi, mensilità e il `lordoAnnuo` calcolato
  con la SUA regola). Stagista → stage; Dipendente e Consulente restano col
  nome dichiarato («da precisare»: la forma legale non è nel roster e non si
  inventa). Decorrenza = primo mese a budget; chi parte a settembre compare
  come «decorre dal 01/09» (badge blu), non come «da inquadrare».
  Script `scripts/importa-da-budgets.mjs` (prova a vuoto di default, `scrivi`
  per applicare; idempotente: persone per nome normalizzato, contratti solo
  per chi non ne ha). Il netto non viaggia mai. Dopo le tre cessazioni il
  monte RAL correnti è **113.750 € su 5 persone** (8 attivi: Eva, Luca Salso
  e Martina Calia decorrono dal 01/09, quindi oggi non contano nei correnti).
- ✅ **I tipi di Budgets sono selezionabili** (24/08, richiesta dell'utente):
  «Dipendente» e «Consulente» sono tipi di prima classe del vocabolario
  (niente più suffisso «da precisare»); chi vuole la forma legale precisa
  sceglie indeterminato/determinato/apprendistato. L'organigramma marca con
  «dal gg/mm» chi ha il contratto che decorre in futuro.
- ✅ **Benefit per persona (26/08)**: pagina **/benefit** con la tabella
  persone attive × tipi di benefit (spunta, dettaglio, valore mensile, «dal»,
  rimozione al volo) e i totali che dichiarano quanti benefit hanno il valore.
  Il VOCABOLARIO dei tipi lo governa l'amministratore dalla stessa pagina:
  i quattro di base (buoni pasto, cellulare, PC, auto aziendale) nascono con
  un click, gli altri si aggiungono a piacere; un tipo assegnato a qualcuno
  non si elimina. L'assegnazione si fa anche dalla scheda della persona
  (card «Benefit», con matita per modificare dettaglio/valore/data), e
  l'elenco Persone ha la colonna Benefit (tipo · dettaglio, una riga l'uno).
  Il valore mensile si DICHIARA (mai dedotto) e via `/api/v1/persone` esce
  l'elenco dei benefit — il valore solo con `?compensi=1`, come gli stipendi.
- ✅ **Le tre uscite del roster sono CESSATE** (verificato sul vivo il 26/08):
  Andrea Bellazzi al 30/06, **Carine Turchiello al 31/07** (data reale scelta
  dall'utente: un mese DOPO la scadenza 30/06 dedotta dal roster — conferma
  che la scadenza a budget è un indizio, non la data d'uscita), Giada Lo Proto
  al 31/05. Fatte dal form «Cessazione» della scheda (reversibili con
  «Riattiva»); i loro importi sono usciti dai totali di /stipendi.
- 🔴 Da completare a mano: CCNL/livello/qualifica, i netti se li si vuole a
  registro, e i «riporta a» dell'organigramma (si montano dalla sua pagina).
  **I mesi dichiarati sono anche il periodo del contratto** (24/08, terzo
  giro): chi finisce prima di dicembre ha la **scadenza** all'ultimo giorno
  dell'ultimo mese; chi arriva a dicembre resta senza scadenza (lì finisce il
  roster, non per forza il contratto).

## Le regole che l'app rispetta

1. **Nessun dato dedotto.** Il netto in busta si scrive se lo si conosce, mai
   calcolato dal lordo. Il costo azienda esiste solo se la % contributi è
   dichiarata: altrimenti è «non calcolabile», non zero. **Eccezione
   dichiarata — gli AUTONOMI** (Partita IVA, Consulente): non hanno RAL ma un
   **compenso** (niente mensilità né netto), e il costo azienda è il compenso
   stesso anche senza percentuale — su una fattura non ci sono oneri
   datoriali nascosti; gli oneri pattuiti in più (es. rivalsa) si dichiarano.
   La co.co.co. resta nel mondo RAL+contributi (gestione separata).
2. **I totali dichiarano chi manca.** Il monte RAL e il costo azienda sommano
   solo chi ha il dato, e la pagina elenca gli esclusi.
3. **La storia non si riscrive.** Aumenti e cambi contratto sono righe nuove;
   una persona si **cessa** (con data), non si elimina.
4. **Gli utenti vivono nel Hub.** Qui nessuna tabella utenti e nessuna query
   cross-schema su `hub."Utente"` (la violazione trovata dall'audit in
   Tasks/Calendario non si ripete): si entra con la password d'app o via SSO.
5. **I task operativi vivono in Deluxy Tasks.** Le "attività" qui sono il
   mansionario (cosa comporta una mansione), non le cose da fare.

## Il ponte verso Budgets (24/08)

Quando qui si **pubblica una persona nuova**, l'app la **propone anche al
roster di Budgets** (`POST /api/v1/persone` di Budgets, chiave
`BUDGETS_WRITE_KEY` con scope scrittura): là nasce come seme — tipo
DIPENDENTE, importo 0 (non sposta il P&L), team agganciato per nome, nota che
dichiara la provenienza. Budgets resta il proprietario del suo roster: mai
aggiornamenti o cancellazioni da qui, e se il nome là esiste già non si tocca.
Il ponte non blocca mai la creazione locale: l'esito (proposta / già presente
/ fallita e perché) compare come avviso sulla scheda appena creata.

## Cartellini e rapporto al commercialista (25/08)

La pagina **/cartellini** legge timbrature e assenze del mese **dal Hub**
(`GET /api/presenze?mese=YYYY-MM`, token di servizio con scope «personale»):
i numeri sono ESATTAMENTE quelli della schermata Cartellino del Hub, perché il
Hub impagina anche il rapporto (oggetto + testo + HTML) con la stessa funzione
della sua email. Da qui il rapporto **parte via AI Mail** al commercialista
per le buste paga (destinatario precompilabile con `COMMERCIALISTA_EMAIL`,
nota libera in testa, anteprima del testo prima dell'invio; la copia resta
negli «Inviati» della casella). Env: `HUB_URL`+`HUB_KEYS_TOKEN` (emesso),
`MAIL_URL`+`MAIL_UTENTE` (impostati) e 🔴 **`MAIL_API_KEY` da incollare**
(verificato il 26/08: ancora assente dalle env di produzione) — il
token esiste già in AI Mail (Impostazioni App → «Token API di AI Mail»):
finché manca, la pagina mostra i cartellini e dichiara che l'invio è spento.

## Confini col resto dell'ecosistema

| Dato | Casa | Nota |
|---|---|---|
| Organico reale, mansionari, organigramma, inquadramenti, retribuzioni | **questa app** | le altre leggono via `/api/v1` |
| Budget del personale per anno | `deluxy-budgets` | pianificazione; può leggere i reali da qui |
| Utenti, ruoli, SSO | `deluxy-hub` | l'email della persona è il ponte |
| Attività operative | `deluxy-tasks` | |

## API per le altre app

Autenticazione: header `x-api-key` (o `Authorization: Bearer`). Le chiavi si
creano dalla pagina **/chiavi** (o `npm run chiave -- <nome-app>`): in database
resta solo lo SHA-256, il valore si vede una volta sola. CORS aperto su
`/api/v1`; `/api/*` è fuori dal middleware di sessione.

- `GET /api/health` — pubblico: `{ ok, app, database }` con `SELECT 1` vero.
- `GET /api/v1/team[?compensi=1]` — funzioni come squadre + persone, stesso
  formato del `/api/v1/team` di Budgets (il Hub lo sa già leggere).
- `GET /api/v1/persone[?stato=attivo|cessato|tutti][&compensi=1]` — schede
  complete, benefit compresi (il loro valore mensile solo con `compensi=1`).
- `GET /api/v1/funzioni` — funzioni → mansioni → attività, con chi le copre.
- `GET /api/v1/organigramma` — albero dei riporti.

⚠️ **Gli stipendi escono SOLO con `?compensi=1`** (e mai il netto): sono dati
sensibili, chi li vuole li chiede esplicitamente e si vede nei log. La chiave
va trattata come un segreto: cassaforte del Hub (`/chiavi` nel Hub), mai file
committati.

## Variabili d'ambiente

| Nome | Cosa |
|---|---|
| `DATABASE_URL` | pooler (6543) con `?pgbouncer=true&connection_limit=1&schema=personale` |
| `DIRECT_URL` | diretta (5432) con `?schema=personale`, per `db push` |
| `PERSONALE_APP_PASSWORD` | password della UI. **In produzione obbligatoria: senza, il middleware risponde 503 (fail-closed)** |
| `PERSONALE_SESSION_SECRET` | firma del cookie di sessione (min 32 caratteri) |
| `HUB_SSO_SECRET` | uguale al Hub per il SSO; se manca si degrada al login |

In sviluppo locale senza password/segreto la UI è aperta in vista admin.

## Comandi

```bash
npm install
npm run db:condiviso -- ../deluxy-calendario/.env   # scrive .env con schema=personale
npm run db:push
npm run dev                                          # http://localhost:3200
npx tsc --noEmit && npm run build                    # prima di ogni commit
npx vercel deploy --prod --yes                       # deploy (dalla cartella dell'app)

# Import organico dal roster di Budgets (prova a vuoto; aggiungi "scrivi" per applicare)
node scripts/importa-da-budgets.mjs --chiave-da ../percorso/di/un/.env-con-BUDGETS_API_KEY
```

## Cosa manca / prossimi passi

- 🔴 Incollare la chiave `deluxy-hub` nella cassaforte del Hub e (facoltativo)
  puntare l'organico del Hub a questa app invece che a Budgets — decisione da
  prendere con l'utente: oggi il Hub legge il roster di Budgets.
- `HUB_SSO_SECRET` in produzione: il valore del Hub è una env Sensitive
  illeggibile; finché non lo si reincolla a mano il salto dal Hub chiede la
  password dell'app (degrado previsto).
- Eventuale scrittura via API (oggi solo letture: una chiave `scrittura` non ha
  niente da scrivere).
