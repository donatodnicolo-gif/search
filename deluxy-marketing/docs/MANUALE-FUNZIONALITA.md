# Manuale delle funzionalità — Deluxy Marketing

> **Questo è il manuale delle funzionalità dell'app.** È la fonte di verità di
> *cosa fa* Deluxy Marketing, pagina per pagina. La **guida visiva** per una
> persona nuova è la resa grafica di questo file: `docs/manuale-funzionalita.html`
> (pubblicata come artifact).
>
> ⚠️ **REGOLA (dal 27/08/2026): ogni funzionalità nuova o modificata si scrive
> qui, nello STESSO commit che la introduce**, e si aggiunge una riga al
> *Registro delle funzionalità* in fondo. Poi si ripubblica la guida visiva.
> Un manuale che invecchia è peggio di nessun manuale: chi arriva dopo si fida.
>
> Fonte tecnica affiancata: [HANDOFF.md](HANDOFF.md) (stato e cosa manca) e
> [README.md](../README.md) (come si lavora).

---

## In una frase

Deluxy Marketing è **la memoria e il comando della pubblicità** di Deluxy. Non
tocca le consegne né i clienti: tiene tutto ciò che riguarda l'*advertising* dei
tre brand — **Deluxy Gifts** (deluxy.it), **Deluxy Flowers** (deluxyflowers.com),
**Cake Design** (cakedesign.me) — su **Google Ads** e **Meta** (TikTok è pronto,
non ancora collegato), e da un unico posto permette di **leggere com'è andata**
e **decidere cosa cambiare**.

## Cosa possiede e cosa legge dagli altri (Standard Deluxy §7)

**Ogni dato ha una casa sola.** Questa app possiede — ed è l'unica a possedere:
- campagne, gruppi di annunci, keyword, **parole escluse**;
- testi e asset degli annunci, estensioni, località di targeting;
- le landing censite;
- la **coda delle operazioni** con la sua approvazione;
- l'indice dei documenti ADV su Drive;
- la **spesa** pubblicitaria (le altre app la leggono da `GET /api/v1/spesa`).

Cosa **non** possiede, e legge da chi la possiede:
- il **venduto** → da **Deluxy Orders** (via API, ogni 3 ore);
- il **budget di vendita e il tetto ADV** → da **Deluxy Budgets** (il tetto è
  `advConsentito`, non `budgetPubblicato`);
- il **margine** e la **quota fornitore** → non si toccano: non sono di questa app.

## Da dove arrivano i dati (i connettori)

| Fonte | Come | Quando |
|---|---|---|
| **Google Ads** | Uno **Script incollato DENTRO ciascun conto** (Cake, Gifts, Flowers) *spinge* i dati verso l'app (`/api/v1/ingest`). Anche le **modifiche** approvate le esegue quello script, dentro Google. | Ogni notte (Cake ~02:40, Gifts ~03:47, Flowers ~05:14) |
| **Meta** | È **l'app che va a prendere** i dati (Meta non ha script). La **scrittura** su Meta la fa l'app, e **solo quando qualcuno preme**. | Cron ogni ora (minuto :07) |
| **TikTok** | Connettore, cron e pagina **già pronti**; mancano solo **token** e **advertiser id**. Guida: [COLLEGARE-TIKTOK.md](COLLEGARE-TIKTOK.md). | Cron ogni 2 ore (:37), quando collegato |
| **Ordini** | Da **Deluxy Orders**, il registro Shopify centrale. | Cron ogni 3 ore (:20) |
| **Drive** | Indice della cartella *ADV DELUXY SRL* (sola lettura per i documenti). L'app **deposita** APPEND e RISULTATI ogni sera («il ponte»). | Indice: cron 06:10 · Ponte: 20:40 · Risultati: lunedì 06:40 |

