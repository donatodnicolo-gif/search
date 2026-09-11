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
- **Operazioni** (`/operazioni`): la coda con approvazione, divisa Google/Meta.
  Su Google esegue lo script al giro dopo; su Meta **l'approvazione esegue
  subito** (dal 04/09/2026) e il bottone «Esegui adesso» serve per le approvate
  rimaste ferme; «Rimetti in coda» per le fallite.
- **Incidenti aperti** (`/errori`): gli ERR-* con freeze.

**Campagne**
- **Tutte le campagne** (`/campagne`): una colonna per brand, verdetto a pallino,
  ordinate per stato (attive prime) e poi per nome.
- **Lancio campagna** (`/campagne/lancia`): il modulo Google (keyword, RSA,
  località, budget) e il modulo Meta — immagine, **video** (caricato a pezzi),
  formato **singolo / carosello / catalogo**, pubblici del brand da spuntare,
  Pagina Facebook, il **pixel** (letto vivo dall'account, già scelto se è uno:
  va sull'ad set e sull'annuncio, con qualunque obiettivo), e il pannello
  «Fatti scrivere il brief dall'AI» su entrambi.
  Tutto finisce nella coda da approvare: su Meta l'app crea campagna, ad set e
  annuncio **in pausa**; su Google parte il bulk upload via script.
