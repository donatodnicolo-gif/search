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
  (dati, mansioni, storico inquadramenti, storico retribuzioni, cessazione),
  Organigramma (albero dei riporti), Funzioni e mansioni (mansionario),
  Stipendi (quadro con totali dichiarati), Inquadramenti (scadenze in testa),
  Chiavi delle app.
- ✅ `/api/health` pubblico con `SELECT 1` vero (convenzione Hub).
- ✅ `/api/v1` di sola lettura con chiave (`x-api-key`): `team` (stesso formato
  del team di Budgets), `persone`, `funzioni`, `organigramma`.
- ✅ Tessera nel catalogo del Hub (`personale`, `sso: true`).
- Il database parte VUOTO: niente seed, i dati veri li inserisce il team.

## Le regole che l'app rispetta

1. **Nessun dato dedotto.** Il netto in busta si scrive se lo si conosce, mai
   calcolato dal lordo. Il costo azienda esiste solo se la % contributi è
   dichiarata: altrimenti è «non calcolabile», non zero.
2. **I totali dichiarano chi manca.** Il monte RAL e il costo azienda sommano
   solo chi ha il dato, e la pagina elenca gli esclusi.
3. **La storia non si riscrive.** Aumenti e cambi contratto sono righe nuove;
   una persona si **cessa** (con data), non si elimina.
4. **Gli utenti vivono nel Hub.** Qui nessuna tabella utenti e nessuna query
   cross-schema su `hub."Utente"` (la violazione trovata dall'audit in
   Tasks/Calendario non si ripete): si entra con la password d'app o via SSO.
5. **I task operativi vivono in Deluxy Tasks.** Le "attività" qui sono il
   mansionario (cosa comporta una mansione), non le cose da fare.

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
