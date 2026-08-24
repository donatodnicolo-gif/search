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

## Dove siamo (24/08/2026)

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
  per chi non ne ha). Monte RAL correnti: 176.150 € su 8 persone (3 decorrono
  da settembre); il netto non viaggia mai.
- ✅ **I tipi di Budgets sono selezionabili** (24/08, richiesta dell'utente):
  «Dipendente» e «Consulente» sono tipi di prima classe del vocabolario
  (niente più suffisso «da precisare»); chi vuole la forma legale precisa
  sceglie indeterminato/determinato/apprendistato. L'organigramma marca con
  «dal gg/mm» chi ha il contratto che decorre in futuro.
- ✅ **Cessato Andrea Bellazzi al 30/06/2026** (periodo dichiarato finito,
  richiesta «mostra solo gli attivi»). 🔴 Restano da cessare **Carine
  Turchiello (30/06)** e **Giada Lo Proto (31/05)**: il permesso di scrivere
  quelle due cessazioni è stato negato dal classificatore — si fanno in due
  click dalla loro scheda, form «Cessazione» (reversibile con «Riattiva»).
- 🔴 Da completare a mano: CCNL/livello/qualifica, i netti se li si vuole a
  registro, e i «riporta a» dell'organigramma (si montano dalla sua pagina).
  ❓ **I mesi dichiarati sono anche il periodo del contratto** (24/08, terzo
  giro): chi finisce prima di dicembre ha la **scadenza** all'ultimo giorno
  dell'ultimo mese — Bellazzi e Turchiello al 30/06, Lo Proto al 31/05, oggi
  segnalati «scaduto» in cima a /inquadramenti. Chi arriva a dicembre resta
  senza scadenza (lì finisce il roster, non per forza il contratto). Se i tre
  «scaduti» sono usciti davvero, vanno cessati dalla loro scheda; finché sono
  attivi, i loro importi restano nei totali di /stipendi.

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
- `GET /api/v1/persone[?stato=attivo|cessato|tutti][&compensi=1]` — schede complete.
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