- **Scheda campagna**: su Google il bottone **«Nuovo gruppo»**
  (`/campagne/[id]/nuovo-gruppo`, col suo brief AI); su Meta il riquadro
  **«Annunci su Meta (dal vivo)»** con le creatività lette dalla Graph API
  (le bozze mai pubblicate di Ads Manager non esistono per l'API).
- **Landing page** (`/landing`): registro con stato (attiva / mismatch / da
  verificare) e performance.
- **Quante ce n'erano (storico)** (`/campagne-storiche`): il **censimento
  storico** — quali e quante campagne sono esistite negli anni, **comprese le
  rimosse** che nessun giro quotidiano racconta. Oggi Meta; Google da incollare.

**Google Ads** — Campagne Google, Gruppi di annunci, Keywords, Parole cercate,
Regole di esclusione, Liste di parole escluse, Copy & annunci, Estensioni.

**Meta** — Campagne Meta, Pubblici (censiti da Meta ogni ora o col bottone
«Censisci da Meta»; quelli spariti da Meta diventano «estinti» e restano solo
col filtro), Test & AIDA (backlog dei test pianificabili).

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

> Guida visiva (resa da questo file): https://claude.ai/code/artifact/26c28675-7214-46c4-a5e6-7c3b3612d0ad
> — ripubblicata il 07/09/2026 (l’artifact del 04/09 risultava di nuovo cancellato; anche quello del 27/08 lo era).

Una riga per funzionalità nuova o cambiata, la più recente in cima. **Si scrive
qui nello stesso commit.**

| Data | Funzionalità | Dove |
|---|---|---|
| 2026-09-11 | **La dashboard di un brand si legge anche per categoria di prodotto e per area**: due tabelle nuove sotto quella per canale. Per ogni famiglia (fiori, torte, colazioni…) e per ogni città (Milano, Roma, Firenze, altre zone): quanto ha **incassato** su Shopify, quanto si è **speso** su Google e su Meta, quanto di quell'incasso **Shopify attribuisce** a ciascun canale e le **rese** che ne seguono — quella del canale (si ripaga questa pubblicità?) e quella su tutto (questa famiglia sta in piedi?). Sotto i 20 € di spesa il rapporto si mostra ma non si giudica, perché la base è troppo piccola. La spesa che non si può assegnare (campagne generiche, campagne che tirano su più città) sta in righe **dichiarate** e non si spalma; gli ordini di cui non si sa la destinazione hanno la loro riga e non finiscono in «altre zone» | `/brand/[brand]`, `components/BrandPerCategoria`, `BrandPerArea`, `lib/brand-tabelle.ts`, `lib/aree.ts` |
| 2026-09-11 | **La categoria di prodotto di una campagna si vede senza aprire niente, e si sceglie già quando la campagna nasce**: sulla scheda campagna una riga in chiaro dice che cosa vende e se è stato scelto a mano o dedotto dal nome; nei due moduli di lancio (Google e Meta) c'è la tendina «Che cosa vende», con **Generico** per le campagne che non parlano di una famiglia sola. La scelta a mano vince e non viene più sovrascritta; non scegliendo, la categoria resta dedotta dal nome | `components/VenditeCampagna`, `/campagne/lancia`, `lib/vendite-campagna.ts` |
| 2026-09-11 | **La spesa Meta si legge anche per regione** (`breakdowns=region`): serve alla tabella per area, perché su Meta — a differenza di Google — l'app non censisce il targeting geografico delle campagne | `lib/meta.ts` (`leggiSpesaPerRegioneMeta`) |
| 2026-09-11 | **Gli ad set di una campagna Meta si vedono e si comandano dall'app**: sulla scheda di una campagna Meta il riquadro «Ad set di questa campagna» elenca ogni ad set con **stato e budget letti vivi da Meta** a ogni apertura, i numeri del periodo scelto in cima (spesa, quota sulla campagna, clic, conversioni, incasso, resa col pareggio del brand), l'operazione già in coda su quella riga e due comandi: **Metti in pausa / Riattiva quel solo ad set** e **cambia il budget** (dalla coda, L2 come il budget di campagna). Con la CBO il budget sta sulla campagna: lì il campo non si offre e la riga lo dice; se il vivo da Meta non arriva, la cella dice «non letto» invece di inventare. Prima, dentro una campagna Meta, non c'era modo di sapere quale dei suoi ad set si mangiava il budget, né di fermarne uno solo | `components/AdSetMeta`, `campagne/[id]`, `lib/meta.ts`, `lib/azioni.ts` |
| 2026-09-11 | **Gli ad set Meta entrano nel censimento**, a ogni giro di sincronizzazione (orario): gli ad set di ogni account finiscono in `Gruppo` con l'id nudo di Meta, e i loro numeri giorno per giorno in `MetricaGruppo` — la stessa tabella dei gruppi Google. Primo giro vero in produzione: **171 ad set** (7 accesi, 164 in pausa) | `lib/sync-meta.ts`, `lib/meta.ts` |
| 2026-09-07 | **Pausa di un annuncio dalla scheda del gruppo**: nel riquadro «Annunci (N) · in asta» ogni annuncio acceso ha «Metti in pausa», e lo stesso bottone sta nella colonna dell'annuncio fra i testi in fondo; accoda una `pausa_annuncio` (lo script sapeva già eseguirla) con l'avviso se è l'unico annuncio attivo del gruppo; una sola pausa in coda per annuncio (la seconda è bloccata) | `/gruppi/[id]`, `creaOperazionePausaAnnuncio` |
| 2026-09-09 | **La pausa di un annuncio adesso arriva davvero a Google**: il primo tentativo vero, l'08/09, era fallito con «bersaglio non trovato» — l'operazione portava l'id dell'annuncio dove lo script si aspetta quello della campagna, e moriva prima di essere eseguita. Chi preme «Riprova» su una di quelle vecchie non la vede più rifallire: la riga si ripara da sola mentre torna in coda | `lib/azioni.ts`, `gruppi/[id]` |
| 2026-09-08 | **La tabella keyword della scheda campagna è pari a quella del gruppo**: colonna **Azione decisa** (l'operazione già in coda su quella parola, con «Annulla» al posto degli altri bottoni), **Riattiva** quando su Google è ferma, **Copia** ed **Estendi AI**, la negativa che eredita la corrispondenza con cui la parola è comprata, e la **selezione multipla** con «Escludi le selezionate», «Copia le selezionate», «Estendi con AI». Era l'unica delle quattro tabelle senza: si poteva accodare due volte la stessa pausa, e una keyword fermata da lì non si poteva più riaccendere da lì | `components/KeywordCampagna` |
| 2026-09-08 | **La coda si accorge se la cosa è già stata fatta a mano**: se sulla piattaforma la campagna è già nello stato che l'operazione voleva, la riga lo dice con la data della rilettura che lo prova e offre **«Chiudi: era già così»**. Non è «Annulla» — annullare vuol dire «ho cambiato idea», qui la decisione valeva ed è stata eseguita, solo non dall'app | `/operazioni`, `chiudiPerchePiattaformaGiaCosi` |
| 2026-09-08 | **«Esegui questa su Meta», una sola**: ogni operazione Meta approvata ha il suo bottone, e accanto c'è scritto da quanto è ferma. Prima l'unico modo era «Esegui adesso», che le manda **tutte insieme**: per spegnere una campagna bisognava spegnerne anche un'altra, e due pause sono rimaste ferme per giorni mentre le campagne continuavano a spendere | `/operazioni`, `eseguiUnaSuMeta` in `lib/azioni.ts` |
| 2026-09-08 | **Su una campagna Meta non compaiono più i riquadri di Google**: parole cercate, keyword, «Ideali che qui mancano», «Dove finisce la spesa», «Cosa vede chi cerca», «Copertura delle ricerche», «Parole escluse» e «Chiedi i dati Google di oggi». Su Meta quelle cose non esistono: i riquadri uscivano vuoti e spiegavano come riempirli con uno script che lì non gira. Il riquadro del guardrail dice ora chi esegue davvero: su Meta è l'app, su Google lo script | `campagne/[id]`, `GuardrailCampagna` |
| 2026-09-08 | **CTR sulle card delle campagne e nella tabella delle finestre**, accanto al ROAS e ai click: il ROAS dice se quello che entra ripaga, il CTR se l'annuncio parla alla gente giusta — senza incasso, un CTR alto sposta il problema dopo il click (pagina, prezzo) e uno basso prima (annuncio, pubblico) | `/campagne`, `components/PerformancePeriodi` |
| 2026-09-08 | **Il menu si apre anche col pannello aperto**: il pannello «metti in coda» copriva tutta la finestra, topbar compresa, e il bottone del menu non si poteva premere — il clic finiva sul velo e chiudeva il pannello. Ora il velo parte sotto la barra in alto | `globals.css` (`--topbar-h`, `.pannello-scrim`) |
| 2026-09-08 | **«Aggiungi» aggiunge davvero la keyword ESATTA**: il bottone che trasforma una parola cercata in keyword prometteva «esatta» e metteva in coda una **generica**, che compra sinonimi e ricerche correlate. Nello stesso giro: **«Copia»** al posto di «Porta altrove», perché non sposta niente, accoda la stessa parola anche altrove | `TerminiRicerca`, `gruppi/[id]`, `lib/azioni.ts` |
| 2026-09-08 | **Segnare «da escludere» non esclude più niente**: su Parole cercate quell'etichetta metteva in coda una negativa vera, mentre la pagina scriveva il contrario. Ora le etichette sono solo etichette e un valore imprevisto non scrive nulla | `lib/azioni.ts` (`giudicaTermine`) |
| 2026-09-08 | **L'esclusione dice dove finisce**: i tre bottoni «Escludi» che tacevano adesso scrivono che la parola vale per **tutta la campagna** (Google tiene le esclusioni lì, non sul singolo gruppo), e l'operazione porta un **avviso quando la campagna ha più di un gruppo acceso** | `TerminiRicerca`, `gruppi/[id]`, `lib/operazioni.ts` |
| 2026-09-08 | **L'allarme «rileggendo non risulta ancora» si spegne da solo**: quando la piattaforma, riletta dopo, conferma la modifica, il dubbio scritto dallo script sparisce dall'esito e al suo posto compare quando è stato chiuso. Il testo originale resta nel suggerimento della riga | `/operazioni`, `lib/conferme-operazioni.ts` |
| 2026-09-08 | **Un nome solo per ogni colonna** in tutte e quattro le tabelle di keyword e parole cercate: *Parola cercata · Fatta scattare da · Incasso · Resa · QS*. Il **voto della Resa** usa ora il pareggio del brand e non una soglia fissa, e **«spende a vuoto»** ha una definizione sola | `TerminiRicerca`, `KeywordCampagna`, `gruppi/[id]`, `/termini`, `lib/salute.ts` |
| 2026-09-08 | **La riga del gruppo dice cosa sta aspettando** («messa in pausa chiesta · da approvare» / «· aspetta lo script»), e sulla scheda campagna i **gruppi spenti si piegano** in «Gruppi non attivi (N)»: su una campagna erano 14 righe su 15 e coprivano l'unico gruppo che eroga | `components/TabellaGruppi`, `campagne/[id]` |
| 2026-09-08 | **Su Campagne si legge cosa dicono le analisi**: un riquadro elenca le analisi che parlano delle campagne filtrate, con il verdetto e la nota su ciascuna e il link alla scheda. Prima c'era solo un pallino colorato, muto e non apribile | `/campagne` |
| 2026-09-07 | **«Metti in coda» apre un pannello laterale invece di portare a /operazioni**: sulla scheda campagna, sulla scheda gruppo, su Keyword e su Parole cercate l'esito compare in un pannello a destra (foglio dal basso sul telefono) con gli avvisi del guardrail e le ultime otto operazioni richieste in quell'ambito; ✕, Esc o click fuori lo chiudono e si resta dove si era; «Vai a Operazioni» porta alla coda col ritorno. Prima «Escludi» dalle ricerche atterrava in /operazioni con lo sguardo sullo storico delle cose già fatte | `components/PannelloCoda`, `EsitoCoda`, `esitoInCoda` in `lib/azioni.ts` |
| 2026-09-07 | **Le operazioni annullate stanno solo in archivio**: lo «Storico — ultimi 7 giorni» di /operazioni mostra eseguite e fallite; le annullate escono dalla pagina di lavoro e si raggiungono dal bottone «Annullate (N) →», che apre l'archivio già filtrato su di loro. Nello stesso giro: i bottoni non ereditano più il maiuscolo dai titoli di scheda («NUOVO GRUPPO» → «Nuovo gruppo», scheda campagna) | `/operazioni`, `globals.css` |
| 2026-09-04 | **Il pixel va sempre indicato nel lancio Meta**: il modulo legge vivi i pixel dell'account (pre-scelto se è uno solo, da scegliere se sono di più, id a mano se non si leggono); all'esecuzione il pixel va **sull'ad set** per Vendite/Contatti (ottimizzazione) **e sull'annuncio** come tracciamento degli eventi del sito, con qualunque obiettivo (anche Traffico e Notorietà); l'esito e la nota della campagna dicono quale pixel è stato usato | `/campagne/lancia`, `lib/meta-annunci.ts`, `lib/meta-scrittura.ts` |
| 2026-09-04 | **Su Meta l'approvazione esegue subito**: approvando un'operazione Meta (una o in blocco) l'app la esegue nello stesso istante e mostra l'esito; «Esegui adesso» resta per le approvate rimaste ferme (approvate prima del 04/09 o via API) | `/operazioni`, `lib/azioni.ts`, `lib/meta-scrittura.ts` |
| 2026-09-04 | **«Conclusa» mette in pausa sulla piattaforma e resta scritta**: portare una campagna (Meta o Google) a conclusa scrive subito lo stato nell'app — la sync non lo sovrascrive più — e accoda una `pausa_campagna` da approvare (se sulla piattaforma è già in pausa, niente da eseguire); prima generava solo un promemoria e la sync la rimetteva «attiva» | `lib/azioni.ts`, `lib/dominio.ts` |
| 2026-09-03 | **Schede analisi ripartite** dopo 8 giorni ferme (dal 26/08): chiamata AI in **streaming** con timeout 280 s, tetto di token a 32.000 per le schede e 16.000 per la riconciliazione, `maxDuration` 300 sulla pagina della scheda, fallimenti scritti nel Registro eventi (non più solo nel JSON del cron) | `lib/scheda-analisi.ts`, `api/cron/drive` |
| 2026-09-03 | **Campagne ordinate per stato** (attive prime), poi per nome | `/campagne` |
| 2026-09-03 | **Annunci Meta a schermo, dal vivo** (miniatura, formato, testi, stato, ad set — letti dalla Graph API, nessuna copia in DB) sulla scheda delle campagne Meta; il **lancio Meta sa fare carosello** (2-10 schede, CTA per scheda verso il suo prodotto) **e catalogo** (insieme di prodotti letto dal Business) | `components/AnnunciMeta`, `lib/meta-annunci.ts`, `/campagne/lancia` |
| 2026-09-03 | **Video nel lancio Meta** (caricato a pezzi da ~3 MB, immagine di copertina obbligatoria); **pubblici censiti da Meta** (cron orario + bottone «Censisci da Meta», stato «estinto») e **spuntabili nel lancio**; **brief AI sul modulo Meta** (descrizione → obiettivo, budget, paesi, età, copy, CTA) | `/campagne/lancia`, `/pubblici`, `lib/pubblici-meta.ts` |
| 2026-09-03 | **Il lancio Meta carica l'immagine e crea l'annuncio in pausa** (creative + ad dopo campagna e ad set; Pagina Facebook dal modulo o dal pixel); i **brief Google chiedono 15 titoli e 4 descrizioni** per l'Ad Strength «Eccellente» | `/campagne/lancia`, `lib/azioni-brief.ts` |
| 2026-09-03 | **Nuovo gruppo di annunci su una campagna Google esistente**, con keyword, RSA e «Compila con l'AI»; si accoda un `completa_campagna` (nessun tipo di operazione nuovo) | `/campagne/[id]/nuovo-gruppo` |
| 2026-09-03 | Il brief di lancio campagna **torna sul fornitore AI globale** (Claude): l'obbligo di OpenAI deciso il 27/08 e messo in codice il 02/09 è stato tolto su richiesta dell'utente | `lib/azioni-brief.ts` |
| 2026-08-27 | **Guida visiva allineata al Deluxy Design System** (font di sistema, token e oro di casa, come le guide di Anagrafiche/Hub/Orders) | `docs/manuale-funzionalita.html` |
| 2026-08-27 | **Guida TikTok**: le istruzioni per collegarlo (mancano solo token e advertiser id) | `docs/COLLEGARE-TIKTOK.md` |
| 2026-08-27 | **Revisione sicurezza**: `state` sull'OAuth Drive, guardia anti-traversata su `fileDrive`, la GET che faceva scrivere una chiave di sola lettura chiusa, freno sul login, tetto e forma su `limite`, traccia sulle chiavi API | più file |
| 2026-08-27 | **Revisione UX/UI a tre agenti**: telefono senza scroll laterale, bersagli 44px, intestazioni sticky, prima colonna ancorata, «Annulla» distruttivo | `globals.css` + pagine |
| 2026-08-27 | **Censimento storico delle campagne** (comprese le rimosse), pagina `/campagne-storiche`, rotte `/api/v1/censimento[/meta]` | `lib/censimento-storico.ts` |
| 2026-08-27 | **Riquadro home «Decisioni prese e non ancora eseguite»** (approvate ferme + fallite) | `components/CodaFerma.tsx` |
| 2026-08-25 | **Le analisi di Drive diventano schede grafiche** (verdetto, KPI, findings) | `lib/scheda-analisi.ts` |
| 2026-08-25 | **Cron indice Drive** (`/api/cron/drive`, 06:10) — l'indice si allinea da solo | `api/cron/drive` |