⚠️ **Gli Script di Google girano dentro l'account e non si avviano da fuori**:
se uno smette di partire, l'app non se ne accorge da sola — continua a mostrare
gli ultimi numeri, che *sembrano* aggiornati. Per questo la Dashboard ha in cima
«Ultima corsa dei connettori»: oltre 24 ore c'è qualcosa da guardare, oltre 48 è
fermo.

## Il giro operativo, in sei passi

È il cuore dell'app. Un'analisi non resta un documento: diventa una decisione
tracciata dall'inizio alla fine.

1. **Un'analisi viene depositata** (a mano da `/analisi/nuova`, o via
   `POST /api/v1/analisi`, o pescata da Drive) e l'app la rielabora in una
   **SCHEDA grafica**: verdetto (ok / attenzione / critico), KPI, *findings*.
2. **Dai findings nascono AZIONI** da fare, con priorità, owner e scadenza
   (`/azioni`, «Da fare»).
3. **Un'azione diventa un'OPERAZIONE messa in coda** (`/operazioni`), con
   l'avviso del *change control* (es. «budget oltre il 30% in un colpo»).
4. **Una persona la APPROVA** — o la rimanda, o la annulla. Niente si esegue
   senza questo passaggio.
5. **L'esecuzione**: su **Google** la fa lo Script dentro il conto al giro
   successivo; su **Meta** la fa l'app **quando premi «Esegui»** (non c'è cron,
   è una scelta).
6. **L'esito viene RILETTO** dalla piattaforma e scritto sulla riga:
   *confermato rileggendo* o *smentito*. Un'operazione **fallita resta ferma**
   finché qualcuno non la rimette in coda o la annulla.

## La mappa dell'app (le sezioni del menu)

**Adesso** — cosa fare subito
- **Dashboard** (`/`): KPI del periodo per brand (MER, spesa, vendite,
  risultato stimato, ROS), «Ultima corsa dei connettori», «Decisioni prese e non
  ancora eseguite» (approvate ferme + fallite), andamento del mese vs budget.
- **Da fare** (`/azioni`): le azioni aperte, con scadenza e stato.
- **Operazioni** (`/operazioni`): la coda con approvazione, divisa Google/Meta;
  il bottone «Esegui» per Meta; «Rimetti in coda» per le fallite.
- **Incidenti aperti** (`/errori`): gli ERR-* con freeze.

**Campagne**
- **Tutte le campagne** (`/campagne`): una colonna per brand, verdetto a pallino.
- **Landing page** (`/landing`): registro con stato (attiva / mismatch / da
  verificare) e performance.
- **Quante ce n'erano (storico)** (`/campagne-storiche`): il **censimento
  storico** — quali e quante campagne sono esistite negli anni, **comprese le
  rimosse** che nessun giro quotidiano racconta. Oggi Meta; Google da incollare.

**Google Ads** — Campagne Google, Gruppi di annunci, Keywords, Parole cercate,
Regole di esclusione, Liste di parole escluse, Copy & annunci, Estensioni.

**Meta** — Campagne Meta, Pubblici, Test & AIDA (backlog dei test pianificabili).

**Com'è andata** — Analisi periodo, Ritorno e tracciamento, MKT vs 2025 (delta
settimana su settimana sull'anno prima), Ordini, Analisi per offerta, Trend
vendite.

**Piano** — Budget ADV, Budget vendite, Occasioni (con task T-21/T-14/T+7),
Cadenze ricorrenti.

**Da sapere** — Analisi, Audit, Lettura AI, Memoria condivisa (append-only),
Documenti Drive (indice).

**I dati tengono?** — Dati in arrivo (`/ricezione`: ogni consegna, da chi e
quando), Incongruenze, Storico modifiche (gemello dello 00.2 su Drive),
Impostazioni (token, chiavi API, connettori, istruzioni AI).

**Brand** — una lente su ciascun brand.

## Le regole d'oro per chi è nuovo

- **«Approvata» non è «eseguita».** Su Meta serve premere «Esegui».
- **«Accodata» non è «successa».** Guarda l'esito sulla riga; le fallite restano
  ferme.
