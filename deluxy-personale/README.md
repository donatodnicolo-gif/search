# Deluxy Personale

**La casa dei dati HR dell'ecosistema Deluxy** (Standard §7): organico, funzioni
e mansioni con le loro attività (mansionario), organigramma, inquadramenti
contrattuali e retribuzioni. Modellata sulle app di gestione del personale
(Factorial/Personio): anagrafica → organizzazione → contratto → compenso,
con inquadramento e retribuzione tenuti **come storia** (ogni variazione è una
riga con la sua decorrenza; il "corrente" è l'ultima decorrenza non futura).

- Porta di sviluppo: **3200** · Schema Postgres: **`personale`** (cluster condiviso)
- Produzione: **https://deluxy-personale.vercel.app** (Vercel, region `fra1`)
- UI: Deluxy Design System v1.4 + Libro UX&UI v1.10 (sidebar da gestionale, token in `src/app/tokens.css`)

## Dove siamo (29/08/2026)

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
- ✅ **Modalità di lavoro (26/08)**: sulla scheda (e sul form di creazione),
  accanto alla Sede — «In sede», «Da remoto», «Ibrida (sede + remoto)» o
  «non indicata» (default: si dichiara, non si deduce dalla sede scritta in
  anagrafica). Se indicata compare come badge in testa alla scheda ed esce da
  `/api/v1/persone` (`modalitaLavoro: "sede"|"remoto"|"ibrido"|null`).
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

## Passata UX del 29/08/2026 (7 esami + 3 revisioni ostili)

Nata da una segnalazione dell'utente sulle tabelle. Il custode del layout ha
emesso il verdetto, sei agenti hanno esaminato le 11 pagine sul dev server, e le
49 accuse raccolte sono passate da tre revisioni `ux-ostile`: **26 reggono, 5
cadono, 18 ridimensionate**. Il registro completo — comprese quelle CADUTE, che
non vanno «ricorrette» per sbaglio — è in
[`deluxy-design-system/SEGNALAZIONI-UX.md`](../deluxy-design-system/SEGNALAZIONI-UX.md).

Corretto in questo giro, con la misura prima → dopo:

- ⭐ **La ricerca dava risultati sbagliati con l'aria di essere giusti**: la
  casella e il bottone «Filtra» erano due `<form>` distinti, e il secondo
  portava la `q` **dell'URL** invece di quella digitata. Da `/?q=Edoardo`,
  scrivendo «Luca» e cliccando il bottone si tornava a Edoardo con una lista
  coerente e plausibile. Ora è **un solo form** (verificato sul vivo: la stessa
  sequenza dà «Luca Salso», URL `?q=Luca`).
- ⭐ **I KPI di testa mentivano a un click**: erano calcolati sulla lista
  filtrata, quindi `/?stato=cessati` dichiarava «Persone attive 0» e «nessun
  compenso con contributi dichiarati» mentre i dati c'erano. Ora hanno una query
  propria, senza filtri (8 attive · 3 cessate anche col filtro addosso), e la
  lista dichiara sé stessa con **«N di M · filtro attivo»** sopra la tabella.
- **Le intestazioni non si fermavano**: scorrendo, il primo `th` finiva a
  top −302 e si leggevano otto colonne senza nome. Ora `th` sticky + `max-height`
  sul contenitore (misurato dopo: scarto **0** dopo 300px di scorrimento).
- **A 1366×768 «Costo azienda» era tagliata**: 35px su 50 di ogni importo fuori
  dalla card, su 11 righe, perché il badge «Stage / tirocinio dal 01/09/2026» in
  `nowrap` teneva la colonna Contratto a 232px. Ora sono due pillole che vanno a
  capo: **eccedenza orizzontale 0**, l'importo sta dentro con 16px di margine.
  ⚠️ Ordine obbligato: la colonna si stringe PRIMA di mettere la `max-height`,
  o la card si ritrova due barre di scorrimento annidate.
- **Su mobile la tabella diventa schede** (Libro §8: lo scorrimento orizzontale
  come unica risposta è vietato). Prima a 375px si leggeva il 32% della riga.
  Le etichette sono **statiche nel markup** (`data-label` sui `<td>`), non
  scritte da JavaScript: si vedono nell'HTML servito dal server. ⚠️ Le 8 celle
  con `colSpan` (totali e avvisi) sono marcate `data-piena` e restano a piena
  larghezza: la utility della piattaforma, che mappa per indice, le avrebbe
  etichettate con la colonna sbagliata.
- **Il menu mobile è un drawer da sinistra** con topbar da 56px, scrim, Esc e
  chiusura al cambio pagina. Prima si sdraiava in flusso e mangiava 278px — il
  34% della prima schermata — su ogni pagina. Effetto misurato sulla home a
  375×812: la prima riga dell'elenco passa da **1165px a 655px**, cioè entra
  nella prima schermata come vuole la misura di collaudo del §8.
- **Bersagli e campi su touch**: blocco `@media (pointer: coarse)` che porta a
  44px bottoni, chip, voci di menu, la × di rimozione e le caselle di spunta
  (prima 27 elementi su 27 erano sotto la soglia, e `--touch-min` era definito e
  mai usato); input a 16px sotto i 900px, contro lo zoom di Safari iOS.
- **La CTA di un form lungo non finisce più sotto la tastiera**: `.form-azioni`
  sticky in basso con `safe-area-inset-bottom`.
- **L'esito non si ripropone a un refresh**: `?nota=` viene mostrata una volta e
  ripulita dall'URL con `replaceState`. Prima un F5 su `/cartellini` ripeteva
  «Rapporto inviato a …» senza che nulla fosse partito. ⚠️ La via del «cookie
  flash» non regge in RSC: un Server Component non può cancellare un cookie
  durante il render.
- **L'invio al commercialista chiede conferma** e nomina destinatario e mese
  (una mail non si ritira); il bottone è **spento** finché manca la chiave, e
  mostra «Invio…» mentre lavora. Stesso trattamento a «Crea la persona», che
  dietro fa una chiamata a Budgets con timeout di 4 secondi.
- **Il guasto dei cartellini ha un vestito suo** (cornice rossa + «Riprova»),
  non più quello dello stato vuoto; e il messaggio parla italiano, col nome
  della variabile relegato in seconda riga.
- **L'oro non è più un esito**: gli esiti riusciti usano `.nota-ok` verde,
  l'oro resta alla cautela.
- **Login**: label vera sopra il campo, spazio riservato al messaggio (l'errore
  spostava il bottone di 29px mentre il dito stava per premerlo), e il guscio
  non si monta più su `/login` — montato, metteva 9 link focalizzabili prima
  della password.
- **`aria-current="page"`** sulla voce attiva del menu; nomi accessibili sui
  filtri; `.card-sub` col tetto di 640px come `.page-sub`.

### Deroghe di questa app (Libro §12)

- **Niente scorciatoie di periodo sull'elenco Persone** (§8-bis lettera c):
  l'organico non è un registro di movimenti — una persona non «appartiene» a un
  mese, c'è o non c'è. Le altre due gambe della regola (ricerca e filtri) ci
  sono; il tempo, dove conta, è il KPI «Contratti in scadenza». *(Deciso il
  28/08/2026, motivazione anche in `src/app/page.tsx`.)*
- **Su `/cartellini` il periodo sono le frecce ← mese →**, non le chip
  `Mese · Trimestre · Anno`: è un registro mensile chiuso, il trimestre non ha
  significato. *(29/08/2026, su parere del custode.)*
- **Nomi delle classi in italiano** (`.btn.mini`, `.pericolo`, `.ghost` invece di
  `.small`, `.danger`, `.secondary`): il Libro §12 vieta i rinomini di massa
  nelle app esistenti — si migra al confine.

### Aperto, in attesa di arbitrato del custode

- **`.btn.mini` è alto 28,4px**: il §10.1 chiede ≥32px su desktop, ma il
  `.btn.small` **del Libro** («5×13, 12.5px») produce 28,4px identici e il §3
  v1.8 fissa il minimo desktop a ≥28px. **Le due regole del Libro si
  contraddicono**: la decisione vale per tutte le app, non si prende qui.
- **La riga dei totali in `<tfoot>`**: proposta del custode come voce nuova
  (§8 v1.11). Nel metro vigente (v1.10) `tfoot` non è nominato, quindi resta
  com'è finché non è promulgata.
- **Ordinamento dal click sull'intestazione** (§8): assente. L'ostile l'ha
  declassato — 5-11 righe già ordinate per nome, danno operativo nullo — ma
  diventa dovuto appena l'organico supera le ~30 persone.
- **Ricerca e filtri su `/stipendi`, `/inquadramenti`, `/benefit`** (§8-bis):
  assenti. Stessa ragione: la regola si giustifica a 200 righe, qui ce ne sono 5-8.
- **`.cella-manca`** (terza gamba della tripletta delle celle vuote, §8): non
  esiste in **nessuna app del repo**. È un'adozione mai fatta a livello di parco.

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

## Custode del layout (obbligatorio — 27/08/2026)

L'interfaccia di questa app ha un **custode**: l'agente `architetto-ux` (definito in `.claude/agents/architetto-ux.md`), che applica il [Libro UX&UI](../deluxy-design-system/LIBRO-UX-UI.md) e il [Design System](../deluxy-design-system/DESIGN-SYSTEM.md) v1.4.

- **Errori di layout/UX e richieste di cambiamento dell'interfaccia NON si risolvono in autonomia**: si segnalano prima nel registro [`deluxy-design-system/SEGNALAZIONI-UX.md`](../deluxy-design-system/SEGNALAZIONI-UX.md), o si interpella direttamente l'agente.
- Il custode valuta ogni segnalazione e decide: correzione locale, regola nuova del Libro (che vale **anche per le altre app**), o deroga motivata.
- Le deroghe concesse a questa app vanno annotate qui sotto, con motivo e data.

## Custode della sicurezza (obbligatorio — 27/08/2026)

La sicurezza di questa app ha un **custode**: l'agente `architetto-sicurezza` (definito in `.claude/agents/architetto-sicurezza.md`), che applica il [Libro della Sicurezza](../deluxy-design-system/LIBRO-SICUREZZA.md).

- **Buchi di sicurezza e cambiamenti di una difesa NON si risolvono in autonomia**: si segnalano nel registro [`deluxy-design-system/SEGNALAZIONI-SICUREZZA.md`](../deluxy-design-system/SEGNALAZIONI-SICUREZZA.md), o si interpella l'agente.
- Ogni segnalazione passa prima dall'agente `sicurezza-ostile` (sopravvive solo con un percorso di sfruttamento: chi/quale chiamata/quale dato); la toppa si smonta come il difetto.
- Il custode valuta e decide: correzione locale, regola nuova del Libro (che vale **anche per le altre app**), o rischio accettato/deroga con il motivo scritto.
- Le deroghe di sicurezza di questa app vanno annotate qui sotto, con minaccia e data.
