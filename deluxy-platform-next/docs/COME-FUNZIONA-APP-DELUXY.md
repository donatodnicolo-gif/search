# COME FUNZIONA L'APP DELUXY

**MANUALE COMPLETO — EDIZIONE AGGIORNATA**

> Aggiornato il 14 luglio 2026 — integra la mappatura completa di app.deluxy.it (ogni sezione, bottone, filtro e opzione verificati direttamente in app con utenza Admin), il codice del backend reale e i chiarimenti dell'utente.
> Le parti contrassegnate con **[NUOVO]** sono funzionalità rilevate nell'app reale/backend e assenti nel manuale precedente.
>
> **📌 Questo `.md` è la VERSIONE VIVA adatta a Claude: è la fonte di verità funzionale per lo sviluppo di `deluxy-platform-next` e va aggiornata a ogni nuova scoperta.** Regola: quando si verifica una schermata reale, rileggere e integrare qui; se un campo/opzione ha semantica dubbia, chiederla all'utente e poi documentarla.
> **Word sempre aggiornato** (per le persone): `docs/COME-FUNZIONA-APP-DELUXY.docx`, generato da questo `.md` con `npm run doc:word` — non modificarlo a mano. Snapshot storico originale: `docs/COME-FUNZIONA-APP-DELUXY-AGGIORNATO-2026-07.docx`.
>
> **Changelog**
> - 31/08/2026 (11) — **Vendite: si vede il numero d'ordine Shopify.** La colonna Ordine mostra **#numero · brand** (es. #2824 · Flowers). Il numero viaggia dallo smistamento (campo nuovo `externalOrderNumber`) ed è stato riempito anche su TUTTE le 106 vendite già esistenti, leggendolo dal registro ordini. Compare anche nei cartellini «Ordini proposti a te».
> - 31/08/2026 (10) — **Preventivi anche dall'ufficio.** Admin e operation hanno il form di richiesta preventivo in cima alla pagina Preventivi, con in più la tendina **«Partner (per chi è la richiesta)»** (solo partner attivi): l'API lo permetteva già, il modulo era nascosto. E nel form consegna la tendina Partner mostra **solo i partner attivi** della provincia dell'indirizzo.
> - 31/08/2026 (9) — **I bottoni del valet anche IN LISTA.** Su ogni consegna in lavorazione la riga (e il cartellino mobile) porta **Metti in consegna** (agisce subito), **Consegnata** e **Non consegnata** (aprono il dettaglio col pop-up giusto già aperto: firma/DDT o motivo). Verificato in produzione con un account valet vero, firma compresa.
> - 31/08/2026 (8) — **Vendite: bottone «Inserisci» per l'ufficio.** Su una vendita aperta (proposta o da gestire) admin e operation hanno **Inserisci**: ferma il giro automatico — la proposta al partner decade — e apre il form consegna già compilato coi dati dell'ordine (destinatario, indirizzo, data, servizio, prodotto). Al salvataggio la consegna si aggancia alla vendita, che passa in **storico (accettata)** col partner della consegna. Se il form viene abbandonato, la vendita resta «da gestire»: chiuderla prima direbbe il falso. Rotte: `POST /sales/:id/inserisci`, `POST /sales/:id/collega-consegna`.
> - 31/08/2026 (7) — **Ordini automatici: Accetta/Rifiuta dentro Consegne.** Il partner trova gli ordini smistati in attesa della sua risposta in cima alla pagina **Consegne** («Ordini proposti a te»): Accetta fa nascere la consegna (che appare subito in lista), Rifiuta passa l'ordine al negozio successivo. Stesse rotte della pagina Vendite.
> - 31/08/2026 (6) — **Il flusso di chiusura del VALET, come nella vecchia app.** Sul dettaglio di una consegna in lavorazione il valet ha **Metti in consegna**, **Consegnata** e **Non consegnata**. «Consegnata» apre il pop-up: **a chi** è stata consegnata (destinatario / custode-portineria / altro — gli stessi valori del legacy, 5.994 «custode» reali), nome di chi ritira, **firma raccolta sul telefono** (canvas) e **DDT firmato fotografato** (compresso nel browser). «Non consegnata» chiede il **motivo** (assente / indirizzo errato / rifiutata / chiuso / altro + dettaglio), scritto nel campo nuovo `notDeliveredReason` e nel registro. L'API ammette al valet **solo questi passaggi e solo in avanti**: cancellare, retrocedere o riaprire una chiusa risponde 403 — da «consegnata» dipende la sua paga. Verificato E2E in produzione.
> - 31/08/2026 (5) — **Listini = perimetro, per partner E valet.** Un partner **vede e inserisce solo i servizi che ha abilitati** (il menu del form li filtra dal server; una consegna con un servizio fuori listino è rifiutata con 400, anche per id). A un valet **si assegnano solo servizi che ha a listino**: l'assegnazione senza riga di listino veniva accettata con paga NULL, ora risponde 400 col nome del valet; i pop-up «Assegna» (singolo e di massa) propongono solo i valet col servizio abilitato, oltre che della provincia.
> - 31/08/2026 (4) — **Il form consegna del partner è il SUO form.** Niente scelta del partner (è sempre lui, campo nascosto e fissato), niente sezione **Assegnazione** (valet, stati, valet-servizio: roba d'ufficio), niente **note interne**. E il **registro della consegna** (che racconta paghe e prezzi nei riallineamenti) ora esce dall'API **solo per admin e operation**: prima la pagina lo nascondeva ma la risposta lo portava a tutti, su ogni consegna dello storico.
> - 31/08/2026 (3) — **Il partner vede (e usa) solo il SUO catalogo.** La regola, decisa dall'utente: un partner vede **i propri prodotti**, quelli **senza partner** (catalogo comune), quelli marcati **«visibile ad altri partner»**, e quelli dove risulta **venditore aggiuntivo**. La regola vive in un punto solo (`common/perimetro-prodotti.ts`) e vale per la **lista** prodotti, per il **dettaglio** (un prodotto fuori perimetro non si apre nemmeno per id) e — questo è il punto nuovo — per la **scrittura delle consegne**: creando o modificando una consegna, una riga con un prodotto fuori perimetro viene rifiutata con «Uno dei prodotti non è nel tuo catalogo» (prima il filtro c'era solo in lettura: passando l'id a mano si aggirava). Il form consegne pesca dalla lista, quindi il partner vede già solo il suo perimetro.
> - 31/08/2026 (2) — **La vetrina «Servizi Deluxy» è nascosta per ora** (decisione utente): la prima schermata dopo il login torna a essere **Consegne** per tutti i ruoli e la voce di menu non compare. La pagina `/home` e il form Preventivi esistono ancora; per riaccenderla basta scommentare la voce di menu e il redirect del login.
> - 31/08/2026 — **Recupero password dalla schermata di accesso.** Sotto il bottone «Entra» c'è **«Password dimenticata?»**: si scrive la propria email e, se corrisponde a un account attivo, arriva una mail (via AI Mail, mittente amministrazione@deluxy.it) con un link valido **2 ore** che porta alla stessa pagina dell'invito, con i testi del caso («Scegli una password nuova»); scelta la password si è subito dentro. La risposta a video è **sempre la stessa**, esista o no l'account (non si regala l'elenco degli account validi), la rotta passa dallo **stesso freno anti-forza-bruta del login**, il link è **monouso** e il secondo uso viene rifiutato; il cambio è tracciato nel registro utente (`password-reset`). Verificato E2E in produzione.
> - 28/08/2026 — **Gli stipendi dei valet si CHIEDONO, non si pagano più a mano.** Deluxy Transactions è il collettore unico dei pagamenti dell'ecosistema (decisione utente 28/08). In **Stipendi**, su uno stipendio **Approvato** (ricevuta firmata) un ADMIN ha il bottone **«Richiedi pagamento»**: parte una richiesta firmata verso Transactions con l'IBAN del valet letto dall'anagrafica e verificato (checksum) — se manca o è sbagliato l'app lo dice e non parte niente. La riga mostra il riferimento `TRX-…` e lo stato della richiesta; quando là il bonifico esce, **«Pagato» arriva da solo** (webhook firmato, scrittura una volta sola: niente doppio storico in Pagamenti) e lo storico si crea come sempre. «Segna pagato» a mano resta per i pagamenti fuori canale. Lo stesso giro esiste via API per i rimborsi/reclami approvati (`POST /api/v1/payments/:id/richiedi-pagamento`).
> - 25/08/2026 — **Disponibilità di partner e valet, in una schermata sola.** In **Operatività** c'è ora **Disponibilità**: si sceglie un giorno e si vede chi lavora, partner e valet affiancati, ciascuno con le sue fasce orarie. Accanto a ogni riga è scritto **da dove viene la risposta** — se ha dichiarato le fasce proprio per quel giorno, se c'è un'eccezione (chiusura o orario speciale), oppure se è semplicemente l'orario che tiene di solito in quel giorno della settimana: sono tre gradi di certezza diversi, e sapere quale si sta leggendo cambia le decisioni. Chi non ha nessuna indicazione non risulta «chiuso» ma **«non indicata»**: non sapere se lavora e sapere che non lavora sono cose diverse. Si può cercare per nome e mostrare solo chi è disponibile. Con l'occasione sono state recuperate **366 fasce dei valet** che l'importazione dal vecchio sistema aveva perso, perché il nuovo ammetteva una sola disponibilità per persona al giorno mentre nel vecchio ce ne sono fino a sei.
> - 24/08/2026 (5) — **La fattura e' un mese, e c'e' il recap da mandare al partner.** In **Da fatturare** una riga non e' piu' un partner con tutte le sue consegne di sempre, ma **un partner in un mese**: cioe' una fattura che si puo' davvero emettere. Le righe sono ordinate dal mese piu' recente, il mese ancora aperto porta scritto «in corso», e il tasto **Fattura** compila il primo e l'ultimo giorno di quel mese. Per i servizi di vendita ci sono due colonne nuove, **Venduto** e **Dovuto al partner**: il cliente paga Deluxy, che trattiene la propria percentuale e deve il resto al partner. Ogni riga ha poi **Recap**, che scarica il riepilogo del mese da mandare al partner (elenco consegne, imponibile, IVA, totale, e per le vendite valore venduto, quota Deluxy e dovuto a loro), e **Invia**, che lo manda all'indirizzo di fatturazione passando da AI Mail — con una conferma esplicita, perche' e' una mail che esce davvero. **Nel recap non compaiono i dati dei clienti**: niente nome, cognome o indirizzo del destinatario, solo la provincia; ogni consegna resta identificata dal proprio numero. Infine tutto cio' che precede il **1° agosto 2026** e' stato segnato come gia' fatturato: la pagina mostra il lavoro aperto, non vent'anni di archivio.
> - 24/08/2026 (4) — **Solo consegne valide, e l'arretrato messo da parte.** Fatturazione e Stipendi contavano anche consegne **non consegnate, invalidate e cancellate**: il filtro che avrebbe dovuto escluderle usava una grafia di stato che in banca dati non esiste, quindi non escludeva niente. Corretto: ora entrano solo le consegne valide e non cancellate, e gli stipendi includono anche le consegne **approvate** (550 che restavano fuori). Il compenso del valet, poi, si ricava dal **suo** listino anche quando la consegna non dice quale servizio ha svolto: si sceglie per tipo di prezzo (a ore o fisso), recuperando oltre 7.000 consegne che risultavano senza paga. Un listino che riporta zero adesso vale **zero davvero** — una fee dello 0%% è una scelta commerciale, non un dato mancante — e le consegne escluse da una regola carnet sono contate a parte, come **«Escluse da regola»**, invece di sembrare dati incompleti. Infine le consegne senza tariffa **più vecchie del 1° luglio 2026 escono dagli elenchi**: vengono da rapporti chiusi e da account interni, nessuno le fatturerà o pagherà mai. Non spariscono in silenzio: la pagina dice quante sono e da quale data, e le righe restano in banca dati.
> - 24/08/2026 (3) — **Stipendi come la Fatturazione, e le regole entrano nei conti.** La pagina Stipendi ha ora la scheda **Da pagare** come prima voce: un valet per riga con periodo, consegne, lordo, contanti da scalare, netto e il dettaglio consegna per consegna; il tasto **Paga** apre il pannello Genera già compilato. Lo stipendio ha finalmente le **righe** (prima era un totale e basta, e non si sapeva quali consegne contenesse). La paga si calcola secondo il **tipo di servizio** — a ora con il minimo di ore, a pezzo, o fissa — leggendo il listino del valet, e non più con il solo importo scritto sulla consegna. Ci sono i **filtri** (ricerca, valet, periodo, stato, «solo pagabili»), come in Fatturazione. **Le regole importate dal legacy adesso si applicano davvero**, su entrambe le pagine: le *regole carnet* portano lo sconto sulla fattura (fino a −28 € a consegna), il plus/minus sulla paga, e possono dire di **non fatturare o non pagare affatto** una consegna — il carnet è già stato pagato in anticipo, rifatturarlo sarebbe chiedere due volte; le *regole valet* aggiungono un plus a scaglioni sul **numero di ritiri** del giro, per pagare di più chi in un giro ritira in più posti. Né il prezzo né la paga possono scendere sotto zero. Le consegne che non hanno né un importo né un listino restano **fuori** dal documento, contate in una colonna apposita: metterle a zero sarebbe un documento che dice il falso.
> - 24/08/2026 (2) — **Fatturazione: «Da fatturare», e il prezzo dipende dal tipo di servizio.** La pagina Fatturazione mostrava solo le fatture già fatte: cercando un partner senza fatture rispondeva «Nessuna fattura», e la consegna di stamattina non compariva da nessuna parte. Ora la prima scheda è **Da fatturare**: un partner per riga con periodo, numero di consegne, imponibile e totale con IVA, il riepilogo in cima e il dettaglio consegna per consegna; il tasto **Fattura** apre il pannello Genera col partner e il periodo già compilati (non emette da solo: il periodo è una scelta contabile). Inoltre la generazione **salta le consegne già fatturate** — prima rigenerare lo stesso periodo lo fatturava una seconda volta — e soprattutto **calcola l'importo secondo il tipo di servizio** invece di usare sempre il prezzo scritto sulla consegna: prezzo fisso (listino + km oltre gli inclusi + supplemento fuori città), **a ora** (tariffa oraria × ore, con il minimo di ore del servizio), **magazzino** (prezzo base + prezzo a pezzo × pezzi), **vendita** (il numero del listino è una **percentuale** sul venduto, non euro) e **corporate** (dal valore dei prodotti). Il prezzo eventualmente già scritto sulla consegna vince sempre, perché è quanto si decise quel giorno. Le consegne che non hanno né un prezzo né un listino del partner per il loro servizio **restano fuori dalla fattura** e la pagina le conta nella colonna **Senza prezzo**: metterle in fattura a 0 € sarebbe un documento che dice il falso.
> - 24/08/2026 — **La fattura ha imponibile, IVA e totale, non un numero solo.** Prima la fattura teneva un `totalAmount` che era la **somma delle righe**, cioè l'imponibile chiamato «totale»: le fatture nuove sarebbero uscite **senza IVA**, e le 559 storiche importate dal legacy uscivano **a 0 €** su 291 casi. Misurando il rapporto fra l'importo dichiarato dal legacy e la somma delle righe è venuta fuori la mediana **1,220 esatta**: il campo `invoiceAmount` del vecchio sistema era il totale **con IVA al 22%** (194 fatture su 267 compilate combaciano al centesimo), e su 291 fatture non era mai stato compilato. Ora la fattura ha **Imponibile** (somma delle righe), **IVA 22%** e **Totale** — tre colonne in elenco e tre colonne nell'esportazione CSV. Dove il totale non veniva dal documento ma è ricostruito dall'imponibile, l'elenco lo dichiara con la pillola **«ricostruito»**. Le fatture il cui importo dichiarato non è né l'imponibile né l'imponibile con IVA (78, vecchie, con consegne ri-prezzate dopo l'emissione) **restano com'erano**: il documento è stato emesso con quel numero.
> - 19/07/2026 (3) — **Dettaglio consegna: tasti azione come app.deluxy.it** (feedback). La pagina di dettaglio consegna ora ha in alto **Stampa · Maps · Condividi · Link consegna · Assegna** (come l'app reale). **Stampa** = stampa la scheda; **Maps** = apre Google Maps sull'indirizzo/coordinate; **Condividi** = copia il link pubblico di monitoraggio; **Link consegna** = copia il link pubblico di **conferma consegna**; **Assegna** = pop-up coi valet della provincia della consegna (riusa `PATCH /:id/assign`). Condividi/Link/Assegna solo admin/operation. Nuovo flusso pubblico **conferma consegna**: pagina `/consegnata/:token` (senza login) dove chi ha il link indica **chi ha ritirato** e conferma → la consegna passa a **Consegnata** (endpoint `@Public() POST /deliveries/delivered/:token`, idempotente; campo `Delivery.receivedBy`, migrazione `delivery_received_by`; log "Consegna confermata").
> - 19/07/2026 (2) — **Fatturazione: regola consegne + dettaglio riga per riga** (feedback). La generazione fattura ora include **ogni consegna «da fatturare»** (`billable`) del partner nel periodo **in qualsiasi stato tranne annullata/non consegnata** (prima solo le *consegnate*) — così anche le consegne *Da gestire* compaiono. La fattura ha ora il **dettaglio riga per riga**: una riga per consegna con **data, destinatario, indirizzo, importo** (`price + additionalPrice`); il totale è la somma delle righe. Nuovo modello `InvoiceLine` (migrazione `invoice_lines`), snapshot al momento della generazione; in pagina il bottone **Dettaglio** espande le righe sotto la fattura.
> - 19/07/2026 (1) — **Webhook «fattura pagata»** (API inbound). Un sistema esterno (contabilità/incassi) può segnalare alla piattaforma che una fattura è stata pagata chiamando `POST /api/v1/invoices/webhook/paid` con header **`x-api-key: <INVOICE_WEBHOOK_API_KEY>`** e body `{ "number": "FAT-2026-3" }` (oppure `{ "id": "…" }`, con `paidAt` opzionale ISO). La fattura passa a **Pagata** e va in Storico. **Idempotente** (se già pagata risponde `esito: gia_pagata`), `401` senza/chiave errata, `404` se la fattura non esiste. La chiave sta in `INVOICE_WEBHOOK_API_KEY` (env, non committata; se assente il webhook è disattivato). Macchina-a-macchina: non richiede login utente.
> - 18/07/2026 (12) — **Sezione Fatturazione** (era mancante): **Amministrazione → Fatturazione** (`/invoices`). Gemello degli Stipendi ma lato partner: si **genera la fattura** di un partner per un periodo sommando **prezzo + plus** delle consegne del partner marcate «da fatturare» (`billable`) ed **effettuate** (delivered) nel periodo; numero `FAT-<anno>-<n>`. Flusso **Bozza → Emessa → Pagata**: *Emetti* archivia nello **Storico** (tab), *Segna pagata* chiude; si può **Riaprire** una fattura non ancora pagata. Colonna **Stato pagamento** nello Storico, filtro per partner, **Esporta** CSV. Admin/operation gestiscono; il partner vede le proprie. Nuovo modello `Invoice` (migrazione `invoice_model`), `InvoicesService` (`GET /invoices?archived=`, `POST /generate`, `PATCH /:id/status`, `POST /:id/reopen`). *(I campi partner `invoiceEmail`/`invoicingEnabled`/`sdiCode` e i campi consegna `billable`/`price`/`additionalPrice` esistevano già.)*
> - 18/07/2026 (11) — **Pagamento stipendio → storico in Pagamenti** (feedback). Quando uno stipendio passa a **Pagato** (dal bottone *Paga* nelle Ricevute o da *Segna pagato* in Stipendi → Archivio), viene creato automaticamente un record in **Pagamenti** come storico: tipo **Stipendio**, importo = netto, stato **Pagato**, descrizione col periodo, collegato allo stipendio (`Payment.salaryId`). Creato una sola volta (idempotente sulla transizione a PAID). Nuovo tipo `PaymentType.SALARY`.
> - 18/07/2026 (10) — **Ricevute: bottone "Paga"** (feedback). Nella tab **Firmate** della pagina Ricevute, admin/operation hanno un bottone **Paga** che segna lo stipendio collegato come **pagato** (`PATCH /salaries/:id/status` → `PAID`) direttamente dalla ricevuta, senza passare da Stipendi → Archivio. Dopo il pagamento la riga mostra il badge **Pagato**. Il valet non vede il bottone.
> - 18/07/2026 (9) — **Ricevute: upload del file dal PC** (feedback). Nella pagina Ricevute il valet può ora **caricare un file dal computer** (immagine o PDF, max 10 MB) oltre a incollare un link: nel riquadro "Carica firmata" c'è un selettore file **"Scegli file dal PC…"** *oppure* il campo URL. Il file va su disco lato server (`api/uploads/receipts/`, cartella non versionata) ed è servito staticamente da `/uploads/…`; il link **Apri** lo riapre. Backend: nuovo `POST /receipts/:id/upload` (multipart, `multer` diskStorage) accanto al `POST /receipts/:id/sign` (URL); `main.ts` ora serve `/uploads` come statici. *(Superato il TODO "upload binario" della nota precedente.)*
> - 18/07/2026 (8) — **Sync partner → registro Anagrafiche (portata nel branch)**. Alla creazione, modifica e disattivazione di un partner la piattaforma ora **invia il partner al registro centralizzato Deluxy Anagrafiche** (`POST /api/v1/partners` con `platformId` = id del partner, `fonte: platform`, categoria, referenti; `stato: attivo/dismesso`). È l'unica app con chiave di **scrittura**; la sync è **best-effort e fire-and-forget** (se il registro è spento o manca `ANAGRAFICHE_API_KEY`, l'operazione va comunque a buon fine e il mancato invio finisce nei log). Config in `api/.env` (`ANAGRAFICHE_URL`, `ANAGRAFICHE_API_KEY`; esempio in `.env.example`). *Nota: questa integrazione esisteva in un'altra copia del repo ma non era presente su questo branch — ora è allineata (`AnagraficheSyncService` agganciato a create/update/remove di `PartnersService`).*
> - 18/07/2026 (7) — **Stipendi allineati all'app reale** (feedback "ci sono cose che non hai considerato"). Aggiunti i pezzi mancanti rispetto a `app.deluxy.it/valet/stipendi`: **① Ricevute con firma** — inviando lo stipendio si genera automaticamente la **ricevuta** (numero `RIC-anno-n`) in una nuova sezione **Ricevute** (voce di menu, `/receipts`); il **valet** la ricarica **firmata** (link al file, come per gli altri allegati) e solo allora lo stipendio passa a *Ricevuta firmata → da approvare*; l'**approvazione è bloccata** finché la ricevuta non è firmata. **② Reclamo per riga** — bottone **Reclamo** su ogni stipendio che apre una richiesta collegata (es. rimborso Area C): riusa i Pagamenti (`Payment.salaryId`), lo stipendio mostra il tag *Reclamo aperto*. **③ Esporta** — bottone che scarica la lista corrente in **CSV**. **④ Frequenza stipendio** — generando, il periodo è **proposto in automatico** dalla frequenza del valet (`salaryFrequency`: settimana corrente se *settimanale*, mese corrente se *mensile*). Backend: nuovo modulo **Receipts** (`GET /receipts?signed=`, `POST /receipts/:id/sign`), la ricevuta è creata all'invio (non più a uno stato separato), `POST /salaries/:id/reopen` cancella anche la ricevuta; `Payment.salaryId` (migrazione `payment_salary_link`). *(Nota: il file firmato è un **URL** come per DDT/immagini — l'upload binario resta un miglioramento futuro.)*
> - 18/07/2026 (6) — **Stipendi: Attivi/Archivio, stato finanziario e riapertura** (feedback). Un solo punto in cui si sceglie il valet (il pannello **Genera** eredita il valet dal **filtro** in alto, niente doppia scelta). Di default la lista mostra gli **stipendi attivi** (non in archivio); tab **Archivio** per quelli inviati. **Invia** (`Bozza → Inviato`) **archivia** lo stipendio: esce dagli attivi ed entra in **Archivio**. In Archivio compare la colonna **Stato finanziario** (**Non pagato** finché lo stato non è *Pagato*, poi **Pagato**) e si può **Riapri**re un record (torna in Bozza tra gli attivi) **solo se non è ancora pagato**; uno stipendio **Pagato** non è più riapribile. Campo `Salary.archived` (migrazione `salary_archived`), endpoint `GET /salaries?archived=true` e `POST /salaries/:id/reopen` (admin/operation).
> - 18/07/2026 (5) — **Sezione Pagamenti** (era stub): **Amministrazione → Pagamenti**. Rimborsi e reclami dei valet (es. rimborso Area C): il **valet** apre una richiesta (Rimborso/Reclamo, importo, descrizione), **admin/operation** la **Approvano / Rifiutano / Segnano pagata** (flusso `Richiesto → Approvato/Rifiutato → Pagato`). Filtro per valet. Backend già presente (`Payment`, `PaymentsService`); aggiunto il gate ruolo sulla creazione (no partner).
> - 18/07/2026 (4) — **Sezione Stipendi** (era stub): **Amministrazione → Stipendi**. Lista degli stipendi (valet, periodo, lordo, contanti detratti, netto, documento, stato), **filtro per valet**, pannello **Genera stipendi** (valet + periodo → somma le paghe delle consegne effettuate nel periodo meno i contanti incassati alla consegna; documento **pro-forma fattura** se il valet ha P.IVA, altrimenti **ricevuta con ritenuta**), e **avanzamento del flusso** `Bozza → Inviato → Ricevuta in attesa → Approvato → Pagato` (solo admin/operation; il valet vede i propri in sola lettura). Backend già presente (`Salary`/`Receipt`, `SalariesService`); aggiunto solo il gate ruolo sull'avanzamento stato.
> - 18/07/2026 (3) — **Calendario anche per i valet, con disponibilità**: il valet ha il **suo calendario** (consegne assegnate) e dal pannello del giorno imposta la **disponibilità per data**: **Disponibile** / **Non disponibile** / **Disponibile in fascia** (dalle–alle + nota). Marcata sulla griglia (pallino rosso = non disponibile, oro = fascia). Modello `ValetAvailability` (aggiunto vincolo unique `valetId+date` e `note`, migrazione `valet_availability_unique`); endpoint `GET/PUT /valets/:id/availability` e `DELETE /valets/:id/availability/:date` (il valet solo la propria; admin/operation su tutti). Il componente calendario ora gestisce due contesti (partner→chiusure, valet→disponibilità). **Admin/operation** aprono il calendario di un valet dalla sua **scheda** (bottone Calendario → `/calendar?valetId=`).
> - 18/07/2026 (2) — **Calendario: chiusure e orari speciali per data** (come la disponibilità per data dell'app reale). Dal pannello del giorno si imposta per una **data specifica**: **Normale** / **Chiuso** (chiusura straordinaria) / **Orario speciale** (dalle–alle + nota). Le eccezioni **vincono** sull'orario settimanale e sono marcate sulla griglia (pallino rosso = chiuso, oro = orario speciale). Modello `PartnerDayException` (migrazione `partner_day_exception`), endpoint `GET/PUT /partners/:id/day-exceptions` e `DELETE /partners/:id/day-exceptions/:date` (il partner gestisce le proprie, admin/operation quelle di ogni partner). Inoltre **admin/operation** aprono il calendario di uno specifico partner dalla sua **scheda** (bottone Calendario → `/calendar?partnerId=`).
> - 18/07/2026 — **Calendario consegne** (anche per il partner): nuova sezione **Calendario** (menu, per Admin/Operation/Partner/Valet) con vista **mensile** che **marca i giorni con ordini** (conteggio nel badge); cliccando un giorno si apre l'elenco delle consegne di quel giorno con link alla scheda. Filtrato **per ruolo**: il partner vede solo i propri ordini. Endpoint `GET /deliveries/calendar?from=&to=` (conteggio per giorno + per stato, role-scoped). Per il **partner**, i **giorni di chiusura** (dai suoi orari di apertura, `OpeningHour.closed`) sono **evidenziati** (motivo tratteggiato + legenda) e, selezionandone uno, un avviso segnala che il negozio è chiuso.
> - 17/07/2026 (12) — **Orari di apertura del partner** (nuovo ambiente): sezione **Orari di apertura** nel form Partner — griglia settimanale (lun→dom) con "Chiuso" e orario *dalle–alle* per ogni giorno, più "copia il lunedì su tutti"; mostrati anche nella **scheda partner**. Usa il modello `OpeningHour` (già presente) via il campo `openingHours` del partner (salvato con deleteMany+create). ⚠️ **Nota**: nell'app reale "Orari Apertura" (`/partner/availability/list`) è la **disponibilità per data** (con link pubblico per partner) — concetto più avanzato; qui è stato realizzato prima l'**orario settimanale ricorrente** (base naturale). La disponibilità per data resta un possibile passo successivo.
> - 17/07/2026 (11) — **Autocompletamento indirizzi Google Places** nel form Consegna: sul campo **Indirizzo destinatario** compare il menu a tendina dei suggerimenti Google (indirizzi in Italia); selezionandone uno l'indirizzo si compila e la **provincia** viene ricavata dai dati Google (che filtra partner/valet). Usa la **chiave browser** delle Impostazioni (serve anche l'API "Places" abilitata, oltre a "Maps JavaScript"); senza chiave il campo resta normale con la geocodifica server come prima. Soppresso anche l'autofill di Chrome sul campo. Lo script Google Maps ora si carica una sola volta (helper condiviso con la mappa, con libreria `places`).
> - 17/07/2026 (10) — **Mappa consegne** (come l'app reale): pannello espandibile **"Mostra mappa"** nella lista Consegne (solo Admin/Operation) con i **puntatori dei luoghi di consegna** su Google Maps, colorati per stato e con popup (codice, destinatario, indirizzo, fascia, valet, link alla scheda), che **rispetta i filtri** (stato, data). Architettura: le **coordinate si salvano sulla consegna** (`Delivery.latitude/longitude`, geocodificate una volta alla creazione/modifica con la chiave server; endpoint backfill `POST /deliveries/geocode-missing` per le esistenti), la mappa legge da `GET /deliveries/map` — nessuna geocodifica a runtime. Due chiavi in Impostazioni: `googleMapsApiKey` (segreta, server, geocodifica) e **`googleMapsBrowserKey`** (per la mappa JS nel browser, da restringere per referrer). Senza chiave browser il pannello mostra un avviso; senza coordinate, "nessuna consegna geolocalizzata".
> - 17/07/2026 (9) — Pagina **Utenti**: aggiunta la **ricerca globale** (email, nome, ruolo, stato, anagrafica collegata) e **rimosso il pulsante "Nuovo utente"** — gli utenti nascono con l'anagrafica (Partner/Valet/Operatore), non si creano da qui.
> - 17/07/2026 (8) — **Stati modificabili in linea dalle liste**: nelle liste **Partner** (Pagamento + Stato), **Valet** e **Operatori** la pillola di stato è ora un menu a clic (componente `StatusSelectComponent`): si cambia lo stato senza aprire "Modifica" (aggiornamento ottimistico con rollback in caso di errore). Backend: aggiunto `active` ai DTO di Partner/Valet/Operazione (prima veniva scartato dal ValidationPipe `whitelist`); l'update parziale non tocca le relazioni.
> - 17/07/2026 (7) — **Gestione utenti rifatta (accesso separato dall'operatività)**: `User.active` sostituito da uno **stato esplicito** `invited | active | suspended | archived` (migrazione `user_status_invite_audit`). **Invito invece di password impostata dall'admin**: creando Partner/Valet/Operatore si crea (in un gesto solo) l'**utente collegato in stato "invitato"** con token monouso a scadenza (7 gg); la persona apre il link pubblico `/invite/:token`, sceglie la password e l'account si attiva da solo (`GET /auth/invite/:token`, `POST /auth/accept-invite`). **Revoca immediata**: il guard verifica lo stato sul DB a ogni richiesta, quindi sospendere/archiviare toglie l'accesso subito (non dopo la scadenza del token). **"Elimina" = archivia** (lo storico consegne/stipendi/fatture resta). Nuova pagina **Configurazione → Utenti** (solo admin): lista con stato/ruolo/anagrafica collegata e azioni Attiva/Sospendi/Archivia/Reinvita (il link d'invito si copia negli appunti); **audit** di ogni azione in `UserEvent`. `User` ora collega anche l'**operatore** (`operationId`). Nota: senza server email l'invito è un **link da copiare e condividere** (predisposto per l'invio automatico futuro).
> - 17/07/2026 (6) — **Nuova sezione Configurazione → Impostazioni (solo admin)**: chiavi API dei servizi esterni salvate **solo nel database** (`AppSetting`, migrazione `app_settings`; endpoint `GET/PUT /settings`, admin). Prima chiave: **Google Maps** — usata da `GET /settings/geocode` per geocodificare l'indirizzo della consegna e ricavarne la **provincia** (come l'app reale); la pagina ha un tester ("Prova geocodifica"). Nel form consegna la geocodifica parte con debounce dopo la digitazione dell'indirizzo e, se trova la provincia, **vince sul riconoscimento testuale** (che resta il fallback senza chiave). Inoltre **Ora ritiro** è ora una **tendina di orari** (00:00–23:30 a passi di 30 minuti) invece del campo orario libero.
> - 17/07/2026 (5) — Fusione del branch `platform-delivery-slots` in `deluxy-scout` (in due riprese: prima i commit pushati, poi ricerca/filtri/archivio): le due implementazioni delle **fasce di consegna dal setup del servizio** (fatte in parallelo) sono state riconciliate tenendo quella del branch slots; in più il **seed** ora applica il setup prenotazione demo (fasce 2h 08–20, flessibile consentito su "Consegna prezzo fisso") anche ai DB già popolati.
> - 17/07/2026 (4) — **Filtri e ordinamenti su tutte le liste**. Convenzione decisa: **una sola ricerca globale** (cerca in *tutti* i campi testuali, comprese le relazioni — es. cercando "Fiori" trova i prodotti della categoria Fiori), **data/ora con filtri propri** (`dateFrom`/`dateTo`), **ogni colonna ordinabile** asc/desc. Due strategie in base al volume: **server-side** per le liste grandi — **Prodotti** (8.503 in produzione), **Consegne**, **Clienti** (4.092) — con contratto comune `?q=&sort=&dir=&page=&pageSize=` → `{items,total,page,pageSize}` (default 50, max 500, come l'app reale); **client-side** per le liste piccole (**Partner, Valet, Categorie, Servizi, Operatori**), che sono ≤243 record e servono soprattutto come tendine nei form. La ricerca è sempre in **AND con il filtro di ruolo** (un partner che cerca il nome di un altro partner non vede nulla) e l'ordinamento accetta solo campi in **whitelist**. ⚠️ In SQLite (dev) la ricerca è già case-insensitive; su **PostgreSQL** servirà `mode: 'insensitive'`.
> - 17/07/2026 (3) — **Fix: svuotare una collezione in modifica ora la cancella davvero**. I form inviavano array/oggetti solo se non vuoti e l'API scrive solo le chiavi presenti: rimuovendo *tutte* le immagini/piattaforme/varianti/campi di un prodotto (o province/servizi/indirizzi di ritiro di un partner, servizi/liste team leader di un valet, campi/sconti di una categoria, prodotti di una consegna) i vecchi valori **restavano**. Ora, **in modalità modifica**, le collezioni sono inviate sempre — anche vuote (`[]`/`{}`). Regola per i nuovi form: in edit inviare esplicitamente la collezione vuota.
> - 17/07/2026 (2) — **Nuovo ambiente: convenzione "riga → dettaglio + Modifica" estesa a tutte le anagrafiche**. In **Consegne, Partner, Clienti, Valet, Prodotti, Categorie, Servizi, Operatori** il **click sulla riga apre il dettaglio** (`/<sezione>/:id`, anche da tastiera con Tab+Invio) e la colonna **Azioni** ha il bottone **Modifica** (`/<sezione>/:id/edit`), che **riusa il form di creazione** in modalità modifica (precompilato, salva in PUT/PATCH, niente "Duplica"). Nuove pagine di dettaglio per tutte le sezioni. **Sezione Clienti creata da zero** (prima era solo uno stub): lista, form, dettaglio con le consegne del cliente. **API aggiunte perché mancanti**: `GET/PUT /categories/:id`, `GET/PUT /service-types/:id`, `GET /operations/:id`; `GET /customers/:id` ora include le consegne. Nota: gli operatori si aggiornano con **PATCH**, le altre sezioni con **PUT**.
> - 17/07/2026 — **Nuovo ambiente: azioni di riga delle Consegne implementate**. **MODIFICA**: form di modifica (rotta `deliveries/:id/edit`, riusa il form di creazione, salva in PUT); la regola del partner è applicata **lato server** (solo `created` e servizio ≠ VENDITA) — prima `PUT /deliveries/:id` era riservato ad Admin/Operation. **ASSEGNA**: pop-up con i valet che hanno abilitata la provincia della consegna (provincia dedotta dall'indirizzo); usa `PATCH /deliveries/:id/assign`. **ADDITIONAL VALET +/-**: pop-up per il plus/minus immediato sulla paga (`valetAdditionalPrice`). **MONITORARE**: link pubblico `/tracking/<token>` (token opaco su `Delivery.trackingToken`, endpoint `@Public()`), che espone **solo** codice, stato, data, fascia, nome del destinatario, partner, nome valet e log — niente indirizzo, contatti, note o importi. **Fix**: `update()` ora salva anche **prodotti** e indirizzi di ritiro (prima venivano scartati); `AssignValetDto.valetId` non aveva decoratore di validazione e veniva scartato dal ValidationPipe (l'assegnazione andava in errore 500).
> - 16/07/2026 (11) — **Consegne, semantica dei bottoni di riga** (chiarita dall'utente): **MODIFICA** apre la consegna in modifica; **ASSEGNA** apre un **pop-up con i valet che hanno abilitata la provincia** della consegna; **MONITORARE** apre un **link pubblico** di monitoraggio della consegna; **ADDITIONAL VALET +/-** dà **subito un plus o minus al valet** — **correzione**: il doc lo descriveva erroneamente come "aggiunta/rimozione valet extra". Nel nuovo ambiente il bottone DETTAGLI è sostituito dal **click sulla riga**.
> - 16/07/2026 (10) — **Consegne, permessi dei bottoni di riga** (regola di business dall'utente): **Admin** tutti i bottoni; **Partner** solo **MODIFICA**, finché la consegna è **in rosso** (stato *Da gestire*/`created` secondo la legenda colori dell'app reale) e solo su consegne **non di tipo servizio "vendita Deluxy"**; **Valet** solo **DETTAGLI**. Nota: nel nuovo ambiente la legenda colori era diversa dall'app reale (vedi §3.1) — allineata.
> - 16/07/2026 (9) — **Nuovo ambiente, form Prodotto allineato all'app reale**: tipo prodotto ora come **flag** (*Prodotto unico* + *Super prodotto*) invece del select; **partner aggiuntivi** mostrati solo se *Visible to other partners* è attivo; **Plus del prodotto obbligatorio**; hint *Linea* (valori separati da `;`); **galleria immagini** (URL multipli, prima = principale) e **descrizione per piattaforma**; **varianti ricche** — ogni variante ha Nome\*, **SKU manuale**, Giorni prep., Prezzo, Prezzo pubblico, Controlla stock/Giacenza. Backend: nuovi campi `ProductVariant` (publicPrice, sku, prepDays, controlStock, stock) e `Product` (images, platformDescriptions) + migrazione. La *sincronizzazione immagini su Shopify* resta uno stub (richiede integrazione Shopify).
> - 16/07/2026 (8) — **Form prodotto reale, comportamento verificato live** (app.deluxy.it): confermato il "reveal" delle checkbox — *Visible To Other Partners* mostra il selettore **partner aggiuntivi**; *Super Prodotto* mostra il selettore **prodotti componenti**; *ha varianti?* mostra **titolo opzione + varianti**, dove **ogni variante** ha Nome\*, **SKU\* manuale**, Giorni preparazione, Prezzo, Prezzo pubblico, Controlla stock proprio. Nel form reale *Partner* è un select singolo e *Linea* accetta più valori separati da `;`.
> - 16/07/2026 (7) — **Prodotti, altri campi** (chiarito dall'utente): **Nome alternativo del prodotto** = il nome che il **partner vede in Consegne** (col flag *Usa nome alternativo*); **Visible to other partners** = rende visibile il prodotto a un **altro partner anche se è il prodotto unico di un altro partner** (utile per il **Corporate Service**); **Super Prodotto** = il **flag** basta e indica un **prodotto combinato**. Resta da confermare il **comportamento** del flag *Varianti del prodotto*.
> - 16/07/2026 (6) — **Prodotti, semantica campi** (chiarita dall'utente, prima mancante nel doc): **Super Provincia** = il prodotto in vendita viene proposto a un **partner specifico** con una **% di scontistica calcolata per provincia**; **Not physical** = si abbina a **Shopify** e indica che il prodotto **non ha stock** (nemmeno su Shopify); **Non modificabile** = i **partner non possono modificarlo**; **Linea** = la **linea del prodotto**.
> - 16/07/2026 (5) — **Multilingua**: la piattaforma è ora multilingua (ngx-translate). Aggiunta la lingua **Inglese** oltre all'Italiano; **selettore lingua con bandierine** (SVG) fisso **in alto a destra**, disponibile anche nella pagina di login; la scelta è persistita (`localStorage`, default Italiano). Tradotti al momento shell/menu e login; le altre schermate si traducono in modo incrementale (chiavi in `web/public/i18n/it.json` + `en.json`). Inoltre nel **form consegna** nuovo flag **"Salva come nuovo cliente in Clienti"**: alla creazione, se il destinatario è nuovo, viene prima salvato in Clienti e poi creata la consegna collegata.
> - 16/07/2026 (4) — Form **Valet**: province di competenza e sezione **Team leader** ora usano un **menu a tendina "aggiungi"** (fra tutte le province/partner) con **chip rimovibili** invece della griglia di chip; aggiunta la lista **Partner esclusi** dallo scope del team leader (nuovo campo `teamLeaderExcludedPartners`, con migrazione). Un partner non può essere insieme associato ed escluso.
> - 16/07/2026 (3) — Form **Servizio** e **Valet**: nel Servizio, **Ora minima/massima di inserimento** sono ora **tendine (00:00–23:00)**. Nel Valet: **Luogo e Data di nascita sempre visibili**; con **Partita IVA** attiva compare **solo la P.IVA** (spariscono CF e % ritenuta); **senza** P.IVA compaiono **CF\*** e **% ritenuta**; l'**IBAN** è spostato nella sezione **Stipendio**. Documentati: *Partner magazzino* = il cliente ha lo stock dei propri prodotti monitorato; *% ritenuta* = % di rimborso spese per ricevuta fiscale sul totale dei servizi effettuati. (Categorie partner e province partner/valet sono già a **selezione multipla** a chip.)
> - 16/07/2026 (2) — Form consegna, **ordine e dipendenze dei campi**: 1) **Servizio** è il primo campo; 2) **Indirizzo destinatario** è il secondo; 3) la **Data consegna** ha come minimo (e default) **oggi + giorni di preavviso** del servizio. Inserito l'indirizzo, il sistema rileva la **provincia** e mostra **solo i partner e i valet con quella provincia abilitata**; inoltre — **novità di questo sviluppo** — mostra **solo i partner che hanno abilitato quel tipo di servizio**. (Nel nuovo ambiente la provincia è dedotta dal testo dell'indirizzo — codice tipo `(MI)`, nome provincia o città; nell'app reale è geocodificata via Google Maps.)
> - 16/07/2026 — Form consegna, **fascia oraria di consegna a tendina**: quando la consegna **non** è flessibile si sceglie una **fascia predefinita** da un menu a tendina invece di un orario libero. Le fasce vanno da **Ora minima** a **Ora massima** del servizio (default **06:00–22:00**) con durata = **Fascia oraria** del servizio (`slotHours`, default 1 ora). La consegna mostra il flag "flessibile" **solo se il servizio lo consente** (nuovo campo servizio `allowFlexibleTime`); il **ritiro** resta sempre con orario flessibile opzionale e fascia automatica di 1 ora.
> - 15/07/2026 (4) — Form consegna, sezione **Gestione dell'ordine**: ogni prodotto mostra il **prezzo** e ha un flag **Prezzo flessibile** che ne consente la modifica (precompilato col prezzo base). Il prezzo override è salvato sulla riga della consegna (`DeliveryProduct.price` + `flexiblePrice`).
> - 15/07/2026 (3) — Form consegna: le fasce orarie di **consegna e ritiro** mostrano i campi **dalle–alle** solo se il flag "flessibile" è spuntato; altrimenti si sceglie un solo orario e la fascia è **automaticamente di 1 ora** (es. 10:00 → 10:00–11:00).
> - 15/07/2026 (2) — allineamento form all'app reale campo-per-campo: **Prodotto** (varianti con prezzo/SKU, multi-partner PRODUCTS PARTNER, piattaforme, controlla stock, non modificabile, super provincia, nome alternativo); **Partner** (PEC, promemoria attività, tipo codice consegna UNIQUE_PER_DELIVERY/CUSTOMER, KM inclusi/extra fuori città a livello partner); **Consegna** (Vendita Deluxy, prezzo flessibile, Valet Servizio, toggle Da fatturare/Da pagare, n° telefono SMS, file DDT).
> - 15/07/2026 — nuovo ambiente: form Categorie e Prodotti (con AI prompt, campi extra, sconti provincia, tipo/componenti); menu con sezione Prodotti e sezione Utenti; ruoli operatore (Operation/Finance/Project Manager/Customer Service). **Convenzioni nuovo ambiente**: ogni form di creazione ha un tasto **Duplica** (salva e mantiene i valori per un nuovo record); lo **SKU prodotto è generato automaticamente** (`DXY-NNNNN`, rigenerato a ogni creazione/duplicazione).
> - 14/07/2026 — chiarita la semantica del codice di consegna (`UNIQUE_PER_DELIVERY` = OTP per consegna reinviabile dal valet; `UNIQUE_PER_CUSTOMER` = codice fisso tipo PIN, rigenerabile dalla boutique in Customers); ritiro multiplo (scelta dell'indirizzo in fase di consegna); KM inclusi = dentro il comune / extra fuoricittà = fuori dal comune, verificato all'inserimento consegna.

---

## 1. Architettura tecnica e stato attuale

- **Frontend**: Angular (SPA) servita su https://app.deluxy.it — versione datata, da ammodernare.
- **Backend**: Node.js v12 (obsoleto; ultima LTS: v24) con API REST su `https://app.deluxy.it/api/*`.
- **Autenticazione**: JWT (Bearer token) con ruoli nel payload (`admin`, `expert`, `partner`, `operation`); endpoint `/api/auth`, `/api/users/me`.
- **Integrazioni attive rilevate**: Google Maps (geocoding/mappe), Stripe (pagamenti), Qonto (banking, da Profilo), Web Push Notification (`/api/web-push-notification`), SMS, WhatsApp, WooCommerce (plugin `deluxy-send-order`), Shopify (prodotti e piattaforme di vendita). **[NUOVO]**
- **Endpoint API osservati**: `/api/users/me`, `/api/auth/<token>`, `/api/experts/delivery/experts`, `/api/web-push-notification/count/:id`. Il ruolo "valet" nelle API si chiama **"expert"**.
- **[NUOVO — nuovo ambiente] Multilingua**: il nuovo frontend è internazionalizzato con **ngx-translate**. Lingue attive: **Italiano** (default) e **Inglese**. Selettore a bandierine in alto a destra, scelta persistita in `localStorage`. File di traduzione: `web/public/i18n/{it,en}.json`. Le stringhe si migrano alle chiavi in modo incrementale.

### Limiti attuali e strategia

- Node.js v12 e Angular datati: dipendenze deprecate, nuove feature difficili da integrare, manutenzione sempre più complessa e rischiosa.
- **Strategia concordata**: mantenere la piattaforma attuale stabile in produzione e creare un ambiente di staging parallelo con stack aggiornato (Node 22+ LTS, framework moderno, API-first, PWA multi-dispositivo), migrando gradualmente (strangler pattern).
- È stato creato il nuovo ambiente **`deluxy-platform-next`** (monorepo: API NestJS + Prisma + frontend Angular moderno, OpenAPI/Swagger, seed demo, Docker) come base della nuova versione.

## 2. Utenti e ruoli

Ruoli disponibili: **Admin** (solo alcuni admin — es. "support" — abilitati a Finanza), **Partner**, **Valet** (nei sistemi: "expert"), **Operation**, **Project Manager** (come Operation ma senza Consegne e Attività).

| Ruolo | Accessi |
|---|---|
| **Admin** | Tutto. Alcuni admin abilitati alla parte Finanza che mostra la marginalità dell'azienda. |
| **Partner** | Consegne, Customers, Prodotti, Modelli SMS (solo partner abilitati), Orari Apertura (propri), Vendita, Fatturazione (solo partner abilitati). |
| **Valet (Expert)** | Consegne, Activities, dati Partner e Valet (disponibilità orari), Disponibilità, Stipendi, Regole Valet, Pagamenti, Ricevute. |
| **Operation** | Consegne, Activities, Partner (+aggiunta), Valet (+aggiunta), Customers (+aggiunta), Prodotti (+aggiunta), Modelli SMS (+aggiunta), Vendita, Cakes Order Product, Province & Cities. |

**Sotto-ruoli operatore** (impostati alla creazione dell'operatore, controllano la visibilità delle sezioni del menu): **[NUOVO]**
- **Operation** (base): vede la sezione Operatività; non vede Amministrazione.
- **Finance**: vede **anche** la sezione Amministrazione (Stipendi, Pagamenti, Regole, Finanza).
- **Project Manager**: **non** vede la sezione Operatività (Consegne, Attività, Vendite).
- **Customer Service**: **non** vede la sezione Amministrazione.

**Stati utente** — *app reale* (pagina Utenti): Attivo, Disattivo, Da convalidare, Sconosciuto. Ruolo assegnabile in linea: nessuno / admin / expert / partner / operation.

**Stati utente — nuovo ambiente** (rifatto 17/07, `User.status`): **Invitato** (creato, deve ancora scegliere la password dal link di invito), **Attivo** (può accedere), **Sospeso** (accesso tolto temporaneamente, riattivabile), **Archiviato** (cessato; il record resta per lo storico — è ciò che fa "Elimina"). Lo **stato dell'accesso è separato dall'operatività** dell'anagrafica (`Partner/Valet/Operation.active`): un partner può essere "sospeso in ferie" (non riceve consegne) restando un utente attivo, o viceversa. Ogni cambio di stato è tracciato in `UserEvent` (chi/quando/nota). **[NUOVO]**

**Dati attuali rilevati**: 550 utenti registrati, 243 partner, ~57 valet attivi in lista, 14 membri Operation, 4.092 customers, 8.503 prodotti.

## 3. Mappa completa delle sezioni (verificata in app)

Menu principale: **CONSEGNE · ACTIVITIES · PARTNER · VALET · UTENTI · PRODOTTI · VENDITE · FINANZA · SETUP · Profilo**. In alto a destra: nome utente, contatore notifiche push, logout.

### 3.1 Consegne (`/nuovo-consegne`)

- Tab: **CONSEGNE ATTIVE** e **NON CONSEGNATE** (archivio). Bottone **STORICO** per le consegne chiuse.
- Bottoni: AGGIUNGI + · ESPORTA · IMPORTARE · MAP · RESET · SCARICA IL FORMATO CSV · STORICO.
- Area "DELIVERIES MAP" espandibile con localizzazione delle consegne (funzione MAPPA + RESET con filtri).
- Legenda stati (colori): Da gestire (rosso), In gestione (giallo), In consegna (viola), In preparazione (arancione), Accettata (blu), Richiedi Annullamento (azzurro).
- Colonne della lista: Stato, Vendita, Platform, ID, Original Consegna, Data, Orario, Partner, Valet, Indirizzo, Ora Ritiro, Tipo Servizio, Da Fatturare, Da Pagare, Azioni.
- Filtri per colonna: stato (`created`/`assigned`/`delivering`/`inPreparation`/`accepted`/`requestCancellation`), piattaforma vendita (Deluxy=`shopifysale`, Cakes=`cakesales`, Flowers=`flowerssales`, Deluxy Experience=`deluxyexperiencesales`, Deluxy Dot Com=`deluxydotcomsales`), ID, date da/a, orari da/a, partner, valet, indirizzo, ora ritiro da/a, tipo servizio (`sales`/`hourlyrate`/`fixedprice`/`corporate`/`warehouseservice`), da fatturare Sì/No, da pagare Sì/No. Paginazione 10–500 elementi.
- Azioni per riga: DETTAGLI, MODIFICA, ASSEGNA, MONITORARE, **ADDITIONAL VALET +/-**. **[NUOVO]**
- **Cosa fa ogni bottone** (chiarito dall'utente): **[NUOVO]**
  - **DETTAGLI**: apre il dettaglio della consegna.
  - **MODIFICA**: apre la consegna **in modifica**.
  - **ASSEGNA**: apre un **pop-up con la lista dei valet che hanno abilitata quella provincia** (la provincia della consegna).
  - **MONITORARE**: apre un **link pubblico** dove è possibile **monitorare la consegna** (tracking accessibile senza login).
  - **ADDITIONAL VALET +/-**: permette di dare **subito un plus o minus al valet** (rettifica economica sulla paga del valet). *(Correzione: in precedenza il doc lo descriveva come "aggiunta/rimozione valet extra" — non è così.)*
- **Permessi sui bottoni di riga, per ruolo** (regola di business): **[NUOVO]**
  - **Admin**: **tutti** i bottoni.
  - **Partner**: può usare **MODIFICA** solo **finché la consegna è "in rosso"** — cioè nello stato **Da gestire** (`created`), secondo la legenda colori dell'app reale — e **solo sulle consegne che non sono di tipo servizio "vendita Deluxy"**.
  - **Valet**: solo **DETTAGLI**.
  - **Convenzione nuovo ambiente**: il bottone **DETTAGLI** non esiste — il dettaglio si apre **cliccando la riga** della consegna (per tutti i ruoli che vedono la lista). I bottoni restano solo per le azioni (Modifica, Assegna, Monitorare, Additional valet). **[NUOVO]**
- **Vista team leader in Consegne**: un valet **team leader** può, in questa schermata, **vedere tutte le consegne (delle sue province) oppure filtrare per vedere solo le proprie** — ha un filtro "tutte / solo le mie". Un valet normale vede solo le proprie. **[NUOVO]**

#### Dettaglio consegna (`/consegne/:id`)

- Azioni in alto: STAMPA · MAPS · SHARE · DELIVERED LINK · ASSEGNA.
- Toggle: **VERIFICA DELL'IDENTITÀ VALET** e **CODICE DI CONSEGNA RICHIESTO**. **[NUOVO]**
- Sezioni: Dati di consegna e ritiro (stato, data, fascia oraria, ora ritiro, consegna flessibile, valet) · Scelta del servizio (partner, nome/tipo servizio, prezzo, plus/minus al prezzo) · Informazioni destinatario e mittente (cognome/nome, SMS telefonici, indirizzo, citofono, telefono, email; cognome/nome/telefono mittente) · Gestione dell'ordine (pagamento alla consegna, contanti da incassare, prova e reso del prodotto, prodotto, immagine, quantità, variante) · Receipt info (nome di chi ha ricevuto, ricevuta) · Documentazione e note (numero DDT, file DDT, note, PERSONALIZZAZIONE, note interne) · Storico consegna (log con data/ora: inserita, partita, effettuata).
- Visibilità per ruolo: Partner vede valet/mezzo/telefono ma non note interne né costi consegna dei propri servizi; Valet vede note e note interne; Admin/Operation vedono tutto + logs. Nessuno vede l'indirizzo di ritiro nelle colonne della lista.

#### Passata UX su tutta l'app (Libro UX&UI) **[NUOVO 28/08/2026]**

Chiesta dall'utente sul modulo partner («pessima UX&UI... allinea e migliora la ux di tutta l'app»). Censimento con misure, poi le correzioni, tutte verificate in produzione:

- **Modulo partner** (la pagina segnalata): le righe-servizio avevano solo placeholder come label (viola la legge 1 del Libro) → **intestazioni di colonna** vere; **asterischi rossi** sugli obbligatori; **barra Salva/Annulla sticky** (7 sezioni spingevano la CTA oltre la viewport); **ricerca dentro le chip** di province (107) e categorie (65), con le già scelte sempre visibili; back a norma v1.5.
- **Tutti gli 8 form**: back con la **history** (il «← Torna a X» cablato buttava i filtri dell'elenco), asterischi rossi, barra sticky sui 4 form lunghi.
- **§7 — via i popup del browser**: gli 8 `confirm()`/`prompt()` sono diventati **conferme narrative** (componente unico `shared/conferma.component.ts`: nome dell'oggetto, conseguenze, verbo sul bottone rosso, ✕/Esc/scrim, fuoco su Annulla). Il rifiuto di una richiesta ha il campo del motivo nella finestra.
- **§8-bis — ricerca su ogni elenco**: aggiunta a 9 pagine che non l'avevano (attività, chiavi app, regole carnet, regole valet, pagamenti, ricevute, preventivi, richieste, vendite), con conteggio «N di M» a filtro attivo.
- **Legge 9** — Vendite: il fallimento del caricamento mostrava una **lista vuota**; ora card d'errore con «Riprova».
- **§9** — finestre: scrim dal token unico, **Esc** anche su regole-carnet e preventivi.
- **Dettaglio consegna — foto del prodotto**: il **nome del prodotto si clicca e apre la foto** (parità con l'app attuale; 10.579 prodotti su 22.952 la hanno). Chi non ha foto resta testo, senza fingere. ⚠️ La CSP bloccava le immagini di `app.deluxy.it`: aggiunto l'host a `img-src`.
- Globali: `:focus-visible` oro su chip/tab/azioni, bersagli ≥44px su touch.

#### Ordine aziendale: due righe, un viaggio, una paga **[NUOVO 28/08/2026]**

Un ordine aziendale nasce come **due consegne gemelle** (la riga aziendale di chi ordina e quella di vendita di chi fornisce), ma il valet fa **un viaggio solo**. Fino al 28/08 tutte e due portavano `payable = true` e la stessa paga, e il calcolo degli stipendi non escludeva la gemella.

- **Corretto**: sulle **50 coppie** con lo stesso valet e la paga su entrambe, la riga di **vendita** è ora `payable = false`. Valeva **553,91 €** di doppio pagamento sulle 34 già in uno stato che entra nello stipendio.
- Si spegne la riga di vendita e non quella aziendale perché è **l'aziendale a portare i chilometri**, da cui la paga si ricalcola; sulla gemella la distanza è vuota.
- ⚠️ Si usa un **flag sulla consegna**, non un filtro dentro il calcolo: il flag si vede aprendo la consegna e nel suo registro c'è scritto il motivo. Un filtro nascosto lo troverebbe solo chi legge il codice.
- Nessuno stipendio era ancora stato emesso (0 su 0): la correzione tocca quanto si pagherà, non quanto è stato pagato. Backup in `api/scripts/backup-paga-doppia-corporate.json`, script `correggi-paga-doppia-corporate.mjs` (prova a vuoto di default).

#### Le paghe dei valet, verificate sul database originale **[NUOVO 28/08/2026]**

`api/scripts/verifica-paghe-vs-legacy.mjs`:

| controllo | esito |
|---|---|
| listino dei valet (importo + € per km) | ✅ **240 righe su 240 identiche** |
| tariffa fuori città | ✅ **285 valet su 285 uguali** |
| paga scritta sulla consegna | 460 diverse su 61.404 — **tutte spiegate**: 88 da un backup di script, 372 con una nota nel registro della consegna, **0 senza spiegazione** |

⚠️ **I valet hanno un catalogo di servizi tutto loro** (`tabella-38` nel legacy), separato da quello dei partner (`service.csv`), **e i due riusano gli stessi numeri**: l'id 5 è «Servizio Consegna Standard» a prezzo fisso fra i partner e «Servizio a Ora» fra i valet. Leggere il catalogo sbagliato produce un'accusa coerente e falsa — è successo, e il primo audit aveva dichiarato 107 righe sbagliate che erano tutte giuste.

#### Dettaglio consegna: il denaro di una VENDITA **[NUOVO 28/08/2026]**

Sulle consegne con modello **Vendita**, il campo prezzo **non è quello che prende il partner**: è la **quota trattenuta da Deluxy**. Con l'etichetta «Prezzo» accanto al valore dei prodotti si legge come l'incasso del fornitore, ed è un errore già commesso.

- L'etichetta diventa «**Quota Deluxy**» quando il modello è Vendita.
- Compare la riga «**Incasso del partner**» = valore della merce − quota, con la **stessa formula della Fatturazione** (`dovutoAlPartner` in `invoices.module.ts`): non una seconda versione dello stesso numero.
- La riga **non compare** se manca uno dei due valori — al valet i soldi del partner non arrivano dal server, e uno «0 €» al posto di un dato assente si leggerebbe come «non prende niente».
- Esempio reale, consegna #62455: valore prodotti **44,63 €**, quota Deluxy **8,93 €** (20%, la fee di MALI'A), **incasso del partner 35,70 €**.

**Il conto della vendita, che vede ANCHE IL PARTNER** (deciso dall'utente il 28/08/2026: *«per i servizi vendita il partner deve vedere il proprio incasso, nostra commissione e totale a lui dovuto»*). Un riquadro a parte, **fuori** dal blocco dei costi nascosto ai partner:

| | consegna #62455 |
|---|---:|
| **Il tuo incasso** (valore della merce) | 44,63 € |
| **Commissione Deluxy** (8,93 € + IVA 1,96 €) | −10,89 € |
| **Totale a te dovuto** | **33,74 €** |

- Il conto lo fa il **server** (`DeliveriesService.economiaVendita`), non la pagina: l'aliquota vive in **`api/src/common/iva.ts`** — spostata lì dalla fatturazione, perché due copie della stessa aliquota sono il modo in cui due schermate iniziano a dire due numeri diversi.
- ⚠️ **Il valore della merce si somma dalle righe di prodotto, NON dal campo `productValue`.** Misurato il 28/08/2026: su **13.507 vendite, 1.417 (10,5%)** hanno il campo diverso dalla somma delle righe, per **90.265 €** di scarto — e divergono anche nel database originario. La **fattura si fa sulle righe**, quindi la formula vive in un posto solo (`api/src/common/valore-prodotti.ts`) e la usano sia la fatturazione sia la scheda. Se il valore non è calcolabile il riquadro **non compare**: mostrare il numero del campo direbbe al partner un incasso che la sua fattura smentisce.
- ⚠️ **La Fatturazione mostra 35,70 € per la stessa consegna** ed è giusto: quello è il dovuto **prima** dell'IVA sulla nostra commissione. Sono due numeri diversi, non un disaccordo — la scheda lo **scrive sotto al conto**, perché due importi diversi senza spiegazione fanno dubitare di entrambi.
- Al **valet** il campo **non arriva affatto** (`economiaVendita` è fra i `SOLDI_DEL_PARTNER`); un **altro partner** non vede nemmeno la consegna. Provato: `api/scripts/prova-conto-vendita.mjs`, 8 prove su 8.

#### Form "Nuova consegna" (`/consegne/nuovo`) — campi completi

Data consegna\* · Indirizzo destinatario · Partner · Servizio\* · Fascia oraria consegna (+flag flessibile) · Fascia oraria ritiro\* (+flag flessibile) · Prodotto, quantità, prezzo flessibile · Vendita Deluxy · Valet · Valet Servizio · Stato consegna · Stato del pagamento · SMS telefonici · Pagamento alla consegna (+prezzo contanti) · Prova e reso del prodotto · Customer esistente (CHOOSE EXISTING CUSTOMER) o SAVE CUSTOMER · Cognome/Nome destinatario\* · Citofono\* · Telefono/Email destinatario · Cognome/Nome/Telefono mittente · DA FATTURARE (indirizzo di ritiro, prezzo, plus prezzo) · DA PAGARE (valet salario, plus/minus) · Numero DDT + file DDT · Note · PERSONALIZZAZIONE · Note interne · CODICE DI CONSEGNA RICHIESTO.

**Ordine e dipendenze dei primi campi (nuovo ambiente)**: **[NUOVO]**
1. **Servizio** è il primo campo: determina il preavviso e le fasce orarie di consegna.
2. **Indirizzo destinatario** è il secondo campo (obbligatorio): da esso si deduce la **provincia**.
3. **Data consegna**: minimo e default = **oggi + giorni di preavviso** (`noticeDays`) del servizio.
4. **Partner**: mostrati **solo i partner con la provincia dell'indirizzo abilitata E che hanno abilitato il tipo di servizio scelto** (il filtro per tipo di servizio è una novità del nuovo ambiente). Il **Valet** è filtrato per la sola provincia dell'indirizzo. Se la selezione precedente esce dal filtro, viene azzerata; se nessun partner soddisfa i criteri, un avviso lo segnala.
5. **Fascia oraria di consegna**: se il servizio **non** consente l'orario flessibile (o il flag è disattivo) si sceglie una **fascia predefinita a tendina** (da `minOrderTime` a `maxOrderTime`, default 06:00–22:00, durata = `slotHours`); se consentito e attivo, si indica una fascia libera **dalle–alle**. Il **ritiro** ha sempre il flag flessibile opzionale con fascia automatica di 1 ora.

**Regole**: obbligatori servizio, indirizzo, data (≥ oggi + preavviso), orario ritiro, nome e cognome destinatario, citofono, prodotto. In base all'indirizzo vengono proposti i partner della provincia (e del tipo di servizio); nell'app reale la provincia è geocodificata via Google Maps, nel nuovo ambiente è dedotta dal testo dell'indirizzo (codice tipo `(MI)`, nome provincia o città). La fascia minima per servizi orari è 1 ora. Il sistema associa automaticamente il tipo servizio partner al salario valet (fisso↔fisso, ora↔ora, vendita↔fisso). Con SMS telefonici parte il messaggio secondo i Modelli SMS (creata/partita/arrivata). Prodotti del partner mostrati per primi in grassetto. Per prezzo fisso: calcolo automatico distanza ritiro→consegna con extra KM per il partner e rimborsi valet. Consegne con stesso DDT: più ritiri in Activities, una sola consegna. Note interne visibili solo ad Admin/Operation/Valet.

**Problemi di salvataggio**: verificare numero di caratteri dei telefoni, validare l'indirizzo, verificare presenza prodotto, controllare il messaggio di errore in fondo al form.

**Compila con l'AI** **[NUOVO 27/08/2026]** — in cima al form della consegna **nuova** (mai in modifica) c'è un pannello «✨ Compila con l'AI»: si scrive o si **detta** un testo libero, oppure si carica una **foto** (un ordine scritto a mano, uno screenshot di WhatsApp), e i campi del modulo si riempiono da soli. Rotta `POST /api/v1/ai/consegna-da-testo` (Admin, Operation, Partner).

- ⭐ **Propone, non crea.** La rotta non scrive niente: la consegna nasce quando una persona preme **Salva**, come sempre. Ogni campo resta modificabile.
- Ogni proposta si **dichiara**: confidenza (verde = ci crede molto, oro = da ricontrollare, rosso = da rileggere riga per riga), una frase su che cosa ha capito, e l'elenco dei campi **non trovati**.
- Il modello ha l'ordine di **non inventare**: quello che non c'è resta vuoto. Un `null` **non cancella** quello che si è già scritto a mano.
- Con **due orari** (dalle–alle) la fascia flessibile si **apre** da sola, altrimenti il secondo orario finirebbe in un campo invisibile. L'indirizzo di ritiro e il prodotto, che non hanno un campo proprio, finiscono nelle **note**.
- ⚠️ La **voce** la trascrive il **browser** (Web Speech API), non l'AI: dove il riconoscimento vocale non esiste (Firefox, iOS datati) il bottone 🎤 non compare. Le **immagini** le legge davvero, fino a **4 MB**.
- ⚠️ Serve la chiave Anthropic in **Impostazioni → `aiApiKey`**. Senza chiave il pannello **non si mostra** (`/settings/public` espone il solo booleano `aiAttiva`, mai la chiave).

#### Più consegne insieme **[NUOVO 27/08/2026]**

Per **Admin e Operation** ogni riga della lista ha una casella: spuntandone una o più compare in cima la barra delle azioni — **stato**, **assegna valet**, **plus/minus valet**, ed **elimina** (solo Admin). Rotte `PATCH /api/v1/deliveries/massa/{stato|assegna|plus-valet|elimina}`.

- Le azioni di massa **non hanno regole proprie**: richiamano una per una quelle del caso singolo, quindi log, calcolo della paga e stati ammessi restano gli stessi.
- L'esito è **per consegna**: «fatto su 17, 3 non sono riuscite, la prima dice…». Massimo **200** consegne per volta.
- **Assegna**: si offrono solo i valet **attivi** che coprono la provincia di **tutte** le consegne scelte (le province si intersecano). Se nessuno le copre tutte, il pannello lo dice.
- La selezione vale per la **pagina corrente** e si azzera cambiando pagina o filtro.

**La vista si ricorda** **[NUOVO 27/08/2026]**: giorno, intervallo, stato, ricerca, vista e pagina finiscono nell'indirizzo. Il «← Consegne» del dettaglio e il tasto indietro del browser riportano alla lista **com'era**, non a oggi.

### 3.1-bis Servizi ricorrenti (`/recurring-services`) **[NUOVO]**

Il presidio che si ripete: «da lunedì a venerdì 7–8 per un partner». Si sceglie **come si ripete** (ogni N settimane con i giorni a chips · ogni N giorni · ogni N mesi con i giorni del mese), la **fascia**, il periodo, l'indirizzo di consegna e quello di **ritiro — proposto in automatico dall'indirizzo del partner scelto**. Aperto anche ai **Partner** per i propri, senza valet né prezzi: vale il listino che hanno già (il server li sovrascrive, non si fida del form).

- **Fasce diverse per certi giorni** **[27/08/2026]**: «lun–ven 7–8, sabato e domenica 8–9». Si dichiara solo ciò che cambia; i giorni senza eccezione usano la fascia normale. Due eccezioni **non possono** rivendicare lo stesso giorno (si rifiuta col nome del giorno), e su un settimanale un'eccezione su un giorno che il servizio non fa **si rifiuta** invece di non scattare mai. L'eccezione può portare anche un **valet diverso**.
- **Le ORE** **[28/08/2026]**: per i servizi **a ora** si scrive l'**inizio e quante ore**, e la fine si **calcola** (mostrata sotto il campo). Per gli altri resta la fascia dalle–alle. Prima si potevano dichiarare entrambe e potevano contraddirsi — e la paga del valet si calcola sulle ore.
- **Si vede che sta ancora creando** **[28/08/2026]**: finché mancano consegne, accanto al conteggio compare una **rotellina con «fatte/attese»** (es. 164/201). La pagina si aggiorna da sola ogni 30 secondi e **smette** quando ha finito. Un servizio sospeso non gira: è fermo, non in corso.
- **Quanto si genera per volta** **[28/08/2026]**: salvando nascono le consegne dei **primi 14 giorni** (il tasto risponde in un paio di secondi anche su un periodo lungo); il resto arriva a **lotti da 150** col giro dei 15 minuti, e la corsa notturna recupera l'arretrato. Misurato: **93 ms a consegna**, quindi un anno di consegne giornaliere si completa in tre giri.
- **Fin dove si genera** **[27/08/2026]**: se il servizio ha una **data di fine**, l'orizzonte è quella; senza, è una finestra mobile di **14 giorni** che la corsa notturna fa scorrere. Tetti: 400 giorni e 600 consegne per corsa, e il tetto raggiunto viene dichiarato. La generazione parte **subito** alla creazione e alla modifica, oltre che dal bottone e dal cron delle 02:30.
- **Modifica** **[27/08/2026]**: cambiando un ricorrente, le consegne **future e non ancora lavorate** vengono rimesse in riga (fascia, valet, indirizzi, prezzo) e quelle dei giorni che non tocca più vengono **annullate**. Non si toccano né quelle di oggi né quelle già accettate o consegnate.
- **Il prezzo viene dal listino** **[27/08/2026]**: senza prezzo scritto a mano vale il listino del partner per quel servizio (per i servizi a ora, moltiplicato per le ore), e la paga valet dal listino del valet. Prima nascevano a **zero**.
- La coppia (servizio, data) **non si rigenera**: una consegna cancellata a mano resta cancellata.

### 3.2 Activities (`/activities`)

- Vista VALET ACTIVITIES: attività di ritiro e consegna per ogni valet, ordinate per orario; filtro per valet; bottone STORICO; bottone "Reorder with time".
- Admin/Operation vedono tutte le attività; Team Leader vede le proprie e quelle dei valet delle sue province; il Valet vede solo le proprie.
- Ogni consegna genera un ritiro + una consegna; stesso indirizzo con più ritiri = più attività di ritiro e una consegna. Il furgoncino giallo imposta "in consegna" e sblocca la consegna. SEARCH cerca su qualsiasi campo.

### 3.3 Partner (`/partner`)

Sottomenu: Fatturazione (`/partner/fattura`), Orari Apertura (`/partner/availability/list`), Priorità (`/partner/priority/list`), Consegne Regole (`/partner/delivery/rules`), Invoice List (`/partner/invoices`), Carte (`/partner/cards`).

Lista: 243 partner. Colonne: ID, Ragione sociale, Email, Telefono, Città, Indirizzo, Partner's Catalog (categorie vendute), Payment Method, Payment Status, Attivo. Azioni: DISPONIBILITÀ, MODIFICA, ELIMINA. Bottone AGGIUNGI PARTNER.

Filtri pagamento: metodo (**Bank Transfer / Credit Card / Direct Debit Mandate**) e stato pagamento (**Active / Inactive / Blocked**). **[NUOVO]**

#### Scheda partner (campi completi, verificati)

- **Personal information**: Nome (insegna)\*, E-mail\*, Partita IVA, Codice Fiscale, Indirizzo\*, Telefono\*, Cognome/Nome referente\*, Azienda (ragione sociale).
- **Partner Provincia**: elenco province abilitate (es. MI, RM, CO, MB, LO, VA, BG, NO, PV, PC, CR, BS, LC) + AGGIUNGI PROVINCIA. Nelle consegne saranno selezionabili solo i partner con la provincia abilitata; i prodotti unici vengono caricati automaticamente.
- **Servizio**: elenco servizi abilitati con SERVIZIO PREZZO ed EXTRA KM PREZZO per servizio, più **KM INCLUDED** ed **EXTRA FUORICITTÀ PREZZO**. Significato confermato: **[NUOVO]**
  - **KM INCLUDED** → si applica alle consegne **all'interno dello stesso comune**: è la soglia di KM inclusi senza sovrapprezzo (per i servizi a prezzo fisso).
  - **EXTRA FUORICITTÀ PREZZO** → è il **costo per consegne fuori dal comune**; il controllo comune/fuori-comune viene fatto **all'inserimento di una nuova consegna**.
- **Categorie di prodotti** venduti dal partner.
- **Notifiche**: possibilità di inviare SMS, notifiche WhatsApp, notifiche mail.
- **Pagamenti e contratto**: periodo di validità del contratto (`startContractDate`/`endContractDate`), metodo di pagamento (bonifico/carta/SDD), conto bancario (IBAN), nome del conto, CODICE SDI, stato del pagamento (Active/Inactive/Blocked). **[NUOVO]** Le date contratto alimentano un job notturno (cron `checkingPartnerContract`, 03:00) che avvisa alla scadenza del contratto (flag `contractExpiryNotificationSent`). **[NUOVO — da codice backend]**
- **Fatturazione & Actions**: mail fatturazione (`billingEmail`) + flag ABILITA FATTURAZIONE (`billingAccess`).
- **Indirizzo di ritiro multiplo**: flag `isMultiplePickUpAddress`; quando attivo il partner ha una **lista di indirizzi di ritiro** (`pickupAddresses`, array) e **al momento della creazione della consegna si sceglie da quale indirizzo ritirare**. **[NUOVO]**
- **Campi di vendita**: URL del negozio (`partnerShopUrl`) + immagine (`saleImage`), usati nella presentazione delle vendite. **[NUOVO]**
- **Sicurezza**: VERIFICA DELL'IDENTITÀ VALET (`checkExpertIndentity`) e CODICE DI CONSEGNA RICHIESTO (`deliveryCodeCheck`) impostabili a livello partner. Il codice ha un **tipo** (`deliveryCodeCheckType`): **[NUOVO]**
  - `UNIQUE_PER_DELIVERY` (default): un **codice OTP diverso per ogni consegna**, inviato al cliente alla creazione della consegna; il valet può **reinviarlo** in fase di consegna.
  - `UNIQUE_PER_CUSTOMER`: un codice **fisso per il cliente** (come il PIN di una carta), assegnato una volta e valido per sempre; il cliente può chiederne la **rigenerazione** alla boutique tramite la sezione Customers dell'app (sui clienti della boutique).
- **Partner Magazzino**: flag `partnerHasWarehouse` che qualifica il partner come magazzino. **Significa che il cliente ha lo stock dei propri prodotti monitorato** (gestione delle giacenze dei suoi prodotti in magazzino). **[NUOVO]**
- **WooCommerce API key**: GENERATE KEY / COPY KEY per collegare il plugin deluxy-send-order.
- **Documentazione e note**. Bottoni: SALVA e DUPLICA.

> **Note tecniche (da entità `partner.entity.ts`):** il campo NOME* corrisponde a `businessName` (l'insegna) mentre AZIENDA è un campo separato `agency` (ragione sociale). Indirizzo, `city`, `latitude`/`longitude` vengono geocodificati automaticamente. Oltre ai valori per-servizio esistono anche `kmIncluded` ed `extraOutSideCityKmPrice` **a livello di partner** (soglia KM inclusi e prezzo extra fuori città globali). Le 3 notifiche sono `sendSms` / `receiveWhatsappMsg` / `receiveEmailMsg`.

#### Nel nuovo ambiente: cosa cambia nella lista e nella scheda **[NUOVO 28/08/2026]**

- **La lista non si allunga più per le province.** In cella si mostrano al massimo **6** voci e poi una coda «**+ altre N**» (l'elenco nascosto compare passandoci sopra). Misurato sui 289 partner: la mediana ne ha 1, il 75° percentile **12**, e due partner ne hanno **107** — senza tetto quelle righe erano alte il triplo delle altre. Stesso tetto sulle **categorie**. La coda **non è cliccabile**: la riga intera apre il dettaglio, e l'elenco completo sta lì.
- **Scheda partner → «Ultime consegne»**, in fondo: le **10** più recenti (numero, data, destinatario, servizio, valet, stato col colore della legenda). La riga apre la consegna. «**Vedi tutte**» porta all'elenco consegne **filtrato su questo partner**, con un chip che scrive il nome del partner e si toglie con un click, senza filtro sul giorno e con la vista «**Tutti gli stati**».
- **Scheda partner → «Registro Anagrafiche»**: i bottoni dicono che cosa faranno, perché sotto un'unica parola c'erano tre gesti diversi — «**Crea nel registro**» (la scheda non c'è), «**Collega al registro**» (c'è ma non è collegata), «**Aggiorna il registro**» (già collegate). Se nel registro ci sono **più schede possibili** il bottone resta visibile ma **spento**, col motivo: crearne un'altra sarebbe un doppione. «**Ricontrolla il registro**» rifà solo il confronto.

#### Sottosezioni Partner

- **Fatturazione** (`/partner/fattura`): selezione partner + GENERA FATTURA, STORICO, ESPORTA. Riepiloga la fatturazione del partner (visibile solo Admin; il partner la vede se abilitato).
- **Orari Apertura** (`/partner/availability/list`): lista disponibilità per data: partner, province coperte, fascia oraria, Available Sì/No. Ogni partner imposta i propri orari; consultabili anche via link pubblico `https://app.deluxy.it/partner/[id]/availability`.
- **Priorità** (`/partner/priority/list`): 27 regole attive. Per Provincia + Categoria Prodotto si definisce la lista ordinata di partner prioritari per le vendite di prodotti non unici (es. MI/Fiori → Maryflor, Angolo Fiorito, Fiorista Tonino…).
- **Consegne Regole** (`/partner/delivery/rules`): regole per carnet e servizi con numero di consegne garantito. Campi: Daily Number Rule (Sì/No), Total Number Rule (Sì/No), periodo di validità, time range, partner, KM distance, numero giornaliero di consegne, numero totale di consegne, Plus/Minus prezzo partner, Plus/Minus paga valet, tipo servizio, Da fatturare, Da pagare. Le regole si possono estendere a più partner (sezione Estensione). **[PORTATA nel nuovo ambiente il 20/07]** — sezione **Regole carnet** (`/delivery-rules`, ADMIN/OPERATION/PM): lista + form modale con tutti i campi sopra; Daily e Total come due Sì/No indipendenti; estensione multi-partner via multi-select. Backend `delivery-rules` con CRUD completo (modello `DeliveryRule`). **La scheda partner** mostra i carnet attivi del partner con le **consegne rimaste** e permette di **modificarli o aggiungerne** direttamente da lì (il partner resta sempre incluso). ⚠️ La *applicazione* della regola al calcolo consegne (garantire i numeri, applicare i plus/minus in fatturazione/paga) non è ancora agganciata: per ora è anagrafica delle regole. **Da verificare sullo schermo reale** (accesso admin): esattezza ed etichette dei campi, e cosa fa la "sezione Estensione".
- **Invoice List** (`/partner/invoices`): elenco fatture per partner. **[NUOVO]**
- **Carte** (`/partner/cards`): gestione carte associate ai partner (es. Jamtech Technologies, Deluxy Flowers) con NUOVO CARTE — collegata ai pagamenti con carta. **[NUOVO]**

### 3.4 Valet (`/expert`)

Sottomenu: Servizi Valet (`/valet/servizi`), Stipendi (`/valet/stipendi`), Ricevute (`/expert/receipts`), Orari Apertura (`/expert/availability/list`), Regole Valet (`/expert/rules`), Pagamenti (`/expert/payments`), Transazioni (`/transzioni`), Valet Contratti (`/expert/contracts`).

Lista: ID, Cognome, Nome, Email, Telefono, Città, Mezzo (Auto / Bicicletta / Furgone / Moto-Scooter), Team Leader Sì/No, Attivo. Bottone AGGIUNGI VALET.

#### Scheda valet (campi completi, verificati)

- **Personal information**: Cognome\*, Nome\*, E-mail\*, Telefono\*, Indirizzo\*, **Luogo di nascita (e provincia)** e **Data di nascita** (sempre visibili), flag **Partita IVA**. **Regola form nuovo ambiente**: **[NUOVO]**
  - con **Partita IVA** attiva si mostra **solo il campo P.IVA\*** (il valet fattura: niente CF né ritenuta in questa sezione);
  - **senza Partita IVA** si mostrano **Codice Fiscale\*** e **Percentuale Ritenuta (%)** (ricevuta con ritenuta d'acconto).
  - Le **coordinate bancarie (IBAN)** stanno nella sezione **Stipendio** (non più tra i dati fiscali).
  - **`% Ritenuta`** = **percentuale di rimborso spese per la ricevuta fiscale sul totale dei servizi effettuati** dal valet. **[NUOVO — chiarimento utente]**
- **Salary Frequency Setting**: frequenza dello stipendio\* (`salaryFrequency`: MENSILE / SETTIMANALE) e limite di deposito settimanale (`weeklyDepositLimit`). **[NUOVO]**
- **Team Leader**: flag `isTeamLeader`; quando attivo si impostano le **PROVINCE** in cui il team leader può vedere/assegnare consegne in autonomia, i **PARTNERS associati** e — **[NUOVO]** — i **PARTNER ESCLUSI** dal suo scope (`teamLeaderExcludedPartners`): il team leader gestisce i partner delle sue province **tranne** quelli esclusi. Un partner non può essere insieme associato ed escluso.
- **Valet Province**: province in cui il valet opera (distinte da quelle del team leader).
- **Selezione province/partner (nuovo ambiente)**: province di competenza, province e partner del team leader (inclusi/esclusi) si scelgono da un **menu a tendina "aggiungi"** tra **tutte** le voci disponibili; le voci scelte restano come **chip rimovibili** (scala con 108 province / 243 partner). **[NUOVO]**
- **Servizi**: per ogni servizio abilitato, Servizio Salario ed Extra Km/€; per i **servizi magazzino** anche **SALARY PER ITEM** (salario a pezzo). A livello valet: **Minimum KM Included** (soglia entro il comune) ed **EXTRA FUORICITTÀ PREZZO** (rimborso per consegne fuori dal comune). **Regola:** si può selezionare **un solo servizio a ora e un solo servizio a prezzo fisso** per valet. **[NUOVO]**
- **Notifiche**: solo **WhatsApp** e **Mail** (il valet **non** ha l'opzione SMS, a differenza del partner); **Mezzo** (Auto, Bicicletta, Furgone, Moto/Scooter — **selezione multipla**, e per ogni mezzo scelto si può scrivere il **modello**, es. «Fiat Panda»: `vehicle` a virgole + `vehicleModels` JSON); Note. **[NUOVO 26/08]** I mezzi dei 249 valet del legacy sono importati (`expert-vehicle` + catalogo `tabella-90`, script `importa-mezzi-e-team-leader.mjs`); le province da team leader del legacy (`team-leader-province`) risultavano già tutte coperte.
- **Note tecniche** (da `expert.entity.ts`): il valet nei sistemi è `Expert`; anagrafica (nome/cognome/email) sta sulla relazione `user`; la % ritenuta è `holdingPercentage`; le coordinate bancarie `bankAccountData`; `minimumKmIncluded` ed `extraOutSideCityKmPrice` sono a livello valet; indirizzo geocodificato (`city`, `latitude`/`longitude`).

#### Sottosezioni Valet

- **Servizi Valet** (`/valet/servizi`): 8 servizi. Tipi: Servizi a Prezzo Fisso, Servizi in Ora, Servizi Magazzino (es. SERVIZIO MAGAZZINO SWISS/CAPJARI/ECI, Servizio Incluso, Trasporto catering). Il valore è impostato per singolo valet nella sua scheda. Solo i prezzi fissi calcolano extra KM / fuoricittà.
- **Stipendi** (`/valet/stipendi`): filtro per valet + STORICO, GENERA STIPENDI, ESPORTA. Genera pro-forma fattura (valet con P.IVA) o ricevuta ritenuta (senza P.IVA). Invio stipendio → righe in storico → ricevuta generata in RICEVUTE da firmare → approvazione → pagamento. Il valet può aprire un RECLAMO su ogni riga (es. rimborso Area C). **[NUOVO 26/08]** Il dettaglio «da pagare» di un valet: rispetta il **periodo filtrato** (prima ignorava dal/al e mostrava tutto l'arretrato), ha le colonne **Consegna** (id `#code` cliccabile, apre la consegna in nuova tab), **Plus/minus** (quello della consegna + regola carnet + scaglione ritiri) e **Totale consegna**; e mostra **tutte** le consegne del periodo, marcate e non contate quando sono col flag **non pagabile** o **a ora in attesa di approvazione** (`delivered_time_to_approve`) — i totali di lista e recap restano solo sulle pagabili.
- **Ricevute** (`/expert/receipts`): ricevute generate automaticamente dall'invio stipendi; il valet le ricarica firmate per l'approvazione e il pagamento.
- **Regole Valet** (`/expert/rules`): regole per valet per definire i rimborsi per consegne con 2+ ritiri (lista per valet con edit/delete/expand).
- **Pagamenti** (`/expert/payments`): richieste di rimborso dei valet per servizi specifici. Stati: CREATA / APPROVATA + STORICO; filtro per valet.
- **Transazioni** (`/transzioni`): sezione transazioni valet (movimenti economici). **[NUOVO]**
- **Valet Contratti** (`/expert/contracts`): gestione contratti valet con colonne: ID, Valet, CONTRATTO GENERATO, CONTRATTO FIRMATO. **[NUOVO]**
- **Orari Apertura** (`/expert/availability/list`): disponibilità dei valet per data e fascia oraria.

### 3.5 Utenti / Operation / Customers

- **Utenti** (`/utenti`): 550 utenti; colonne ID, Email, Cognome, Nome, Ruolo (nessuno/admin/expert/partner/operation, modificabile in linea), Attivo (Attivo/Disattivo/Da convalidare/Sconosciuto), Elimina. Visibile solo ad Admin. Qui si attivano gli utenti appena registrati e si trasformano in Admin.
- **Operation** (`/operation`): staff d'ufficio (14 persone): Cognome, Nome, Email, Telefono, Attivo + AGGIUNGI. **Form "Nuovo Operation"**: Cognome\*, Nome\*, E-mail\*, Telefono\*, Indirizzo\*; notifiche WhatsApp/Mail; **Ruolo operatore**; Note. **[NUOVO]**
  - **Ruolo operatore** (controlla la visibilità delle sezioni del menu): **[NUOVO]**
    - `operation` (base): vede la sezione **Operatività**, non **Amministrazione**.
    - `finance`: vede **anche la sezione Amministrazione** (Stipendi, Pagamenti, Regole, Finanza).
    - `project_manager`: **non vede la sezione Operatività** (Consegne, Attività, Vendite).
    - `customer_service`: **non vede la sezione Amministrazione**.
- **Customers** (`/customers`): 4.092 clienti; colonne: ID, Owner (Admin/Operation/Partner), Partner, Cognome, Nome, Email, Data nascita, Citofono, Telefono, Indirizzo, Note. Azioni: DELIVERY (crea consegna dal cliente), MODIFICA, ELIMINA; AGGIUNGI, ESPORTA, IMPORTARE, formato CSV. Da questa sezione la boutique può **rigenerare il codice di consegna "fisso" del cliente** quando il partner usa `deliveryCodeCheckType = UNIQUE_PER_CUSTOMER` (vedi 3.3 Sicurezza). **[NUOVO]**

### 3.6 Prodotti (`/prodotti`)

- Tab: ATTIVA PRODOTTI, ARCHIVIO PRODOTTI, **SHOPIFY PRODOTTI** (sincronizzazione prodotti da Shopify). Viste TABELLA / GRIGLIA. 8.503 prodotti. **[NUOVO]**
- Bottoni: AGGIUNGI, ESPORTA, IMPORTARE, SCARICA IL FORMATO CSV, ELIMINAZIONE MULTIPLA (+SELEZIONA TUTTI), selettore stato Attivo/Disattivo.
- Colonne/filtri: ID, Foto, Nome, Variante SKU, Categoria, Prezzo, Prezzo Pubblico, Stock, Partner, SKU, Super Prodotto Sì/No, Super Provincia Sì/No, Prodotto Unico Sì/No, Approvato Sì/No, In Magazzino Sì/No, Attivo.
- Tipi di prodotto: **unici** (di un partner), **non-unici** (es. fiori), **superprodotti** (combinazioni di più prodotti). Flag "Visible to other partners" per rendere visibili i prodotti unici ad altri partner. Admin/Operation aggiungono qualsiasi prodotto; ogni partner carica i propri come unici.
- **Form "Nuovo prodotto"** (verificato campo-per-campo): sezioni **DETTAGLI** (Nome\*, Partner, Categoria\*, SKU, Giorni Preparazione, **Plus del prodotto** max 80\*, Descrizione rich text, Prezzo, Prezzo pubblico, Linea, Immagine; flag Non modificabile, Prodotto unico), **INVENTORY MANAGEMENT** (Controlla stock, Nome alternativo + Usa nome alternativo), **SHOPIFY CONNECTION** (Approvato, Attivo, Not physical, **SELECT PLATFORMS**: Deluxy/Cakes/Flowers/Business/Experience/DotCom + descrizione per piattaforma, image manager), **PRODUCTS PARTNER** (partner aggiuntivi che vendono il prodotto), **SUPER PRODOTTO** (componenti), **PRODOTTO VARIANTI** (flag ha varianti + titolo opzione + varianti con prezzo/SKU), **CAMPI OBBLIGATORI** (campi testuali). **[NUOVO — form prodotto completo, incl. varianti e multi-partner]**
  - **Significato campi (chiarito dall'utente)**: *Super Provincia* = in vendita il prodotto viene proposto a un **partner specifico** con una **% di scontistica calcolata per provincia**; *Not physical* = si abbina a **Shopify** e indica un prodotto **senza stock** (nemmeno su Shopify); *Non modificabile* = i **partner non possono modificarlo**; *Linea* = la **linea del prodotto**; *Nome alternativo del prodotto* = il nome che il **partner vede in Consegne** (attivo col flag *Usa nome alternativo*); *Visible to other partners* = rende il prodotto visibile a un **altro partner anche se è il prodotto unico di un altro partner** (utile per il **Corporate Service**); *Super Prodotto* = il **flag** è sufficiente e indica un **prodotto combinato** (composto da più prodotti).
  - **Comportamento checkbox (verificato live sul form reale)**: le sezioni con "reveal" mostrano campi aggiuntivi solo quando il flag è attivo. **Visible To Other Partners** → compaiono **PARTNER + AGGIUNGI PARTNER** (selettore partner aggiuntivi che vendono il prodotto). **Super Prodotto** → compaiono **PRODOTTI + AGGIUNGI PRODOTTO** (componenti del prodotto combinato). **Il prodotto ha varianti? [SI]** → compaiono **NOME OPZIONE** (titolo opzione) + **AGGIUNGI VARIANTI**; ogni variante ha: **Nome variante\***, **SKU variante\* (manuale, non auto)**, **Giorni preparazione**, **Prezzo**, **Prezzo pubblico**, **Controlla stock (variante)**, **Rimuovi**. Quindi ogni variante è di fatto un mini-prodotto con prezzo/SKU/stock propri. Altri dettagli reali: **Partner** in DETTAGLI è un **select singolo**; **Linea** accetta **più valori separati da `;`**; i nomi campo interni sono `visibleToOtherPartners`, `isSuperProduct`, `isSuperProvinceProduct`, `productHasVariants`, `productOptionTitle`, `variantName`, `variantSku`, `variantGgDispMin`, `variantPrice`, `variantShopifyPrice`, `controlVariantStock`.

#### Sottosezioni Prodotti

- **Categorie** (`/product/categoria`): 63 categorie (es. Fiori, Fiori Classici, Fiori d'Arte, Torte, Dolci, Box Regalo, Cappelliere, Palloncini, Accessori, B2B Colazione/Break/Lunch/Aperitivo, Ghirlande, Abbonamento Fiori, Regalistica Natale…). **Form "Nuova categoria"** (verificato): Nome\*, Note, **AI Prompt** (per generazione AI, es. torte), **Extra fields** (nome campo + tipo: Opzionale / Obbligatorio / solo Admin), **Province discounts** (provincia + % di sconto → genera automaticamente prodotti scontati arrotondati a 0/5). **[NUOVO — AI Prompt e Note sul form categoria]**
- **Prodotto Collections** (`/collections`): collezioni shop per provincia: Collection Name, Handle (es. `province-products/rm`), Descrizione, Provincia, Codice provincia, Categoria prodotto. **[NUOVO]**
- **Cakes Order Product** (`/cake/orders`): torte acquistate e realizzate con l'AI (8 presenti) con foto.

### 3.7 Vendite (`/all/vendita`)

- Viste per piattaforma: All Vendite + Deluxy (`/vendita`), Cakes (`/cakes/vendita`), Business (`/business/vendita`), Deluxy Flowers (`/flowers/vendita`), Deluxy Experience (`/experience/vendita`), Deluxy.Com (`/deluxydotcom/vendita`).
- Colonne: Platform, System ID, ID ordine effettivo, Ordine, Data, Cliente, Indirizzo, Telefono, Canale (es. Online Store), Totale, Costo consegna, Stato del pagamento (paid…), Stato di adempimento (Unfulfilled…), Elementi, SKU, Metodo di consegna, Vendor, Stato (es. Da Gestire).
- Azioni per vendita: **GENERATE LINK, SEND EMAIL, CONFERMA, MODIFICA, RIFIUTA**. In alto: AGGIUNGI, ESPORTA, **PAGAMENTI DELLE VENDITE**, STORICO. **[NUOVO]**
- Il popup "Seleziona Piattaforma di vendita" (Shopify / Cake / Business / Flowers) compare per aggiungere una vendita manuale.

#### Logica di smistamento vendite (invariata)

- **Prodotto unico**: se la provincia è servita da un partner aperto → la consegna viene creata e proposta al partner; se chiuso o provincia non servita → vendita "da gestire".
- **Prodotto non unico**: se esiste lista priorità per provincia → invio ai partner prioritari aperti (con eventuale sconto categoria arrotondato a 0 o 5), altrimenti agli altri partner; senza lista priorità → vendita "da gestire".

> **Il prezzo per il partner, regola unica (01/09/2026).** Quanto paghiamo al partner e' `importo x (1 - sconto%)` arrotondato **al multiplo di 5 piu' vicino** (122 -> 120, 123 -> 125). La regola vive in `api/src/common/prezzo-partner.ts` e la chiamano entrambi i punti che la usavano: il `costoPartner` esposto all'app consegne (`app-api`) e la generazione dei prodotti scontati automatici (`products.service`). Prima il primo **non arrotondava affatto** e il secondo si': lo stesso partner poteva vedere due prezzi diversi per la stessa cosa. Misurato sulle 121 vendite in archivio: 40 salgono, 13 scendono, 68 erano gia' tonde; scarto massimo 2,50 EUR.
- Stati vendita/consegna collegati: Accettata (il partner accetta la vendita), Richiedi Annullamento (se ancora "da gestire" si annulla automaticamente), Non Accettata (grigio), Non Consegnata (blu, con motivo nelle note), Consegnata, Annullata (solo Admin/Operation).
- Servizi orari in storico: CONSEGNATO CON ORARIO DA APPROVARE / CONSEGNATO CON ORARIO NON APPROVATO (verificare l'orario del valet prima di procedere).

### 3.8 Finanza (`/finanza`)

Visibile solo agli admin abilitati (es. utente "support").

- Tab **CORRISPETTIVI**: per ogni **vendita** — la parola è letterale, vedi l'ambito qui sotto — Stato, ID Vendita, ID Consegna, Data consegna, Prodotto, Categoria, Valore vendite, Prezzo pubblico, Prezzo consegna, Partner, Prezzo partner, Fee %, Fee value, Fee+IVA, Costo consegna, Primo margine, Primo margine %. Con ESPORTA.
- Tab **MARGINI**: margini totali dell'azienda.
- **[NUOVO 26/08 sera]** **Il DDT viaggia col suo BRAND** (`Delivery.ddtBrand`): con più negozi lo stesso numero esiste su brand diversi (il DDT «3749» sta su 16 consegne di 8 partner) e il numero da solo non identifica la vendita. Il brand si sceglie nel form consegna accanto al numero DDT (suggerimenti: deluxy.it, Flowers, cakedesign.me, Business), si mostra come pillola nel dettaglio, e le consegne nate da una vendita lo ereditano dal brand della vendita (che arriva da Orders). Backfill fatto su 10.991 consegne dall'aggancio all'ordine pagato; 5.132 con DDT non riconducibile restano senza brand («non indicato» batte «sbagliato»).
- **[NUOVO 26/08]** La tabella dei corrispettivi si **ordina per colonna** (click sull'intestazione: primo click, poi inverte; ordina gli ORDINI raggruppati — numeri dal più grande, testi e date dall'inizio; il numero d'ordine si confronta da numero, non da testo). Le **fasce di margine si contengono a vicenda, sottoinsiemi compresi**: «minimo» (entro 5%) comprende anche il negativo, «basso» (entro 15%) comprende minimo e negativo.

**Formule reali (verificate su app.deluxy.it il 21/07, sessione admin).** La tab **CORRISPETTIVI** ha una riga **per vendita** (colonne `ID VENDITA` e `ID CONSEGNE` distinte) con queste colonne e formule (verificate al centesimo su più righe):

| Colonna | Formula |
|---|---|
| Valore vendite | Prezzo pubblico + Consegna prezzo |
| Prezzo pubblico | (dato, dal prodotto) |
| Consegna prezzo | (dato, tariffa consegna al cliente) |
| Prezzo partner | (dato) |
| **Fee %** | **commissione del singolo partner** |
| Fee value | Fee % × Prezzo partner |
| Fee + IVA | Fee value × 1,22 |
| Costo consegna | paga del valet |
| Primo margine | Valore vendite − Prezzo partner + Fee value |
| Primo margine % | Primo margine / Valore vendite |
| Corrispettivo | Valore vendite − Prezzo partner |
| IVA | Corrispettivo × 22% |
| Commissione incassi | Valore vendite × 3% |
| Margine totale | Primo margine − Costo consegna − IVA − Commissione incassi |
| Margine totale % | Margine totale / Valore vendite |
| Incasso partner | Prezzo partner − (Fee + IVA) |

In fondo una riga **Totale** che somma le colonne in euro. La tab **MARGINI** è invece una tabella **per consegna** con colonne operative (Vendita, Platform, Valet, Tipo servizio, Da fatturare/Da pagare, Prezzo, +/− Prezzo, Valet salario, +/− Prezzo stipendi, Margine totale, %). Entrambe le tab: filtro Stato, filtri per-colonna con operatori (`= < > >= <=`), elementi/pagina, ESPORTA, RICERCA/RESET.

**⭐ AMBITO — i Corrispettivi sono SOLO i servizi di tipo Vendita (25/08/2026, deciso dall'utente).** Le formule qui sopra descrivono una vendita: incassiamo dal cliente finale (prezzo pubblico + consegna prezzo) e **paghiamo** il partner (`Corrispettivo = Valore vendite − Prezzo partner`, `Incasso partner = Prezzo partner − Fee+IVA`). Su un servizio di **sola consegna** — Prezzo Fisso, a Ora, Magazzino, Aziendale — il denaro va nel verso opposto: il partner è il **cliente** e la consegna gli viene **fatturata** (sezione Fatturazione). Applicare a quelle righe le formule dei corrispettivi non dà un totale più grande, dà un totale **sbagliato**.

Misurato sui dati veri il 25/08: delle **53.868** consegne a buon fine (`delivered`/`approved`), sono di tipo Vendita **12.247 (22,7%)** — le altre sono Prezzo Fisso 34.939, a Ora 6.447, Aziendale 144, Magazzino 91. La pagina **dichiara sempre quante ne restano fuori** nel periodo scelto («…altre 404 con altri servizi»), come già fa col tetto delle righe: un filtro silenzioso fa sommare una parte credendola il tutto. È stata aggiunta la colonna **Servizio** (fra Categoria e Partner), così il criterio si vede invece di doverlo ricordare. L'API accetta `?soloVendite=false` per le controprove, ma la pagina non lo usa.

**[PORTATA nel nuovo ambiente — riallineata alle formule reali il 21/07]** — sezione **Finanza** (`/finance`, solo ADMIN). Per supportare le formule reali sono stati aggiunti allo schema: **`Partner.commissionPercent`** (la Fee%) e **`Delivery.deliveryPrice`** (la "Consegna prezzo"). IVA 22% e commissione incassi 3% sono costanti in `finance.module.ts` (candidate a diventare impostazioni). Nota residua: la riga dei Corrispettivi nel nuovo ambiente è per **consegna** (con i suoi prodotti aggregati), non ancora per vendita — manca il legame Vendita↔Consegna.

> ℹ️ **La «Consegna prezzo» a zero è normale** (confermato dall'utente il 25/08/2026): nel Valore vendite conta il **valore del prodotto**. `Delivery.deliveryPrice` è infatti null su tutte le 61.836 consegne, e nel `delivery` legacy quella colonna non esiste nemmeno — non è un dato perso, è un addendo che qui non c'è.
>
> ✅ **RISOLTO IL 25/08/2026, su decisione dell'utente: «Prezzo partner» non era il prezzo del partner.** Misurato il 25/08 sulle 12.247 vendite: `Delivery.price` vale il **12,5%** del valore dei prodotti, e per otto dei dodici partner più attivi la sua quota coincide **alla prima cifra decimale** con la fee% dichiarata del partner (CLIVATI 1969 17,0% su fee 17%; Cannavò 20,0% su 20%; Martesana 17,0% su 17%; Stefanelli 18,0% su 18%…). È cioè la **quota trattenuta da Deluxy**, non ciò che paghiamo al partner — ed è esattamente così che la legge già la **Fatturazione** (`invoices.module.ts`, `prezzoConsegna`: `dovutoAlPartner = valore prodotti − quota`, verificata sui dati veri). Con la lettura della Finanza il corrispettivo dell'archivio è **1.058.782 €** (Deluxy terrebbe l'87% del venduto); con quella della Fatturazione la nostra quota è **161.555 €** e ai partner ne dobbiamo **1.136.005 €**. L'utente ha deciso: vale la lettura della Fatturazione. **Le formule sono state riscritte.**

⭐⭐ **E poche ore dopo una seconda correzione, dai numeri dell'utente: il valore dato al partner NON si calcola, è SCRITTO.** Sta in `Delivery.productValue` (colonna 56 del `delivery` legacy, importata dal primo giorno e mai letta da questa pagina). *«Per il 62395 al partner abbiamo dato 70 €»* — e `productValue` di #62395 vale esattamente 70. Lo calcolavo per sottrazione invece di leggerlo.

E il **guadagno** è la differenza col prezzo pubblico, **al netto IVA**: #63013 → pubblico 135, al partner 80, differenza 55, e 55 ÷ 1,22 = **45,08** — i «45» dell'utente. È la stessa scelta già fatta in Deluxy Orders (margine sempre al netto IVA).

**Prova decisiva su 8.850 vendite**: `Delivery.price` è la fee di contratto calcolata su **`productValue`**, non sul prezzo pubblico — combacia con la fee% del partner entro un decimo di punto nel **92,6%** dei casi, contro il 62,6% usando il prezzo delle righe. Resta a schermo come **Quota a listino**, accanto al guadagno vero.

**Le formule dei Corrispettivi, dal 25/08/2026 (sera):**

| Colonna | Formula |
|---|---|
| Prezzo pubblico | somma( prezzo della riga di consegna × quantità ) |
| Consegna prezzo | `Delivery.deliveryPrice` — qui sempre 0, ed è normale |
| Valore vendite | Prezzo pubblico + Consegna prezzo |
| **Dato al partner** | `Delivery.productValue` — **si legge, non si deduce** |
| **Guadagno lordo** | Valore vendite − Dato al partner |
| **Guadagno netto IVA** | Guadagno lordo ÷ 1,22 — **il guadagno vero**. **[26/08]** Se il guadagno lordo è **negativo** (dato al partner > valore vendite) **l'IVA non si calcola**: netto = lordo, la perdita si legge intera |
| IVA | Guadagno lordo − Guadagno netto (zero quando il lordo è negativo) |
| Quota a listino | `Delivery.price` + plus/minus — quello che sarebbe spettato |
| Guadagno % | Guadagno lordo / Valore vendite |
| Fee % contratto | `Partner.commissionPercent` — se diverge, la cella si accende |
| Commissione incassi | Valore vendite × 3% |
| Costo consegna | paga del valet + il **PLUS fino a 5 €** + la ritenuta d'acconto dei valet senza P.IVA. **[26/08]** Il **minus NON si sottrae** (è il contante che il valet ha trattenuto: un suo debito, incide su quanto gli paghiamo) e il **plus sopra i 5 € NON si somma** (quasi sempre è il rimborso di qualcosa che il valet ha comprato per conto nostro, non il prezzo del viaggio) |
| Margine totale | Guadagno netto IVA − Costo consegna − Commissione incassi |

⚠️ **L'IVA non si sottrae due volte**: il guadagno netto l'ha già tolta, e la colonna IVA c'è per mostrarla.

⚠️ **Dove `productValue` manca (418 vendite) la cella dice «—» e la riga è marcata**: mettendoci zero il partner risulterebbe non aver preso niente e il guadagno sarebbe tutto nostro. Vale [[feedback-punteggi-senza-dati]]: una variabile senza dati si esclude, non vale zero.

**Agosto 2026, verificato in produzione**: pubblico 18.170,30 € · al partner 13.608,96 € · guadagno lordo 4.556,34 € (25,1%) · netto IVA 3.734,77 € · paghe valet 2.969,00 € · **margine totale +220,67 €**.

Sono sparite quattro colonne perché erano **lo stesso numero sotto nomi diversi**: «primo margine», «fee value», «incasso partner» e «corrispettivo +IVA».

⚠️ Il venduto ora si legge dalla **riga di consegna** (`DeliveryProduct.price`), non dal catalogo: il catalogo intanto cambia, e un prodotto riprezzato riscriverebbe la storia di consegne già fatte. Prima si leggeva da lì e dava 1.220.337 € contro 1.297.560 € — il quarto calcolo diverso dello stesso numero dentro lo stesso progetto. Ora la fonte è una sola, la stessa della Fatturazione.

**Le righe col prezzo sbagliato si mostrano, non si nascondono.** La tabella le marca col motivo e il totale le comprende così come sono: **796** hanno il venduto a zero, **123** non hanno trattenuto niente pur avendo il partner una fee, **33** hanno trattenuto più del venduto. In più **1.677** hanno una fee incassata lontana più di 5 punti dal contratto — quelle sono da guardare, non necessariamente sbagliate.

⚠️ **«Niente trattenuto» non è un'anomalia se il partner ha la fee a 0%**: delle 3.003 vendite senza quota, **2.880** sono di partner a fee zero (una scelta commerciale) e solo **123** sono un dato mancante, per 2.206 € di quota. È la stessa distinzione che la Fatturazione aveva già dovuto imparare.

ℹ️ **Il prezzo di Shopify non serve a giudicare**: su Shopify c'è il prezzo **pubblico**, che è un'altra cosa dal prezzo del prodotto concordato col partner (l'utente, 25/08). Misurato: il totale dell'ordine coincide col venduto solo nell'**1,6%** dei casi, allo stesso modo in tutte le tabelle di vendita — un criterio che «sbaglia» ovunque uguale non sta misurando quel che sembra. I dati dell'ordine restano disponibili come **riferimento** nell'estrazione `scripts/estrai-anomalie-prezzo-vendite.mjs`, che non scrive niente e produce un CSV con tutto ciò che è stato inserito sulla consegna più ciò che risulta dall'ordine.

### 3.9 Setup

- **Modelli SMS** (`/admin/smstemplates`): 31 modelli; tipi Created / Departed / Arrived; assegnati ad Admin o a partner specifici (es. Boutique Chanel); placeholder disponibili: `[name]`, `[day]`, `[between_time]`. Brand: Deluxy, DeluxyFlowers, CakeDesign.Me, BusinessDeluxy, Deluxy Experience, Deluxy Dot Com.
- **Provinces & Cities** (`/provinces/cities`): 108 province italiane con codice e numero di città abilitate alle consegne in guanti bianchi; IMPORTARE + formato CSV.
- **Servizi Partner** (`/servizi`): 32 servizi; tipi: Prezzo Fisso, a Ora (min 1h), Vendita, Aziendale (Corporate), Magazzino. Esempi magazzino: Ricezione pallet, Ordine Ecommerce, Picking & Packing a pezzo/a collo, Picking e Preparazione con consegna/spedizione; consegna taglie S/M e L/XL. Il valore del servizio si imposta nella scheda del singolo partner.
  - **Corporate Service** — ⭐ **verificato sui dati il 24/08/2026, e non è quello che c’era scritto prima.** Un partner può vendere prodotti **di proprietà di un altro partner**: il proprietario mette il flag *Visible to other partners* sul prodotto e sceglie chi altro può venderlo. Il meccanismo è la tabella dei **collegamenti prodotto→partner** (nel legacy `tabella-64`, in piattaforma `ProductPartnerLink`), non una replica di consegne. **Sette coppie vere** di prodotti condivisi (che è il meccanismo del *catalogo*, complementare alla replica della consegna descritta in §7-bis), tutte importate: *MALI’A → Casati 14* (29 prodotti), *CLIVATI-CONSEGNE → Casati 14* (5), *CLIVATI-CONSEGNE → Boutique Fendi* (2), *MARTESANA MILANO → CANTINA FRANCO* (2), *Deluxy → Boutique Fendi* (1), *BluLogistica → Chanel Galleria Shoes* (1), *Angolo Fiorito → Tiffany Corporate* (1). Dei 39 prodotti col flag acceso, **39 hanno un collegamento vero**: nessun flag orfano. Lo smistamento li usa dal 24/08: un prodotto UNICO col proprietario chiuso può arrivare a chi è abilitato a venderlo.
  - **Servizio Magazzino**: Prezzo Base + A Pezzo (per quantità) + Trasporto (base + extra distanza).

### 3.10 Profilo (`/profilo`)

- **QONTO CONNECTION**: collegamento del conto Qonto (CONNECT WITH QONTO). **[NUOVO]**
- Personal information: e-mail\*, RECLAMA MAIL VALET, RECLAMA MAIL PARTNERS (indirizzi per i reclami), cognome\*, nome\*, password + ripeti password, SALVA.

## 4. Registrazione

La registrazione avviene obbligatoriamente da parte dell'Admin per qualsiasi utente. Utenti creabili: Admin, Operation, Partner, Valet.

- **Admin**: si crea come Valet/Partner/Operation e poi si trasforma in Admin dalla pagina Utenti.
- **Operation**: nome, cognome, mail, telefono, indirizzo, note.
- **Partner**: insegna, email, P.IVA/CF, indirizzo, telefono, referente, ragione sociale, province, servizi (KM included, extra fuoricittà), categorie, notifiche, fatturazione & actions, documentazione e note.
- **Valet**: anagrafica completa, flag P.IVA (P.IVA + CF, luogo/data di nascita, IBAN), team leader, province, servizi con salario, notifiche (mail o WhatsApp), mezzo, note.

**Nuovo ambiente (17/07)**: la creazione di Partner/Valet/Operatore **crea automaticamente l'utente collegato in stato "invitato"** — non serve più creare l'admin come valet e poi trasformarlo, né impostare a mano la password. La persona riceve un **link di invito** (`/invite/:token`), sceglie la propria password e l'account si attiva da solo. L'admin non conosce le password altrui. La pagina **Utenti** governa solo l'accesso (stato + ruolo); l'operatività resta nelle schede anagrafiche.

**Step successivi alla registrazione** (app reale):
- Admin: impostare l'utente come "Attivo" nella pagina Utenti.
- Partner: inserire subito i campi richiesti e impostare gli orari di apertura; Admin abilita le categorie di vendita.
- Valet: specificare subito le disponibilità; Admin indica la % di rimborso nella ritenuta.

## 5. Processo di consegna (Valet)

1. **RITIRO**: il valet imposta "in consegna" (furgoncino giallo); la consegna lampeggia per partner/admin/operation; notifica ad Admin e Operation.
2. **CONSEGNATO**: popup che chiede chi ha ritirato il prodotto + caricamento foto della ricevuta; notifica ad Admin e Operation.
3. **NON CONSEGNATO**: popup con il motivo della mancata consegna; notifica ad Admin e Operation.

Sicurezza opzionale: verifica dell'identità del valet e codice di consegna richiesto al destinatario (attivabili per consegna o per partner). **[NUOVO]**

## 6. Importazione consegne

Possibile per Admin, Operation e Partner (il Valet non può importare). File di riferimento su Google Sheets (formato Admin/Operation e formato Partner); bottone "Scarica il formato CSV" in app.

Campi obbligatori: DATA `['ANNO/MESE/GIORNO]` (attenzione all'apostrofo), STATO (`created`, `assigned`, `invalidated`/`canceled`, `delivered`, `not delivered`), Name/Surname, orari from/to `[ORA:MINUTI]`, Pickup `[ORA:MINUTI]–[ORA:MINUTI]`, Partner ID, Intercom (citofono), indirizzi `[INDIRIZZO CIVICO, CITTÀ PROVINCIA, NAZIONE]`, DeliveryProducts `[NOME PRODOTTO, QUANTITÀ]` (il prodotto deve già esistere), Service = 5 (consegna) o 6 (servizio orario).

La lista dei servizi è consultabile su https://app.deluxy.it/servizi.

## 7. Integrazioni

### WooCommerce — plugin `deluxy-send-order` (rev. 1.0.0)

- Intercetta gli ordini al checkout e li invia all'API Deluxy. Open source GPL: https://github.com/deluxy-project/deluxy-send-order/
- Requisiti: PHP 7.0+, WordPress 5.8+, WooCommerce 9.0.0+, campi data/ora ritiro nei meta dell'ordine.
- Configurazione (WooCommerce > Impostazioni > tab Deluxy): API key del partner (generata dalla scheda partner), metodi di spedizione abilitati, campi data/ora consegna, regex per interpretare i campi (output richiesto `HH:MM` e `YYYY-MM-DD`), campi extra, log di debug (WooCommerce > Stato > Log, voce `deluxy-orders`), modalità sandbox (invia a dev.deluxy.it, richiede API key differente).
- Il plugin non ha scheduler: cura solo l'invio degli ordini.

### Shopify

Tab SHOPIFY PRODOTTI in Prodotti e piattaforme di vendita collegate (`shopifysale` è il codice della piattaforma Deluxy). Gli ordini dei negozi Shopify entrano come Vendite con ID ordine effettivo (#…). **[NUOVO]**

### Altre integrazioni rilevate

Stripe (pagamenti online), Qonto (banking dal Profilo), Google Maps (geocoding, mappa consegne, calcolo distanze), SMS + WhatsApp (notifiche), Web Push (notifiche in app, contatore nell'header).

#### Notifiche — nuovo ambiente (20/07) **[NUOVO]**

Portato il sistema di notifiche dell'app reale nel nuovo ambiente: campanello con contatore accanto al profilo/logout (contatore = solo non lette), tendina con lo storico e "segna tutte lette", click su una notifica di consegna che porta al dettaglio. Il contatore si aggiorna in polling (60s).

- **Canale attivo: Web Push** (VAPID, libreria `web-push`, come il legacy) + notifiche in-app persistite a DB (modelli `Notification` e `PushSubscription`). Il push al browser usa il service worker `web/public/sw-push.js`; l'iscrizione (permesso + `subscribe`) è in `NotificationsService.enablePush()`, da agganciare a un bottone in Profilo.
- **Trigger sui cambi stato consegna** (§5): quando una consegna passa a *in consegna* / *consegnata* / *non consegnata*, **Admin e Operation** attivi ricevono la notifica (chi ha fatto l'azione escluso). Aggancio in `deliveries.service.ts` → `updateStatus`.
- **Non ancora portati**: SMS, WhatsApp, Mail (servono credenziali Twilio/WATI/SMTP) e il job notturno `checkingPartnerContract` per la scadenza contratto. L'interfaccia `NotificationsService.notifyUsers()` è già pronta a ospitarli.
- Senza chiavi VAPID configurate il sistema resta funzionante con le sole notifiche in-app (nessun push al browser).

## 7-bis. Servizi e Calcoli (pricing) — sezione interna

I **servizi** si definiscono in **Amministrazione → Servizi** (nuovo ambiente): nome, tipo, e **destinazione** (Partner / Valet / entrambi). Le **tariffe** si impostano nella scheda del singolo partner/valet. Nell'app reale sono in *Setup → Servizi Partner* (`/servizi`) e *Valet → Servizi Valet* (`/valet/servizi`).

**Setup prenotazione del servizio** (usato al momento della richiesta): **Giorni preavviso** (`noticeDays`, alimenta la data minima consegna = oggi + preavviso), **Fascia oraria** (`slotHours`: 1 / 2 / 4 ore — durata delle fasce di consegna a tendina), **Ora minima di inserimento** (`minOrderTime`) e **Ora massima di inserimento** (`maxOrderTime`). Le due ore delimitano anche la **generazione delle fasce di consegna a tendina** nel form (da min a max, default **06:00–22:00**, passo = fascia oraria). Nuovo flag **Consenti orario di consegna flessibile** (`allowFlexibleTime`): se attivo, nel form consegna compare l'opzione per una fascia libera dalle–alle; se disattivo si può scegliere solo una fascia predefinita. Campi su `ServiceType`: `noticeDays`, `slotHours`, `minOrderTime`, `maxOrderTime`, `allowFlexibleTime`. **[NUOVO]**

Tutte le **formule di prezzo** sono centralizzate nel modulo **`api/src/calculations`** (endpoint `POST /api/v1/calculations/preview`) e consultabili/provabili nella pagina **Amministrazione → Calcoli**.

### Tipi di servizio partner e relativo calcolo

| Tipo | Calcolo del valore |
|---|---|
| **Vendita** | Vendiamo un prodotto per il partner trattenendo una nostra %. Nella sezione prodotti il **Valore totale** = Σ (prezzo singolo prodotto × qtà), includendo i prezzi impostati come **flessibili**. |
| **A prezzo fisso** | Es. servizio di consegna. **In città**: valore servizio + prezzo/km × max(0, distanza − km inclusi). **Fuori città**: prezzo fuori città × distanza. La **distanza** è calcolata via Google Maps tra ritiro e consegna. Il valore è **esposto nel Listino**. |
| **A ora** | max(1, ore) × prezzo orario (minimo 1 ora, sull'orario di consegna). Valore **esposto nel Listino**. |
| **Magazzino** | prezzo fisso (`servizio prezzo`) + prezzo a pezzo (`price per product` × qtà) + **prezzo consegna** (nuovo). |
| **Aziendale (corporate)** | ⭐ **CORREZIONE 28/08/2026 — la descrizione originale era GIUSTA, la mia smentita del 24/08 era sbagliata.** Il Corporate **replica davvero la consegna a un altro partner cambiando il modello di prezzo**. Il legame NON è `parentDeliveryId` (che su queste coppie è vuoto: guardavo la colonna sbagliata) ma **`legacyCorrespondDeliveryId`** — **110 coppie**. Esempio verificato al centesimo, #62454 ⇄ #62455 del 6/09: due consegne con **stessa data, stesso ritiro, stessa consegna, stessa fascia, stesso valet e le stesse identiche 9 righe di prodotto**; la prima è `ORDINE BRIOCHE` (**CORPORATE**) intestata a **Casati 14** a 59,52 €, la seconda è `Vendita Deluxy` (**VENDITA**) intestata a **MALI'A** a 8,926 €. ⭐ **Il prezzo della riga VENDITA è la fee del partner che vende, applicata al valore dei prodotti: 107 coppie su 109** (MALI'A ha fee 20% → 8,926 su 44,63 = esattamente il 20%; CLIVATI-CONSEGNE ha fee 0 → riga a 0). Il prezzo della riga CORPORATE invece **non segue una formula unica**: nelle coppie MALI'A→Casati è il valore diviso 0,75 (il listino corporate 25 di Casati) solo in 27 casi su 53 — negli altri è stato deciso a mano. ⚠️ Restano **87 consegne Corporate su 197 senza la riga gemella**: non so se è un dato perso nell'import o se quei casi funzionano davvero a riga singola. Verifica ripetibile: `api/scripts/verifica-corporate.mjs`. |

> Da confermare: nel "prezzo fisso" fuori città, se al costo `prezzo fuori città × distanza` vada sommato anche il valore base del servizio (attualmente non sommato, come da specifica ricevuta).

## 8. API — note per sviluppatori

- **Base URL**: `https://app.deluxy.it/api` (ambiente sandbox: dev.deluxy.it).
- **Autenticazione JWT**: login → access token con ruoli (admin/expert/partner/operation); `/api/users/me` restituisce l'utente corrente.
- **Convenzioni note**: il valet è "expert" (es. `/api/experts/delivery/experts`); i codici piattaforma vendita sono `shopifysale`, `cakesales`, `businesssales`, `flowerssales`, `deluxyexperiencesales`, `deluxydotcomsales`; gli stati consegna sono `created`, `assigned`, `delivering`, `inPreparation`, `accepted`, `requestCancellation` (+`delivered`, `notDelivered`, `cancelled` in storico); i tipi servizio sono `sales`, `hourlyrate`, `fixedprice`, `corporate`, `warehouseservice`.
- **API key partner** (WooCommerce) generabile in autonomia dalla scheda partner; garantisce l'accesso alle API di invio ordini.

### Richieste (`/richieste`) **[NUOVO 28/08/2026]**

**Operatività → Richieste**, per **Admin** e **Operation** — e il **Customer Service** è un Operation (`operationRole = customer_service`), quindi è già dentro senza un ruolo nuovo.

È la **posta in arrivo delle domande di consegna** scritte a parole dalle altre app di Deluxy. Chi manda — il Customer Service da una chat, Scout da una visita, un fornitore al telefono — **non compila un modulo di venti campi che non ha sotto mano**: scrive quello che sa, e qui una persona legge e decide.

⚠️ **Una richiesta non è una consegna: è una domanda.** Nasce *nuova* e diventa una consegna **solo quando qualcuno la accetta**. Farla diventare consegna da sola vorrebbe dire mandare un valet su un indirizzo che nessuno ha riletto — e il giro dei valet costa denaro vero.

**Come arriva.** Sul canale app-to-app, con una chiave di **scrittura**:

```
POST /api/v1/app/richieste       x-api-key: <chiave con scrittura>
{ "testo": "…", "riferimento": "ORD-1234", "contatto": "marta@…" }
```

- Una chiave di **sola lettura viene rifiutata** (`401`): mandare richieste è scrivere.
- L'**origine** registrata è il **nome della chiave**, non un'etichetta generica: fra un mese si deve poter capire con chi parlare.
- **Idempotente sul riferimento**: la stessa app che ritenta lo stesso `riferimento` **non crea un doppione**, si rilegge quella che c'è già (`giaEsistente: true`). Chi manda ritenta spesso — un timeout, un cron che ripassa — e due richieste identiche in lista sono due persone che lavorano la stessa cosa.
- Il testo sotto i **10 caratteri** è rifiutato: «ok» non è una richiesta, è una chiamata partita per sbaglio.
- L'esito si rilegge con `GET /api/v1/app/richieste/:riferimento`, e **solo dentro la propria origine**: un'altra app non legge le richieste altrui indovinandone il riferimento.

**Cosa si fa in pagina.**

- Filtri a pillola per stato — *Nuove* (col **pallino rosso** di quante nessuno ha ancora guardato), *In lavorazione*, *Accettate*, *Rifiutate*, *Tutte*.
- Il **testo si mostra com'è arrivato**, a capo compresi: è la fonte, e riformattarlo vorrebbe dire interpretarlo prima che lo legga una persona.
- **Crea consegna** porta al modulo della consegna col testo **già dentro il pannello «Compila con l'AI»**, aperto: l'AI *propone* i campi, che restano tutti correggibili prima di salvare. Salvata la consegna, la richiesta diventa **accettata** e le resta **collegato il numero** della consegna nata.
- **Prendi in carico** la mette *in lavorazione*: chi altro apre la pagina sa che ci sta già lavorando qualcuno.
- **Rifiuta** chiede un **motivo obbligatorio** — lo pretende anche il server: chi ha mandato la richiesta legge l'esito, e un «no» muto si trasforma in una seconda richiesta identica.
- Su accettata e rifiutata resta scritto **chi ha deciso e quando**.
- **Registra a mano** serve quando la richiesta arriva al telefono e non da un'app: l'origine diventa `manuale · <email di chi l'ha registrata>`.

### Chiavi delle app (`/api-keys`) **[NUOVO 28/08/2026]**

**Configurazione → Chiavi delle app**, solo **Admin**: le chiavi con cui le *altre app di Deluxy* (Orders, Budgets, Customer Service, Scout…) chiamano questa piattaforma sul canale `/api/v1/app/*`, presentandosi con l'intestazione `x-api-key`.

- **Due livelli**: *sola lettura* (consegne, vendite, costi) oppure *lettura e scrittura* (può anche **creare consegne**).
- ⚠️ **Il valore si vede una volta sola**, subito dopo la generazione: in archivio resta solo l'impronta SHA-256, e **nessuna rotta lo rilegge**. Chi la perde **rigenera**.
- **Rigenera** dà una chiave nuova alla stessa app: la vecchia smette di funzionare **all'istante**, quindi l'app va aggiornata subito.
- **Scadenza** facoltativa (vuota = non scade), verificata **a ogni chiamata**. Una chiave scaduta risponde `401` dicendo *scaduta*, non *non valida*.
- L'elenco mostra **da quanti giorni non la usa nessuno**: una chiave viva che nessuno chiama è una porta aperta senza motivo.
- **Spegni/Accendi** senza cancellare, ed **Elimina** definitivo.

⚠️ Le chiavi **non hanno ancora uno scope per rotta**: una chiave di sola lettura legge *tutto* il canale app, compresi nome, indirizzo e telefono dei destinatari. È un punto aperto dichiarato nell'handoff.

## 9. Piano di modernizzazione (staging)

- **Problema**: Node.js v12 e Angular datati — dipendenze deprecate, difficoltà a integrare strumenti moderni, manutenzione rischiosa.
- **Approccio**: la produzione resta stabile; in parallelo un ambiente di staging con stack aggiornato replica il dominio (utenti/ruoli, consegne, activities, partner, valet, prodotti, vendite, stipendi, regole, finanza) e si migra gradualmente.
- **Nuovo ambiente creato**: `deluxy-platform-next` — monorepo con API NestJS (Node 22 LTS, TypeScript, Prisma, JWT+ruoli, Swagger su `/api/docs`) e frontend Angular moderno standalone/PWA, seed demo, Docker Compose, README con strategia di migrazione (strangler pattern).
- **Benefici**: allineamento agli standard moderni, feature e integrazioni più semplici, sistema live non toccato, possibilità di rinnovare anche la UX.