- **I numeri e gli stati Meta dell'app sono in quarantena** finché non validati
  contro Ads Manager (scarti già visti su Flowers e Cake).
- **Un allarme si guarda dalla Dashboard**: connettore fermo, budget sforato,
  operazione ferma — sono in cima apposta.
- **Ogni numero ha una casa sola**: la spesa è di questa app, il venduto è di
  Orders, il tetto è di Budgets, i clienti non sono qui.

## Glossario dei termini che ricorrono

- **Brand**: flowers / gifts / cake (più *cross* per ciò che vale per tutti).
- **Traino**: una campagna che porta gran parte del valore. Non si tocca alla
  leggera: ha un *change control* a livelli (L0 libere → L3 mai in diretta).
- **Break-even ROAS** = 1 / margine: sotto quel ROAS la campagna perde.
- **ROAS** = ricavi / spesa (di una campagna). **MER/ROS** = vendite totali /
  spesa totale (di un brand): dice se l'insieme rende.
- **Negativa / parola esclusa**: una parola per cui NON vogliamo comparire.
- **Il ponte**: il meccanismo che ogni sera deposita su Drive l'APPEND delle
  azioni eseguite e i RISULTATI per brand.
- **Scheda analisi**: un'analisi rielaborata in verdetto + KPI + findings.
- **Censimento storico**: l'inventario delle campagne per anno, comprese le
  rimosse.

## Sotto il cofano (per chi ci mette le mani)

- **Next.js 15 + Prisma**, porta **3130**. Cartella:
  `C:\Users\nicol\scoutwt\deluxy-marketing` (branch `scout-ui`).
- **Postgres condiviso** con 13 altre app Deluxy, schema `marketing`. Mai
  `prisma db push`: tabelle con `CREATE ... IF NOT EXISTS` mirato.
- **API `/api/v1/*`** a chiave (`x-api-key` o `Bearer`), scope binario
  (`scrittura` sì/no). Cron protetti da `CRON_SECRET`. Interfaccia dietro
  `MARKETING_APP_PASSWORD`.
- **Deploy dalla CLI**: `npx vercel deploy --prod --yes` dalla cartella (il
  progetto Vercel non è collegato a GitHub: il push non pubblica).
- **Sicurezza**: revisione del 27/08/2026, ~120 prove dall'esterno, zero buchi.
  Dettaglio in HANDOFF.

---

## Registro delle funzionalità

Una riga per funzionalità nuova o cambiata, la più recente in cima. **Si scrive
qui nello stesso commit.**

| Data | Funzionalità | Dove |
|---|---|---|
| 2026-08-27 | **Guida TikTok**: le istruzioni per collegarlo (mancano solo token e advertiser id) | `docs/COLLEGARE-TIKTOK.md` |
| 2026-08-27 | **Revisione sicurezza**: `state` sull'OAuth Drive, guardia anti-traversata su `fileDrive`, la GET che faceva scrivere una chiave di sola lettura chiusa, freno sul login, tetto e forma su `limite`, traccia sulle chiavi API | più file |
| 2026-08-27 | **Revisione UX/UI a tre agenti**: telefono senza scroll laterale, bersagli 44px, intestazioni sticky, prima colonna ancorata, «Annulla» distruttivo | `globals.css` + pagine |
| 2026-08-27 | **Censimento storico delle campagne** (comprese le rimosse), pagina `/campagne-storiche`, rotte `/api/v1/censimento[/meta]` | `lib/censimento-storico.ts` |
| 2026-08-27 | **Riquadro home «Decisioni prese e non ancora eseguite»** (approvate ferme + fallite) | `components/CodaFerma.tsx` |
| 2026-08-25 | **Le analisi di Drive diventano schede grafiche** (verdetto, KPI, findings) | `lib/scheda-analisi.ts` |
| 2026-08-25 | **Cron indice Drive** (`/api/cron/drive`, 06:10) — l'indice si allinea da solo | `api/cron/drive` |
