# Handoff — Deluxy Customer Service

Ultimo aggiornamento: **26/07/2026**

> ⚠️ **L'app si chiama Deluxy Customer Service** (prima "Deluxy Messaggi"). Sono
> cambiati i nomi visibili (topbar, login, titolo della pagina, tessera del Hub),
> **non** la cartella `deluxy-messaging/`, né il progetto Vercel
> `deluxy-messaging`, né lo schema Postgres `messaging`, né il cookie
> `msg_session`: rinominarli avrebbe rotto URL, deploy e sessioni per un
> cambio di etichetta. Una cosa in particolare NON va rinominata:
> `MARCATORE = 'Deluxy Messaggi'` in `src/lib/google.ts` è il marcatore già
> scritto nella biografia dei contatti Google creati da noi — cambiarlo li
> renderebbe irriconoscibili e l'app ricomincerebbe a rinominare contatti che
> non sono suoi.

## In due minuti (per una finestra nuova)

**Cos'è.** Il **servizio clienti**: si aprono e si lavorano i **reclami** sugli
ordini (casistica → azioni da eseguire → colpa a un valet o a un partner → da lì
i **giudizi**). Attorno ai reclami restano le due cose che c'erano già: **gli
ordini da lavorare** (arrivano da [Deluxy Orders](https://deluxy-orders.vercel.app)
da soli ogni 15 minuti, si smistano con stati nostri Da gestire → In pagamento →
Comunicazione → Gestito) e l'**inbox unificata** (WhatsApp/Messenger/Instagram +
widget dei siti).

**Dove.** Cartella `deluxy-messaging/` nel repo `scoutwt`, branch `scout-ui`.
Porta 3140. LIVE su <https://deluxy-messaging.vercel.app> (progetto Vercel
`deluxy-messaging`, team deluxy). Deploy: `npx vercel deploy --prod --yes` dalla
cartella dell'app — **il push su GitHub NON pubblica**.

**Le pagine.** `/reclami` reclami sugli ordini · `/reclami/casistiche` catalogo
dei tipi di reclamo con le azioni · `/reclami/punteggi` la **pagella** di valet e
partner con le voci configurabili · `/reclami/feedback` registrazione di feedback
e orari delle consegne · `/reclami/giudizi` giudizio manuale sui soli reclami ·
`/reclami/valet` chi fa le consegne · `/` Ordini (bacheca a colonne
o elenco) · `/calendario` consegne a partire da oggi · `/clienti` rubrica dagli
ordini · `/partner` partner attivi dal registro Anagrafiche · `/pagamenti`
richieste di pagamento con lettura AI dell'IBAN · `/inbox` conversazioni ·
`/script` risposte rapide che l'AI usa · `/negozi` `/caselle` `/impostazioni`.

**Le tre regole che questa app rispetta, e non vanno rotte.**
1. *L'AI propone, un controllo deterministico decide.* L'IBAN letto da una foto
   passa dal checksum mod-97; lo `scriptId` scelto dall'AI è validato contro
   l'elenco che le abbiamo mandato. Se non torna, si scarta — non si tira a
   indovinare su soldi e clienti.
2. *Non si duplicano i dati di altri registri.* Ordini da Deluxy Orders, partner
   da Deluxy Anagrafiche (questi ultimi senza nemmeno una copia locale).
3. *Lo stato di lavorazione è NOSTRO* (`Ordine.gestione`) e resta separato dalla
   pipeline di Orders (`statoChiave`): il sync non lo tocca mai.

**Le chiavi non stanno nell'ambiente** (tranne `DATABASE_URL`, `APP_SECRET`,
`APP_URL`, `CRON_SECRET`): si incollano in `/impostazioni` e finiscono cifrate
AES-256-GCM nel database. `APP_SECRET` su Vercel **deve** essere identico al
locale, altrimenti nulla si decifra.

## FATTO

- **I NUMERI SI RICONOSCONO DALLA RUBRICA GOOGLE** (29/07/2026). Su WhatsApp
  arrivava il nome che il cliente si è messo sul profilo — «Nicolo», «Ale», a
  volte niente. In rubrica (`deluxy.delivery@gmail.com`, la stessa che l'app
  riempie dagli ordini) quel numero è già salvato come **«FL Mario Rossi
  #1042»**, che dice chi è e con quale ordine.
  - `src/lib/rubrica.ts`: `riconosciConversazione(id)` per una sola (bottone
    **Rubrica** nella testata del thread, risposta immediata) e
  `riconosciDaRubrica(25)` per il giro automatico — cron **`/api/cron/rubrica`
    al minuto 37**, sfasato da quello dei contatti (minuto 7) perché usano la
    stessa People API e insieme si rubano il tempo.
  - `Conversazione.nomeRubrica` è un campo **a parte** da `nome`: sono due cose
    diverse (il nostro nome e quello del profilo) e nessuna sovrascrive l'altra.
    In elenco vince la rubrica, e il titolino mostra entrambi.
  - `rubricaCercataIl` evita di richiedere ogni ora i numeri che non ci sono: un
    numero che manca oggi manca anche fra un'ora. Se Google non risponde la data
    **non** si scrive, così quella conversazione si riprova.
  - ⚠️ **Non si cerca dentro il webhook.** Una ricerca sono 2-3 chiamate HTTP:
    nel percorso che riceve i messaggi allungano la risposta a Meta e, se Google
    è lento, mandano il webhook in timeout — cioè fanno perdere messaggi.
  - Solo WhatsApp: su Instagram e Messenger l'id non è un numero di telefono e
    in rubrica non c'è niente da cercare.

- **LA CHAT SI APRE DA UN LINK CHE C'È GIÀ SUL SITO** (30/07/2026). Sui siti la
  voce «Live Chat» del menu contatti esiste già e punta a un servizio esterno
  (`<a class="dialogify" href="https://chatting.page/…">`). Ora quel link può
  aprire la nostra chat senza mettere le mani nel tema: nello snippet
  **`data-apri-da="a.dialogify"`** (più selettori separati da virgola), e
  **`data-bottone="no"`** per togliere il bottone tondo quando quel punto
  d'ingresso basta. Si configurano per sito in «Widget dei siti»
  (`WidgetSito.selettoreApri`, `mostraBottone`).
  - ⚠️ Il clic si ascolta **sul documento**, non sull'elemento: i menu dei temi
    Shopify si costruiscono con JavaScript e quel link spesso non esiste ancora
    quando parte lo script. Con la delega funziona anche se compare dopo, e per
    tutti gli elementi che combaciano.
  - Un selettore scritto male non rompe il sito ospite: `closest()` sta in un
    `try` e in caso di errore il clic prosegue come prima.
  - Da codice resta `window.DeluxyChat.apri()` (già presente).

- **LE MAIL D'ORDINE SI SMISTANO PER SITO, E IL TOKEN INSTAGRAM SI RINNOVA DA SÉ**
  (30/07/2026).
  - ⚠️ **Le notifiche d'ordine dei tre siti arrivano tutte sulla stessa casella**:
    `[cakedesign] Ordine #1742…` finiva nella colonna della CASELLA («Deluxy»,
    perché la posta arriva a cs@deluxy.it) e non in quella del sito che ha
    venduto. Ora `src/lib/ordine-da-email.ts` prende il **numero d'ordine**
    dall'oggetto o dal corpo e lo **cerca nella tabella ordini**: se lo trova, il
    marchio è quello dell'ordine. È una ricerca, non una deduzione dal testo.
    - Misurato il 30/07: **981 ordini, zero numeri ripetuti** fra i siti (Deluxy
      12121–12684, Cake 1623–1742, Flowers 2318–2614). La tabella locale però
      tiene solo ~60 giorni: per una mail su un ordine più vecchio si scende al
      tag `[cakedesign]`, usato **solo se combacia con un solo negozio** — se ne
      pesca due o nessuno non si assegna niente.
    - `Conversazione.negozioId` + `ordineNumero`: il marchio scritto sulla
      conversazione **vince** su quello della casella. Il numero d'ordine si vede
      nella testata del thread.
  - **Si vede su quale ACCOUNT è arrivata**: nella testata, accanto al marchio,
    ora c'è `← cs@deluxy.it`. Prima con due caselle non si sapeva quale delle due
    avesse ricevuto — la prima cosa da sapere per rispondere. Per le mail
    l'etichetta è l'**indirizzo**, non il nome che ci siamo dati noi.
  - **Il CSS non si legge più nelle mail**: le notifiche Shopify cominciano con
    venti righe di `.button__cell { background: #d04c66 }` e il messaggio vero sta
    sotto, fuori schermo. `senzaCss()` in `src/lib/testo-email.ts` conta le graffe
    e butta le righe interne. ⚠️ Il riconoscimento è **stretto di proposito**:
    solo righe che COMINCIANO come un selettore, perché una riga di testo vero può
    finire con la virgola («Gentile cliente,») e non deve sparire. Provato su
    prosa con orari (`10:00-12:00`) e virgole: intatta.
  - ⚠️ **IL TOKEN INSTAGRAM SCADE OGNI 60 GIORNI** e non si rinnova da sé: al
    sessantesimo giorno i direct smettono di arrivare e non lo segnala nessuno.
    `src/lib/token-instagram.ts` + cron **`/api/cron/token-meta`** (ogni notte
    alle 4:50) lo rinnovano **dal quindicesimo giorno prima** della scadenza —
    Meta lascia rinnovare solo un token ancora valido, quindi «quando ce ne
    accorgiamo» è troppo tardi. In `/account-meta` si vede la scadenza di ogni
    account e c'è «Rinnova i token adesso».
    - **La strada migliore resta un'altra**: un token generato da un **utente di
      sistema non scade**. Su quello l'endpoint di rinnovo risponde errore, e
      l'app lo scrive come esito invece di ritentare ogni notte: un rinnovo che
      non serve non è un guasto.
  - **AVVISI DEL BROWSER**: bottone «Avvisi» in Inbox. Il permesso lo chiede un
    clic (i browser rifiutano la richiesta al caricamento, e chiederlo subito è il
    modo migliore per farselo negare per sempre) e l'avviso compare **solo a
    scheda non in primo piano**: se stai guardando l'inbox la conversazione nuova
    la vedi, e una notifica sopra ciò che guardi è rumore.

- **UN WIDGET PER OGNI SITO, CESTINO A 30 GIORNI, POSTA OGNI 5 MINUTI, FIRME,
  SUONO** (30/07/2026). Sei richieste in fila, tutte in produzione.
  - **`/aspetto-widget` → «Widget dei siti»**: si scegle il sito e la pagina
    PROPONE già la sua versione — tema, colore, scritta del bottone, titolo e
    saluto nella voce di quel brand (deluxy.it nero e oro e cerimonioso,
    l'atelier dei fiori minimale, Cakedesign caldo e con le emoji). Tabella
    nuova **`WidgetSito`**; la proposta **non si salva da sola**: finché nessuno
    conferma il sito è marcato «proposto», perché fra «così l'abbiamo deciso» e
    «così te lo suggeriamo» c'è la differenza fra una configurazione e
    un'ipotesi. Anche non salvata, però, la proposta è quella che il widget usa.
  - Lo snippet ora porta **`data-sito`**, e quello slug finisce in
    `Conversazione.numeroId`: in Inbox le chat dei siti vanno **nella colonna
    del marchio** invece di stare tutte in «Senza marchio». Gli snippet vecchi
    senza `data-sito` continuano a funzionare coi testi generali.
  - **CESTINO**: `Conversazione.eliminataIl`. Elimina non cancella più subito —
    la conversazione va nel cestino e ci resta **30 giorni**, poi
    `/api/cron/cestino` (ogni notte alle 4:20) la cancella davvero coi suoi
    messaggi. Terza linguetta in Inbox con Ripristina e «Cancella per sempre».
    ⚠️ Un messaggio nuovo **riporta fuori dal cestino** la conversazione: chi
    riscrive non sa che l'avevamo buttata.
  - **POSTA OGNI 5 MINUTI**: `/api/cron/posta`. Prima serviva premere «Scarica
    posta»: una mail delle 9:02 restava invisibile fino al clic. Finestra di 2
    giorni e non 7 — a 288 giri al giorno, rileggere una settimana di posta per
    trovare una mail nuova è lavoro buttato.
  - **FIRME PER CASELLA**: `CasellaEmail.firma`, in coda alle mail che partono da
    quella casella. `conFirma()` non la aggiunge se il testo già la contiene (le
    risposte pronte e l'AI a volte firmano da sole, e due firme si notano).
    Firmare una mail della pasticceria «Servizio Clienti Deluxy, guanti bianchi»
    è dire al cliente una cosa che per quel brand non esiste.
  - **SUONO ALL'ARRIVO**: due note generate con la Web Audio API (nessun file da
    caricare), con l'interruttore **Suono/Muto** in Inbox. ⚠️ I browser non
    suonano niente prima di un clic dell'utente nella pagina: è una regola loro.
    E si suona solo quando il totale dei non letti **cresce** — aprire l'inbox
    con 106 non letti non è un messaggio appena arrivato.
  - **Layout della testata del thread**: nome, badge e bottoni stavano su tre
    righe diverse. Ora la riga è una, e chi si accorcia è l'indirizzo.
  - ⚠️ **Perché una mail arrivata a Cake risultava «Senza marchio»**: la casella
    `info@cakedesignme.it` esisteva ma non era collegata a nessun marchio.
    Collegata a **Cake** (dato di produzione). Non l'ho dedotta dal dominio: il
    collegamento casella → marchio lo dichiara una persona, e «cakedesignme.it»
    somiglia a «Cake» ma somigliare non è essere.

- **IL WEBHOOK ACCETTA DUE FIRME, E I SEGRETI SI POSSONO CANCELLARE**
  (30/07/2026). Due cose che si tenevano per mano.
  - ⚠️ **«Instagram API con login di Instagram» ha una chiave segreta SUA** e
    firma i webhook dei DM con quella, non con l'App Secret dell'app Facebook.
    `POST /api/webhooks/meta` verificava con un segreto solo: gli eventi
    Instagram venivano respinti con **401**, e da fuori sembrava «Meta non ci
    manda niente» — si andava a controllare l'iscrizione al webhook, che era a
    posto. Ora si provano **tutti i segreti configurati** e basta che uno
    combaci. Nuovo campo in Impostazioni: **Chiave segreta di Instagram**
    (`igAppSecret`); vuoto = vale l'App Secret.
  - **Non si sceglie la chiave da `body.object`**: quel campo sta nel corpo, e il
    corpo non è ancora verificato — decidere quale serratura usare partendo da un
    dato non firmato vuol dire lasciarla scegliere a chi chiama. Provato: firma
    Instagram + solo App Secret → 401; con entrambi → accettata; firma di un
    estraneo → 401.
  - **I segreti ora si cancellano.** I campi segreti si salvavano solo se pieni
    (comodo: non si reincolla tutto a ogni modifica) e quindi **un token
    revocato o incollato per errore non si poteva togliere**, solo sovrascrivere.
    Nuovo componente `CampoSegreto` con la casella «Cancella il valore salvato»
    (arriva come `svuota_<chiave>`), usato da tutti gli 11 campi segreti della
    pagina. La cancellazione vince sul valore incollato: se qualcuno spunta e
    incolla, l'intenzione dichiarata è la casella.
  - La diagnosi ha una riga in più sulla chiave di Instagram.

- **LA GUIDA CUSTOMER SERVICE È DENTRO L'AI** (30/07/2026).
  `scripts/carica-guida-cs.mjs` (in catalogo) porta nell'app la parte della
  **Guida Customer Service Deluxy unificata v1.0** (14/07/2026, 49.000 caratteri)
  che serve a rispondere ai clienti: **27 risposte pronte**, **12 istruzioni** di
  tono per brand e canale, **1 documento** di riferimento.
  - ⚠️ **La divisione fatti / forma non è arbitraria.** Il prompt delle risposte
    rapide (`src/lib/ai.ts`) vieta all'AI di aggiungere fatti: prende il
    contenuto da uno **Script** e ne cambia solo la forma seguendo le
    **Istruzioni**. Quindi tempi, cut-off, costi e coperture stanno negli
    Script; tono, firma e lessico nelle Istruzioni. Mettere un fatto in
    un'istruzione vuol dire che non arriverà mai in una risposta.
  - Gli Script **non hanno un campo marchio**: quelli validi per un solo brand lo
    dichiarano in coda al `quando` («Vale SOLO per il marchio …»), che è il testo
    su cui l'AI decide. Senza, avrebbe proposto i guanti bianchi a chi scrive ai
    fiori.
  - **Restano fuori di proposito**: operatività interna (Shopify admin, bozze,
    tag, ticket Tidio), liste partner e fornitori, sconti riconosciuti, ricarichi
    +30%/+40%, costi a noi e margini, nomi delle persone interne.
  - ⚠️ **I punti in conflitto NON sono stati caricati come fatti.** La guida
    marca «DA VALIDARE» sei punti dove i due documenti sorgente si contraddicono
    — **numero della carta Postepay (due carte diverse)**, soglia di spesa per la
    chiamata di feedback, link per la recensione, tipo di compensazione, orari di
    contatto, formato del nome in rubrica. C'è un'istruzione esplicita che vieta
    di rispondere su quei punti. Far scegliere all'AI una delle due versioni
    voleva dire dare a un cliente un numero di carta sbagliato.
  - I 3 script che l'handoff chiamava «di prova» **sono rimasti**: «Ritardo nella
    consegna» ha **199 usi** e copre un caso che il set nuovo non ha. Allineate
    solo le categorie (`Consegne`→`Consegna`, `Amministrazione`→`Pagamenti`):
    nel selettore comparivano come gruppi separati.
  - **Non verificato con l'AI vera**: la chiave OpenAI è cifrata con l'`APP_SECRET`
    di produzione e da qui non si legge. Va provato dall'app pubblicata con
    «Risposta rapida» su un messaggio vero.

- **603 ORDINI VECCHI CHIUSI, E I RECLAMI APERTI IN PRIMA PAGINA** (29/07/2026).
  - `scripts/chiudi-consegne-passate.mjs` (in catalogo in `scripts/README.md`):
    segna **gestiti** gli ordini con consegna precedente a ieri. Eseguito in
    produzione: **603 chiusi**, da 907 a **304 da gestire**. `gestione` era
    arrivata dopo e nessuno aveva spuntato i vecchi: la bacheca metteva il
    lavoro di oggi sotto due mesi di archeologia.
    - Senza `--esegui` non scrive; `--giorni N` sposta il confine.
    - ⚠️ Non tocca i **286 ordini senza data di consegna**: non si sa se sono
      passati, e chiuderli a scatola chiusa vuol dire perderli. Sono il prossimo
      problema da guardare, ed è un problema di dati (Orders non manda la data),
      non di questa app.
    - `gestioneDaNome = "Chiusura automatica · consegna passata"`, non il nome di
      una persona: quel campo dice chi ha spuntato l'ordine, e una firma falsa in
      un registro di chi-ha-fatto-cosa è peggio del campo vuoto.
  - Nella schermata «Oggi» c'è il riquadro **Reclami aperti**: gravità in
    parole (lieve/media/grave), ordine, marchio, casistica + **prima azione da
    fare**, colpa e **da quanti giorni è aperto** — dal terzo giorno in rosso.
    Ordinati per gravità e poi per età: un grave di ieri prima di un lieve di una
    settimana, ma il lieve che invecchia non sparisce sotto.

- **SCHERMATA INIZIALE «OGGI», MENU RIORDINATO, PROMEMORIA** (29/07/2026).
  `/` non è più la bacheca ordini: è la **dashboard dell'operatore**. La bacheca
  sta su **`/ordini`**, che era un redirect ed è diventato la pagina vera —
  ⚠️ è anche l'URL registrato dell'app su Shopify, quindi chi arriva da lì
  continua a trovare gli ordini.
  - Fascia dei numeri (ognuno è un link a dove si lavora): chat da rispondere,
    consegne di oggi, ordini da gestire con quanti in ritardo, reclami aperti,
    rimborsi da decidere, pagamenti da inviare.
  - ⚠️ **Chat ed email sono contate a parte, e non è estetica.** Misurato:
    **106 conversazioni non lette, di cui 105 email** — quasi tutte newsletter.
    Un unico «106 da rispondere» sarebbe un allarme che suona sempre, cioè che
    non si guarda più. Il numero grande sono le chat; le mail stanno nella nota.
  - «Chi aspetta una risposta» ordina per: **finestra WhatsApp che sta
    scadendo** → chat → chi aspetta da più tempo. La finestra è l'unica cosa
    rossa della schermata: passate 24 ore dal messaggio del cliente, Meta non
    lascia più rispondere in testo libero e serve un modello approvato.
  - «Ordini da lavorare» usa le **stesse fasce di urgenza della bacheca**
    (`src/lib/urgenza.ts`: oggi → prossimi → scaduti da poco → senza data →
    scaduti da tempo) su tutti i marchi, solo i non gestiti. Le due schermate
    non devono raccontare priorità diverse.
  - I collegamenti portano sulla **riga precisa**: `/inbox?c=<id>` apre quella
    conversazione, `/ordini?apri=<id>` apre quel dettaglio.
  - **Menu laterale riordinato per priorità**: `Lavoro` (Oggi, Inbox, Ordini
    aperti, Calendario) · `Ordini` · `Reclami` · **`Qualità`** (Punteggi,
    Feedback, Giudizi, Valet) · Messaggi · Configurazione. Le misure servono a
    chi guarda indietro una volta a settimana, non a chi ha un cliente al
    telefono: erano in cima, ora sono in fondo.
  - **Promemoria** (`Attivita`, `/api/attivita`): si scrivono dalla dashboard,
    con scadenza facoltativa, e si spuntano. ⚠️ **Non sono il registro attività
    dell'ecosistema**: quello è **Deluxy Tasks** (porta 3090, API a chiave).
    Questi sono i promemoria attaccati al lavoro di questa schermata; quando la
    chiave di Tasks sarà configurata **vanno spinti anche là**, altrimenti
    diventano due registri. La cartella `deluxy-tasks/` non è su questo branch:
    il contratto dell'API va letto lì prima di integrare.

- **ICONCINE SULLA RIGA E LINGUETTA «ARCHIVIATE»** (29/07/2026). Archiviare
  richiedeva di aprire la conversazione: per fare pulizia di 112 newsletter è
  un clic di troppo per riga.
  - Ogni riga ha ora **due iconcine in basso a destra**: archivia (o «riporta in
    inbox», quando si è nell'archivio) ed elimina. Sempre visibili, smorzate —
    un'azione che compare solo se la cerchi non è un'azione rapida. Le icone
    sono SVG scritti nel componente: tre disegni non giustificano un pacchetto.
  - **Linguette «In arrivo» / «Archiviate N»** in cima all'elenco. Il numero
    dell'archivio arriva sempre dal server (`/api/conversazioni` lo torna anche
    quando si guarda la posta in arrivo), così si sa quante se ne sono messe via
    senza dover cliccare. `?archiviate=1` filtra al contrario, stesso
    raggruppamento per marchio.
  - ⚠️ **La riga è un `div role="button"`, non più un `<button>`**: le iconcine
    sono bottoni, e un bottone dentro un bottone è HTML non valido — i browser
    lo "riparano" buttando fuori i figli e la riga si scompone. Con
    `tabIndex` + Invio/Spazio resta raggiungibile da tastiera.
  - ⚠️ Sulle iconcine c'è `stopPropagation()`: senza, archiviare aprirebbe anche
    il thread di una conversazione che sta sparendo.

- **SI PUÒ TOGLIERE UNA CONVERSAZIONE DALL'INBOX** (29/07/2026). Nella testata
  del thread: **Archivia** (sparisce dall'elenco, resta nel database — è il
  gesto giusto per la pubblicità) e **Elimina** (cancella la conversazione **e
  tutti i suoi messaggi**, `onDelete: Cascade`, con conferma che dice cosa se ne
  va). `DELETE` e `PATCH` su `/api/conversazioni/[id]`.
  - ⚠️ **Nessuna delle due tocca la casella di posta vera**: la mail resta sul
    server IMAP. E con **«Scarica posta» una mail eliminata rientra**, se è
    ancora in posta in arrivo e dentro la finestra dei 7 giorni — la dedup
    guarda i messaggi che abbiamo, e quello cancellato non c'è più. Archiviare
    invece regge.

- **LE MAIL SI POSSONO SCRIVERE DA AI MAIL** (29/07/2026). `src/lib/ai-mail.ts`
  → `urlScriviAiMail()` costruisce il deep link
  `https://deluxy-mail.vercel.app/scrivi?a=…&oggetto=…&corpo=…&app=Deluxy Customer Service&rif=…`,
  la strada comune a tutte le app Deluxy (stessa convenzione di
  `deluxy-scout/lib/aimail.ts`).
  - Due punti d'ingresso: il bottone **AI Mail** nel riquadro di risposta delle
    conversazioni **email** (destinatario, `Re: oggetto` e bozza già dentro) e
    **Apri in AI Mail** nel pop-up di composizione degli Ordini.
  - ⚠️ **Quello che parte da AI Mail NON torna in questa conversazione**: il
    thread registra solo ciò che spedisce quest'app. È scritto accanto al
    bottone e nel titolino, perché è la cosa che si scoprirebbe dopo.
  - Il corpo si ferma a 6000 caratteri: oltre, l'URL non arriva (i browser
    tagliano intorno a 8000 e AI Mail taglia a 8000).
  - L'invio SMTP di quest'app **resta**: è quello che tiene la traccia in Inbox.
    Oggi però la casella `cs@deluxy.it` non ha la password salvata, quindi la
    posta da qui non parte davvero: finché è così, AI Mail è la strada che
    funziona.

- **RISPOSTE PRONTE PER TIPOLOGIA NEL RIQUADRO DI RISPOSTA** (29/07/2026).
  Bottone **Risposte** accanto a «Risposta rapida»: apre l'elenco degli Script
  attivi **raggruppati per categoria**, con ricerca; un clic e il testo entra
  nel riquadro dove sta il cursore. Il conteggio `usi` cresce, quindi i più
  usati salgono in cima.
  - Convive con la **Risposta rapida** (AI) e non la sostituisce: l'AI serve
    per i messaggi da capire, l'elenco per i casi che si riconoscono a colpo
    d'occhio — e non fa aspettare né sceglie al posto tuo.
  - Riusa `inserisciScript()` di `src/lib/script-testo.ts`: se nel riquadro c'è
    già un saluto, quello dello script si toglie. Senza, il cliente riceveva
    «Buongiorno… Buongiorno…» ogni volta.
  - ⚠️ **Niente invio automatico.** Il testo si mette nel riquadro e parte solo
    quando lo manda una persona. Un invio davvero automatico va deciso a parte:
    servono le regole di quando scatta, e sbagliarne una vuol dire scrivere una
    cosa sbagliata a un cliente vero senza che nessuno l'abbia letta.
  - Da fare: **i testi veri**. In tabella ci sono ancora i 3 script di prova
    creati per collaudare l'AI.

- **L'ETICHETTA DI UN ACCOUNT NON È UN MARCHIO** (29/07/2026). In Inbox
  comparivano quattro colonne — Cake, Deluxy, FLowers, **CakeDesignMe** — ma
  «CakeDesignMe» non è un brand: è il nome che avevamo dato al numero WhatsApp
  di Cake. Il ripiego «se il numero non ha un negozio, usa la sua etichetta»
  andava bene per il badge di una riga e **inventava un marchio** in una
  bacheca a colonne.
  - `risolutoreMarchio()` ora restituisce **due** cose: `marchioDi` (solo il
    negozio collegato, altrimenti vuoto → colonna «Senza marchio») e
    `etichettaDi` (come si chiama la linea, per il badge). Una linea non
    collegata adesso si vede che manca, invece di sembrare un brand in più.
  - Dati sistemati in produzione: il numero **CakeDesignMe → Cake**, e i due
    account Instagram **@deluxyflowers → FLowers**, **@cakedesignme → Cake**
    (erano senza marchio: appena Instagram riceve, sarebbero finiti fuori posto).

- **FOTO E ALLEGATI SU WHATSAPP, IN USCITA E IN ENTRATA** (29/07/2026). Prima si
  mandava solo testo, e di una foto ricevuta restava la scritta «[image]».
  - **In uscita**: bottone **Allega** nel riquadro di risposta (solo WhatsApp).
    Sono due chiamate, non una: `POST /{phoneNumberId}/media` per caricare il
    file e avere un id, poi il messaggio che punta a quell'id
    (`caricaMediaWhatsApp` + `inviaMediaWhatsApp` in `src/lib/meta.ts`). Il
    testo già scritto nel riquadro diventa la **didascalia**.
  - ⚠️ **Tetto 4 MB, e non è una scelta estetica**: la richiesta passa da una
    funzione serverless, che accetta ~4,5 MB di corpo. Oltre, il file non
    arriva nemmeno alla rotta e l'errore non spiega niente: meglio dirlo prima
    (`/api/conversazioni/[id]/allegati`).
  - **In entrata** il webhook ora salva `mediaId`, `mimeType` e `nomeFile` di
    foto, video, audio, sticker e documenti — e la **didascalia**, che prima si
    buttava insieme al resto (era il messaggio del cliente).
  - ⚠️ **Il file non lo teniamo noi.** Lo tiene Meta e lo dà a richiesta;
    `/api/media/[id]` fa da ponte. L'`id` nella rotta è quello del
    **messaggio**, non del media: così si sa quale token usare (quello del
    numero che ha ricevuto) e un id indovinato non tira fuori la foto di un
    altro cliente. L'indirizzo che dà Meta vale pochi minuti e vuole il token
    anche solo per leggerlo: come `src` di una `<img>` risponderebbe 401.
    Dopo ~30 giorni Meta il file non ce l'ha più e la rotta lo dice.
  - Non ancora: allegati su **email, Messenger, Instagram** (strade diverse —
    SMTP e altre rotte Meta); sugli altri canali il bottone non compare invece
    di comparire e fallire.

- **LE COLONNE SONO TUTTI I MARCHI, E LA CONVERSAZIONE SI APRE IN UNA FINESTRA**
  (29/07/2026). Seguito immediato della voce qui sotto, che nasceva monca.
  - Le colonne ora partono da **tutti i negozi attivi** (`Cake`, `Deluxy`,
    `FLowers`), non solo da quelli con un account Meta collegato: prima esisteva
    la sola colonna «FLowers» e deluxy.it non c'era.
  - **`CasellaEmail.negozioId`** (campo nuovo, `prisma db push` fatto): una mail
    non porta con sé «il nostro numero» come WhatsApp, quindi il marchio è
    quello della casella, dichiarato in **`/caselle` → Marchio**. Vuoto resta
    una risposta legittima (una casella che serve tutti i marchi).
    ⚠️ **Dato cambiato in produzione**: `cs@deluxy.it` è stato assegnato al
    marchio **Deluxy** (= deluxy.it), così le 112 mail hanno una colonna. Si
    cambia dal menu in `/caselle`.
  - A colonne il thread **non sta più di fianco**: la bacheca prende tutta la
    larghezza e la conversazione si apre in una **finestra** (`.velo` +
    `.pannello-thread`, gli stessi del dettaglio ordine) con Esc, clic fuori e
    bottone Chiudi. In vista Elenco resta il classico elenco + thread a destra.
  - ⚠️ **`src/lib/marchio-conversazione.ts`**: il marchio si calcola in UN posto
    solo, usato dalla pagina e da `/api/conversazioni`. Erano due logiche
    diverse — la rotta non conosceva Messenger/Instagram — e con l'inbox a
    colonne una conversazione **cambiava colonna da sola** al primo
    aggiornamento automatico (5 secondi dopo).

- **INBOX A COLONNE PER MARCHIO** (29/07/2026). L'elenco unico non rispondeva a
  «come stiamo andando su Flowers?». Ora `/inbox` apre con **una colonna per
  marchio** (stessa grammatica della bacheca degli Ordini: pallino, nome,
  conteggio, pill dei non letti) e il thread resta a destra; il bottone
  **Elenco/Colonne** riporta alla lista unica per ordine di arrivo. Sotto i
  1100px il thread passa sotto le colonne.
  - Le colonne partono dai **marchi collegati** (numeri WhatsApp + account Meta),
    così un marchio a zero messaggi si vede lo stesso: «oggi nessuno ha
    scritto» e «non è collegato» sono due cose diverse.
  - ⚠️ **Oggi la vista dice poco, ed è colpa dei dati, non della vista.**
    Misurato in produzione il 29/07: 112 conversazioni email + 1 WhatsApp, e
    **113 su 113 finiscono in «Senza marchio»**. Due motivi distinti:
    1. **le mail non hanno marchio**: `CasellaEmail` non ha un legame col
       negozio, e c'è una casella sola (`cs@deluxy.it`). Per dare un marchio
       alle mail servirebbe o un campo `negozioId` sulla casella, o una casella
       per marchio — è una decisione, non un dettaglio tecnico: il servizio
       clienti potrebbe legittimamente essere unico per tutti i marchi.
    2. **l'unica conversazione WhatsApp è arrivata su `numeroId`
       `1227556353776499`, che non è il numero registrato**
       (`677520672119409`, marchio «FLowers»): finché quell'id non è in
       `/numeri-whatsapp`, la conversazione resta senza marchio.

- **UNA MAIL APERTA IN INBOX SI LEGGE** (29/07/2026). Cliccando una mail, la
  schermata si smontava: elenco delle conversazioni bianco, testata e riquadro
  di scrittura fuori campo, e al posto del testo un muro di link di
  tracciamento SendGrid e di indirizzi di immagini.
  - ⚠️ **Il colpevole era un `min-height` mancante**, non la mail. In una
    colonna flex il figlio non scende sotto la dimensione del suo contenuto: con
    un messaggio lungo `.messaggi` non attivava mai il proprio scorrimento, e lo
    `scrollIntoView` di fine thread finiva per scorrere `.inbox` — che è
    `overflow: hidden` ma resta scorribile da codice. Aggiunto
    `min-height: 0` a `.inbox .thread` e `.thread .messaggi` in `globals.css`.
  - `src/lib/testo-email.ts`: le mail HTML arrivano come testo generato da chi
    le manda, con i link fra parentesi quadre e le immagini scritte per esteso.
    `ripulisciTestoEmail()` toglie immagini, parentesi, spazi invisibili e
    righe vuote a colonne; `pezziDiTesto()` rende i link cliccabili mostrando
    **solo il nome del sito** (un link SendGrid è lungo 300 caratteri).
  - La pulizia è **solo per gli occhi**: nel database il testo resta intero e la
    bolla ha «Testo originale» per rileggerlo com'era arrivato. Oltre 900
    caratteri si chiude con «Mostra tutto». L'oggetto della mail si vede in
    grassetto in cima alla bolla (`Messaggio.oggetto`, c'era già ma non usciva).
  - Ripulitura attiva **solo sul canale email**: su WhatsApp e widget scrive una
    persona e quello che manda va letto com'è.

- **IL WIDGET SI ADATTA AL SITO CHE LO OSPITA** (28/07/2026). Pagina
  **`/aspetto-widget`** («Widget dei siti»): sei temi, colore del sito,
  posizione, scritta accanto al bottone, anteprima e codice pronto da copiare.
  - I temi sono blocchi di variabili `--w-…` su `.widget-app[data-tema=…]` in
    `globals.css`: chiaro, scuro, deluxy, caldo, minimale, automatico. Il widget
    **non usa i token dell'app**, altrimenti cambiare tema non cambierebbe
    niente. Il colore del sito arriva da `data-accento` → `?accento=` e vince
    sul tema (una variabile sola, `--w-accento`).
  - ⚠️ **`public/widget.js` ora vive in uno SHADOW DOM.** Gira su siti che non
    controlliamo: un `button { … !important }` del tema ospite ci riscriveva il
    bottone. Verificato su una pagina di prova con CSS ostile: il bottone del
    sito diventa rosso, quadrato e maiuscolo, il nostro resta pillola, accento
    corretto, font di sistema; l'iframe ignora `border: 8px solid green` e
    `filter: invert(1)`.
  - Sul telefono (≤480px) la chat va a schermo intero e la × è **dentro** la
    chat: il bottone che l'ha aperta ci finisce sotto. `100dvh`, `16px` esatti
    sul campo (sotto, Safari zooma) e `env(safe-area-inset-bottom)`.
  - **IL WIDGET SI APRE ANCHE DAI PULSANTI DEL SITO** (30/07/2026). Lo shadow DOM
    protegge dai CSS altrui ma chiude fuori anche noi: il bottone flottante era
    l'**unico** modo di aprire la chat, e i siti hanno già il loro punto
    d'ingresso. Aggiunta `window.DeluxyChat` in `public/widget.js`: `apri()`,
    `chiudi()`, `alterna()`, `eAperta()`. Nient'altro è cambiato.
    - Primo uso: **cakedesign.me**, dove la voce «Live Chat» del pannello
      contatti portava a `chatting.page` — servizio esterno, il cliente usciva
      dal sito e la conversazione non arrivava mai in Inbox. Il tema intercetta
      il click e chiama `DeluxyChat.apri()`; il link vecchio resta come rete di
      sicurezza se il widget non si carica. Codice e trappole:
      `sviluppi-siti-deluxy/skills/sviluppi-siti-deluxy/reference/STATO-CAKEDESIGN.md`.
    - ⚠️ Chi si aggancia deve **chiudere il proprio pannello** prima di chiamare
      `apri()`: un menu a tendina che copre lo schermo lascia la chat dietro.
  - ⚠️ **La conversazione nasce al PRIMO MESSAGGIO, non al caricamento.** Prima
    bastava che il widget si caricasse: ogni visitatore di passaggio (e ogni
    anteprima, e ogni prova) lasciava in Inbox una conversazione vuota
    indistinguibile da un cliente in attesa. `GET /api/widget/messaggi` senza
    token risponde con titolo e saluto e basta; `POST /api/widget/sessione` lo
    chiama l'invio. Misurato: aprire la chat → 0 conversazioni, scrivere → 1.
  - L'anteprima (`/widget?anteprima=1`) è il widget vero con messaggi finti e
    **non parla col server**: le sei miniature dei temi avrebbero creato sei
    conversazioni ogni volta che si guarda la pagina.
  - Corretto un errore vecchio: il messaggio di benvenuto era marcato come
    scritto dal visitatore (`bolla out`); coi temi, che colorano la sua bolla,
    il nostro saluto sembrava suo.

- **CHI HA FATTO COSA: l'operatore resta scritto su ordini e messaggi**
  (28/07/2026). Con più persone sugli stessi ordini, «chi l'ha preso in mano» e
  «chi ha risposto al cliente» erano domande senza risposta.
  - `Ordine.gestioneDaId` + `gestioneDaNome`: chi ha cambiato lo stato di
    lavorazione (`/api/ordini/[id]/gestione`); in lista si legge nel titolino
    del badge. Verificato in produzione: ordine **#1738 → `da_gestire`, segnato
    da Nicolo Daniele Donato**.
  - `Messaggio.utenteId` + `utenteNome`: chi ha scritto il messaggio in
    **uscita** — risposte dall'Inbox (`/api/conversazioni/[id]/messaggi`) e mail
    dal pop-up (`/api/email/invia`). Si vede nella bolla accanto all'ora e nella
    riga «ultimo messaggio» della scheda cliente.
  - ⚠️ Il **nome è copiato, non collegato**: se quell'utente viene tolto resta
    scritto chi aveva risposto al cliente invece di un id orfano. E i campi sono
    **vuoti sullo storico**: partono da adesso, a posteriori non si indovina —
    «vuoto» non vuol dire «nessuno», vuol dire «prima di questa data».

- **PIÙ PAGINE FACEBOOK E PIÙ ACCOUNT INSTAGRAM** (28/07/2026). Stesso impianto
  dei numeri WhatsApp, esteso agli altri due canali Meta.
  - Tabella `PaginaMeta` (`canale` + `idPagina` unici insieme, `token` cifrato,
    `negozioId` per il marchio), pagina **`/account-meta`** «Facebook e
    Instagram» in Configurazione, `src/lib/pagine-meta.ts` per la traduzione.
  - Il webhook non butta più via il destinatario: legge
    `entry[].messaging[].recipient.id` (ripiego `entry.id`) e lo scrive nello
    **stesso campo** `Conversazione.numeroId` usato dal numero WhatsApp — fa lo
    stesso mestiere, tenere separate le conversazioni di marchi diversi.
  - Si risponde **dall'account che ha ricevuto**: `tokenPerPagina(canale, id)` e
    `inviaPagina(..., mittenteId)` che chiama `/{idPagina}/messages` invece di
    `/me/messages`. ⚠️ Con `/me` il token generale mandava il messaggio dalla
    pagina di un altro marchio.
  - ⚠️ **Il ripiego sul token generale qui non è un'equivalenza** (come invece è
    su WhatsApp, dove un token vale per tutti i numeri dello stesso Business
    Manager): ogni Pagina ha il SUO Page Access Token. Con più pagine, il token
    per pagina è obbligatorio, non facoltativo.
  - Verificato in locale con webhook firmato: lo stesso cliente che scrive a due
    pagine diverse crea **due conversazioni separate**, ciascuna col suo
    `nostroAccount` — prima ne faceva una sola con i due discorsi mescolati.
    Righe di prova cancellate per id.
  - Da fare quando arrivano gli account veri: incollare l'ID pagina/profilo e il
    token in `/account-meta` (in Impostazioni `fbPageToken` e `igToken` non sono
    mai stati riempiti), e spuntare `messages` per Messenger e Instagram
    nell'app Meta — il webhook è lo stesso già usato da WhatsApp.

- **INBOX MULTI-NUMERO: si sa su quale nostro WhatsApp è arrivato un messaggio**
  (27/07/2026). Preparato per l'arrivo dei numeri veri (l'utente ha connesso il
  WABA «Deluxy Flowers», ID 1473727904063695).
  `Conversazione.numeroId` + `numeroNostro`, chiave unica ora
  **`[canale, idEsterno, numeroId]`**; `NegozioShopify.waPhoneNumberId` collega
  numero → brand (campo in `/negozi`); `src/lib/numeri-whatsapp.ts` per la
  traduzione; l'Inbox mostra il brand accanto al canale, in elenco e in testata.

  ⚠️⚠️ **IL DIFETTO CHE C'ERA: il webhook buttava via `metadata`.** Meta dice
  SEMPRE su quale nostro numero è arrivato il messaggio
  (`value.metadata.phone_number_id` / `display_phone_number`) e non lo leggevamo.
  Con più WhatsApp Business (Flowers, Cake Design, Deluxy Cake Delivery…) le
  conseguenze erano tre, tutte silenziose:
   1. non si sapeva a quale marchio avesse scritto il cliente — e le istruzioni
      di CS AI sono **per brand**, quindi si sarebbe risposto col tono e la firma
      di un altro negozio;
   2. la chiave era `[canale, idEsterno]`, quindi lo **stesso cliente che scrive
      a due numeri finiva in UNA conversazione**, con due discorsi mescolati;
   3. la risposta usciva dall'unico `waPhoneNumberId` delle Impostazioni: per
      metà dei messaggi il numero sbagliato — dal telefono del cliente è
      un'altra azienda che gli scrive di un ordine che non ha fatto lì.
  Ora si risponde da `conversazione.numeroId`, con l'impostazione come ripiego
  per le conversazioni vecchie che il numero non l'hanno.

  **Verificato simulando il webhook vero** (forma Meta completa, due
  `phone_number_id` diversi collegati a FLowers e Cake): lo stesso cliente
  produce **2 conversazioni distinte**, ognuna col suo numero e il suo brand, e
  l'Inbox mostra «WhatsApp + FLowers» e «WhatsApp + Cake». Il dedup per
  `idMessaggio` regge (evento ripetuto → nessun messaggio in più).
  Dati di prova rimossi, e i `waPhoneNumberId` finti (prefisso 9999) azzerati
  sui brand veri: nessun numero inventato è rimasto in tabella.

  ⚠️ `prisma db push` chiedeva `--accept-data-loss` per il nuovo vincolo unico.
  Accettato **dopo aver verificato che `Conversazione` ha 0 righe**: l'avviso
  riguarda solo il fallimento in caso di duplicati, non la cancellazione. Su una
  tabella piena andrebbe fatta prima una migrazione che riempie `numeroId`.

  ⚠️⚠️ **PERCHÉ L'INBOX È ANCORA VUOTA: manca tutta la configurazione Meta.**
  Verificato in produzione: `metaVerifyToken`, `metaAppSecret`, `waToken`,
  `waPhoneNumberId`, `fbPageToken`, `igToken` sono **tutte mancanti**, e
  conversazioni/messaggi sono 0. Per RICEVERE non serve il token, servono:
   1. **Impostazioni → Verify token**: una parola scelta da chi configura;
   2. su developers.facebook.com, app Meta → WhatsApp → Configurazione →
      **Webhook**: URL `https://deluxy-messaging.vercel.app/api/webhooks/meta`,
      lo stesso verify token, e **iscrizione al campo `messages`**;
   3. il WABA va **iscritto all'app** (`POST /{waba-id}/subscribed_apps`);
   4. **Impostazioni → App Secret** (facoltativo ma consigliato: se c'è, il
      webhook accetta solo richieste firmate — vedi `x-hub-signature-256`);
   5. per **rispondere** servono anche token permanente e Phone Number ID;
   6. in **Negozi**, il Phone Number ID sul brand giusto, altrimenti in Inbox si
      vede il numero grezzo invece di «Deluxy Flowers».
  I token li crea una persona sul suo account Meta: non li genero io.

- **CORREZIONE: il biglietto sta nelle NOTE dell'ordine, non nell'attributo**
  (27/07/2026). Segnalato dall'utente, e i numeri gli danno ragione.
  `testoBiglietto(nota, attributo)` in `src/lib/orders.ts` unisce i due campi:
  la nota (`shopify.note`) è la fonte, l'attributo (`biglietto`) si aggiunge solo
  se dice qualcosa di diverso e non è già contenuto nell'altra.
  ⚠️ **Misurato su 800 ordini del registro**: `shopify.note` ha testo su **680
  (85%)**, l'attributo `biglietto` su **71** — e dei 70 con entrambi, **67 sono
  lo stesso testo**. Leggendo solo l'attributo (come faceva la prima versione)
  nove ordini su dieci risultavano «senza biglietto» pur avendone uno scritto:
  era il caso di **#12663**, dove la nota è «They say the best trips… Bien à toi,
  Arthur» e la sezione non compariva affatto.
  **Effetto della correzione, misurato in locale: buste da 77 a 758 su 938
  (dal 8,2% all'80,8%)**, dopo `POST /api/ordini/sync?completo=1`.
  ⚠️ **CONSEGUENZA DA DECIDERE**: un'icona presente sull'81% delle righe non
  distingue più niente — l'informazione è diventata l'ASSENZA (il 19% senza
  biglietto). Se dà fastidio, si inverte: si marca chi NON ha il biglietto. Per
  ora resta come chiesto, ma il numero va tenuto presente.
  ⚠️ La sezione nel dettaglio ora dice «note dell'ordine» e non «nota del
  cliente», e nello stato vuoto «Nessun biglietto: il cliente non ha scritto
  note»: le parole devono corrispondere al campo che si legge davvero.
  ⚠️ **Resta valida la regola di non interpretare il testo**: le note contengono
  spesso anche indirizzo, telefoni e istruzioni per il fornitore (e in un caso
  «30 Luglio 08/12», dove 08/12 è la fascia oraria). Si mostra tutto, si copia
  tutto, taglia una persona.
  ⚠️ **Lezione di metodo**: avevo scartato la pista «biglietto previsto» con una
  misura corretta (il Sì/No della variante NON c'entra — verificato) ma stavo
  leggendo un secondo campo sbagliato senza accorgermene, perché il campo si
  chiamava proprio `biglietto`. **Un nome giusto non garantisce il contenuto
  giusto**: quando un campo «di dominio» risulta pieno nell'8% dei casi, il
  sospetto va al campo, non ai dati.

- **La sezione Biglietto nel dettaglio c'è SEMPRE, con l'icona lettera**
  (27/07/2026). Prima spariva quando il campo era vuoto, e una sezione che
  scompare è ambigua: chi apre un ordine senza biglietto non sa se non c'è, se
  l'app non l'ha caricato o se va cercato altrove. Ora due stati espliciti —
  il testo con «Copia biglietto», oppure «Non indicato: su questo ordine il
  cliente non ha scritto niente». Verificati entrambi su ordini veri (#12372 con
  282 caratteri, e un ordine senza). L'icona è la stessa busta dell'elenco:
  icone diverse per la stessa cosa non si collegano.

  ⚠️⚠️ **«SE È PREVISTO BIGLIETTO» NON È UN DATO CHE ABBIAMO — MISURATO.**
  Sull'ordine dello screenshot (#12663) la riga è «Bouquet Beethoven —
  Medio-Grande / **No**», e sembrava naturale leggere quel «No» come «biglietto:
  no». **È una deduzione, e sarebbe stata sbagliata.** Su 800 ordini del
  registro:
    - la variante è la sola stringa dei VALORI (`variantTitle` di Shopify):
      i NOMI delle opzioni non li salva nessuno, quindi non si sa a cosa si
      riferisca quel Sì/No;
    - l'opzione finale Sì/No compare su **23 ordini su 800** (2 «Sì», 21 «No»):
      è una famiglia di prodotti, non un meccanismo generale;
    - **correlazione zero col biglietto**: i 2 ordini con «Sì» hanno **0** note
      del cliente, mentre il 9% dei 777 senza quell'opzione ce l'ha. Se il «Sì»
      fosse il biglietto, sarebbe il contrario.
    - nelle proprietà delle righe (che SONO strutturate, «chiave: valore»:
      Ingredienti, Base, Farcitura, Scritta sulla torta, Topping…) **non esiste
      nessuna chiave «Biglietto»** su 120 righe con proprietà.
  Quindi l'icona resta agganciata al solo segnale reale: **il testo scritto dal
  cliente** (`biglietto` non vuoto), 70 ordini su 800 (8,8%).
  **COME AVERE IL DATO VERO**: in `deluxy-orders` l'import Shopify chiede
  `variantTitle`; va aggiunto `selectedOptions { name value }` sul line item —
  lì il nome dell'opzione c'è. Poi si espone nell'API e qui l'icona può dire
  «biglietto previsto» come fatto e non come indovinello. Serve un re-import per
  riempire lo storico.

- **«DA MOBILE LA MAIL NON SI APRE»: bersagli troppo piccoli, e l'indirizzo che
  non si toccava** (27/07/2026).

  Il pop-up di posta **funzionava**: aperto da uno schermo da 375px con una
  sequenza di tocco vera (touchstart/touchend + click) si apre, sta dentro lo
  schermo, e col dettaglio già aperto riceve lui il tocco (stesso z-index 60 ma
  più avanti nel DOM — verificato con `elementFromPoint`). Il guasto era prima
  del pop-up: **non si riusciva a premere il bottone**.
  ⚠️ **Misurato: le nove azioni di una scheda erano alte 24px** — «Email» 47×24,
  con «Chiama» e «Reclamo» appiccicati ai lati. Il minimo per un polpastrello è
  44px (Apple) / 48 (Google). A 24px si manca, e mancare qui vuol dire o non far
  succedere niente o aprire il pannello dell'ordine: da fuori sembra che la mail
  sia rotta. Ora sotto gli 800px i comandi sono **alti 40px** con 8px di stacco
  (verificato: Email 63×40, nessun bottone sotto i 40). Sul desktop restano
  piccoli: lì si punta col mouse e lo spazio serve per far stare più ordini.
  ⚠️ **Nel dettaglio l'indirizzo email era testo semplice.** Su un telefono è la
  cosa più naturale su cui premere — è scritto lì e sembra un link — e non
  faceva niente. Ora è un bottone (`.come-link`) che apre il modulo già
  compilato; verificato: destinatario e oggetto «Ordine #1736» precompilati.
  La bozza (`bozzaMail`) è stata tirata fuori dall'IIFE dei canali e calcolata
  una volta sola, così la usano sia il bottone «Email» sia l'indirizzo.
  Anche il telefono, che era testo, ora è un `tel:`.
  ⚠️ Nota di metodo: la prima ipotesi (il pop-up non si apre su mobile) era
  sbagliata, e l'ho scartata riproducendo invece di correggere alla cieca. Il
  difetto vero non era nel codice del pop-up ma nella dimensione dei bottoni —
  una cosa che si vede solo misurando i rettangoli su un viewport da telefono.

- **PAGINA UTENTI + REGISTRAZIONE LIBERA CHIUSA** (27/07/2026).
  `/utenti` (voce di sidebar sotto Configurazione): un amministratore apre gli
  account dei colleghi, cambia ruolo, cambia password e toglie l'accesso.
  Libreria `src/lib/utenti.ts` (ruoli, controlli), azioni in
  `src/app/(app)/utenti/actions.ts`.

  ⚠️⚠️ **ERA UN BUCO, NON UNA FEATURE MANCANTE.** `/registrati` era **aperta a
  chiunque**: chi conosceva l'indirizzo dell'app si apriva un account ed entrava
  fra 929 ordini con nomi, indirizzi, telefoni ed email dei clienti, i reclami e
  i rimborsi. Era nata come bootstrap («il primo che si registra è admin, gli
  altri operatori») ma restava aperta per sempre. Ora la registrazione libera
  passa **solo se non esiste NESSUN utente**, per creare il primo
  amministratore; tolto anche il link «Non hai un account? Registrati» dal
  login, che altrimenti invitava a un giro a vuoto.

  ⚠️ **Il controllo del ruolo sta in OGNI server action, non nella pagina.** Una
  server action è un endpoint: nascondere il bottone non impedisce di chiamarla.
  **Verificato costruendo a mano il modulo** che la pagina non mostra
  all'operatore (con l'`$ACTION_ID` preso dall'HTML dell'admin) e inviandolo:
  da operatore l'account NON viene creato, con lo stesso identico modulo da
  admin viene creato. Il controllo vale perché ci sono entrambe le prove — la
  prima volta avevo provato con curl e falliva anche da admin, quindi non
  dimostrava niente: una richiesta malformata non è un cancello che funziona.

  ⚠️ **L'ultimo amministratore non si può togliere né retrocedere**
  (`puoEssereRimosso` / `puoCambiareRuolo`): senza, un clic distratto chiude
  tutti fuori dalla gestione degli account e da dentro l'app non si rientra più.
  **NON verificato end-to-end**: al momento c'è **un solo** amministratore
  (quello vero) e provarlo vorrebbe dire tentare di cancellare l'account del
  titolare su dati veri. Verificati i conteggi su cui la regola si regge
  (`altriAmministratori` esclude l'id giusto, e con un id inesistente torna il
  totale). Da esercitare quando ci saranno due amministratori.
  Verificati invece: **non si può cancellare il proprio account** (rifiutato col
  motivo scritto) e la cancellazione legittima di un operatore.

  ⚠️ La password la scrive l'amministratore e **la comunica a voce**: l'app non
  manda email. Non finisce mai nel messaggio di ritorno, perché quello sta
  nell'URL e da lì passa in cronologia e nei log.

  ⚠️ **PULITO IN PRODUZIONE**: c'era `prova-tipo@local.test` con diritti di
  **amministratore**, avanzo di una sessione precedente. Rimosso insieme ai miei
  account di prova. Resta `diagnostica@deluxy.local` (operatore), che non ho
  creato io: **da decidere se serve** — è un accesso attivo all'app.
  Regola per il futuro: un account di prova su un'app live va cancellato nella
  stessa sessione in cui lo si crea, e mai con ruolo admin.

- **SIMBOLO «C'È IL BIGLIETTO» + SEZIONE BIGLIETTO NEL DETTAGLIO** (27/07/2026).
  Icona a busta oro su ogni ordine che ha una nota del cliente (in scheda e in
  tabella), e nel dettaglio una sezione **Biglietto e note del cliente** col
  testo intero e il tasto **Copia biglietto**.
  Campo nuovo `Ordine.haBiglietto` (solo il sì/no), riempito dal sync da
  `biglietto` di Orders; il TESTO non si copia in locale — lo chiede il
  dettaglio a Orders, come già fa per destinatario e indirizzo.
  Misurato: **77 ordini su 929 (8,3%)** hanno una nota, 76 fra quelli da gestire.

  ⚠️⚠️ **IL CAMPO NON CONTIENE «IL BIGLIETTO»: CONTIENE TUTTO.** Guardati gli
  ordini veri, dentro ci sono — nello stesso testo libero — il messaggio per il
  cartoncino, l'indirizzo completo del destinatario, uno o due numeri di
  telefono, il budget, le specifiche della torta, e in un caso
  «30 Luglio 08/12», dove 08/12 è la FASCIA ORARIA e non l'8 dicembre. Un altro
  ordine dice «20 giugno ore 17-17.30 / Via delle Calasanziane… / +39 389…
  marito per ritiro / BIGLIETTO: …».
  Quindi: **niente estrazione automatica del messaggio**. Sarebbe comodissimo e
  stamperebbe un numero di telefono su un cartoncino, o butterebbe via metà
  messaggio. Si mostra il testo COM'È, in sola lettura, e sotto c'è scritto che
  va riletto prima di girarlo al fornitore. La copia prende tutto: chi taglia è
  una persona che ha letto. È la stessa regola già scritta per consegna e stati
  («meglio non indicato che sbagliato»).
  ⚠️ `haBiglietto` si riscrive SEMPRE nel sync, anche a falso — al contrario
  degli ordinali del cliente: se il cliente toglie la nota il simbolo deve
  spegnersi, mentre un ordinale mancante vuol dire «non calcolato», non «non
  c'è più».
  ⚠️ Per accendere il simbolo sugli ordini già in tabella serve un **sync
  completo** (`POST /api/ordini/sync?completo=1`).
  ⚠️ Il tasto Copia usa lo stesso `copia()` di «Copia messaggio», già in uso in
  produzione. Dal pannello browser nascosto fallisce sempre
  (`NotAllowedError: Document is not focused`) e **non è un bug**: gli appunti
  vogliono la finestra a fuoco. Verificato che il ripiego lo dice
  («seleziona il testo e copialo a mano») invece di tacere.

- **MENU A SCOMPARSA SU MOBILE + ETICHETTA «NUOVO» + CHE CLIENTE È** (27/07/2026).

  **Menu mobile.** Sotto gli 800px il menu non è più una riga orizzontale sopra
  il contenuto (ventidue voci da scorrere di lato, intestazioni dei gruppi
  nascoste, e il tasto che lo spostava fuori lasciando una banda vuota alta come
  prima): ora è un pannello `position: fixed` che scorre da sinistra, chiuso di
  partenza, col velo dietro. Si chiude toccando il velo, con Esc, e **da solo
  quando cambi pagina** (`useEffect` su `usePathname` in `Sidebar.tsx`: al
  cambio di percorso, così copre anche tasto indietro e redirect).
  Stato mobile = `data-menu-aperto` sull'html, **non** salvato: un pannello che
  copre lo schermo e si ritrova aperto domani è una porta lasciata aperta.
  Lo stato desktop (`data-sidebar-chiusa`, in localStorage) è rimasto identico.
  ⚠️ **Nella media query mobile bisogna AZZERARE il collasso desktop**
  (`margin-left/opacity/pointer-events` di `[data-sidebar-chiusa] .sidebar`):
  la preferenza sta sull'html e vale per entrambi gli schermi, quindi chi tiene
  il menu chiuso sul computer si ritroverebbe il pannello invisibile sul telefono.
  ⚠️ **`visibility: hidden` sul pannello chiuso non è estetica**: senza, i 19
  link e il bottone del velo **restano nell'ordine di tabulazione** — misurato,
  `link.focus()` funzionava a pannello chiuso. Il ritardo `visibility 0s linear
  260ms` serve a non farlo sparire di colpo mentre scorre via.
  ⚠️ **NON VERIFICATO**: il ritorno a desktop col pannello aperto. Il browser di
  prova non propaga NESSUN segnale di ridimensionamento — né `resize`, né il
  `change` di matchMedia, né ResizeObserver (provati tutti e tre, zero scatti).
  Il listener su matchMedia in `ToggleSidebar.tsx` è il meccanismo standard e su
  un browser vero scatta, ma qui non si può dimostrare: da riprovare a mano.

  **Etichetta «NUOVO».** Gli ordini comparsi mentre la sessione è aperta si
  accendono con un bollino oro pieno (l'unico pieno della lista, di proposito).
  `src/lib/cliente-valore.ts`: l'istante di apertura sta in **sessionStorage**
  (per scheda — con localStorage riaprendo domani sarebbero «nuovi» tutti quelli
  di ieri sera), e il confronto è su **`creatoIl`**, cioè quando l'ordine è
  comparso DA NOI, non sulla data dell'ordine: al primo scarico entrano insieme
  due mesi di ordini, e con la data sarebbero nuovi tutti quelli di oggi.
  ⚠️ L'istante si legge in un `useEffect`, non nel render: sul server
  sessionStorage non esiste e si avrebbe un errore di idratazione. Finché vale 0,
  `arrivatoAdesso()` torna **falso** — senza quella guardia `t > 0` è vero per
  qualunque data e per un istante si accende tutta la lista.
  Verificato spostando indietro l'inizio sessione: 19 ordini accesi su 928.

  **Che cliente è.** Bollino «Nuovo cliente» / «2° ordine» / «Cliente VIP · N°
  ordine» accanto al tipo cliente, in scheda e in tabella. Campi nuovi
  `Ordine.clienteNumeroOrdine` / `clienteOrdiniPrima`, ricopiati da Orders come
  `clienteTipo` (stessa regola: un null in arrivo non cancella un ordinale noto).
  ⚠️⚠️ **IL CONTO LO FA ORDERS, E NON POTEVA FARLO QUESTA APP.** Misurato: la
  copia locale copre **solo 2 mesi** (928 ordini, 25/05→27/07) contro i ~14.000
  del registro. Contando qui, dei 795 clienti distinti il 91,7% risultava con un
  ordine solo e appena 3 arrivavano a cinque — un cliente che compra ogni Natale
  sarebbe stato «nuovo» ogni Natale. Con gli ordinali di Orders sulla storia
  intera: 845 ordini su 928 hanno il dato, 646 sono primi ordini, e ci sono
  clienti al 20°, 21°, 26° e **33° ordine**. Gli ordini da clienti affezionati
  sono **61 su 845 (7,2%)** — abbastanza rari da voler dire qualcosa.
  ⚠️ **Soglia VIP = dal 4° ordine in su, ed è misurata, non un numero tondo.**
  A cinque ordini l'etichetta sarebbe comparsa su pochissimi; a due su troppi.
  ⚠️ **Quando l'ordinale è `null` non si scrive «nuovo cliente»**: è lo stesso
  errore del voto dato a chi non ha dati (vedi la pagella dei partner). 83
  ordini su 928 sono in questo caso — clienti che Orders non riesce a
  riconoscere — e per loro il bollino semplicemente non c'è.
  ⚠️ Per riempire il campo sugli ordini già in tabella serve **un sync completo**
  (`POST /api/ordini/sync?completo=1`): quello normale guarda solo la finestra
  recente e la prima volta ne aveva aggiornati 26 su 928.

- **DOCUMENTI, BRAND ed ESPORTAZIONE in CS AI** (27/07/2026).
  Tre cose in una: si CARICANO documenti da cui l'AI ricava le istruzioni, ogni
  istruzione può valere per un solo BRAND, e le linee guida si ESPORTANO come
  documento leggibile dalle persone.
  Tabella `DocumentoAI` + campi `IstruzioneAI.negozioId` / `documentoId` /
  `sostituisceId`; librerie `src/lib/documenti-ai.ts` (estrazione) e
  `src/lib/linee-guida.ts` (Markdown + HTML da stampare); rotte
  `/api/cs-ai/documenti` (carica/elenca/elimina), `/api/cs-ai/documenti/proposte`
  (POST propone, PUT salva le scelte) e `/api/cs-ai/esporta?formato=md|html`.
  Si legge PDF, .docx, .txt/.md, .csv, .html fino a 4 MB.
  **Il documento NON entra nel prompt**: da trenta pagine l'AI ricava poche
  regole, ognuna con la CITAZIONE della frase da cui nasce, e una persona spunta
  quali tenere. Le regole salvate ricordano da quale documento vengono.
  Verificato su un manuale finto ma realistico: delle sei sezioni ha preso solo
  le regole di comunicazione, lasciando fuori turni di laboratorio, storia
  dell'azienda e fatturazione.

  ⚠️⚠️ **IL MODELLO DELLE RISPOSTE È `gpt-4o`, NON `gpt-4o-mini` — misurato.**
  Impostazione dedicata `openaiModelloRisposte`, default `MODELLO_RISPOSTE_DEFAULT`
  in `src/lib/ai.ts`. `openaiModello` resta mini per il resto (estrazione IBAN).
  Su 6 chiamate identiche per condizione, con **mini**: brand Cake firma giusta
  **0/6**, brand Flowers **0/6**, senza brand 5/6. Con **4o**: Cake 6/6, Flowers
  6/6, senza brand 6/6, oggetto 6/6, **mai** la firma di un marchio sbagliato.
  Ci ho girato attorno per cinque riscritture del prompt — brand in testa, brand
  in coda, gerarchie scritte in maiuscolo, identità nel messaggio di sistema — e
  nessuna cambiava il risultato. **Non era il prompt: era il modello.**
  Regola operativa: prima di riscrivere un prompt per la sesta volta, misura su
  N chiamate e prova il modello grande. Una chiamata sola non dice niente: le
  risposte oscillano fra chiamate identiche, e ci ho creduto due volte.

  ⚠️ **Le istruzioni vanno scritte come ORDINI, non come descrizioni.**
  «Chiudi ogni mail con…» attecchisce, «ci si firma sempre…» viene ignorata: il
  modello legge una descrizione come un'informazione sull'azienda, non come una
  cosa da fare. Vale anche per l'estrazione dai documenti — il prompt di
  `ricavaIstruzioni` ordina esplicitamente di trasformare il raccontato in
  comandi, perché i manuali aziendali sono scritti al descrittivo. Le 6
  istruzioni di partenza sono state riscritte all'imperativo per lo stesso
  motivo (e le righe già in tabella migrate una tantum).

  ⚠️ **La firma di partenza non nomina più «Deluxy» ma «il negozio per cui stai
  scrivendo»**: in un gruppo con più marchi una firma fissa è una firma che
  sparisce — col brand impostato, il modello preferiva non firmare piuttosto che
  firmare col nome di un altro.

  ⚠️ **`sostituisceId`: una regola di brand può mandare in pensione una regola
  generale.** Serve quando le due si contraddicono (firma Deluxy contro firma
  Cake Design): la generale non viene proprio mandata all'AI. Con `gpt-4o` il
  conflitto si risolve bene anche senza — il 6/6 è stato ottenuto SENZA
  collegamento — ma il campo resta come valvola di sicurezza e rende la scelta
  visibile invece che affidata al modello. Nel documento esportato la regola
  sostituita si vede **barrata**, con scritto da cosa è rimpiazzata: toglierla
  farebbe sparire una regola che per gli altri brand vale, lasciarla muta
  farebbe credere che l'AI la legga.

  ⚠️ **`serverExternalPackages: ['pdf-parse', 'mammoth']` in `next.config.ts` non
  è facoltativo**: impacchettato da Next, pdf-parse fallisce su OGNI pdf con
  «Object.defineProperty called on non-object». In uno script node di prova non
  si vede — lì il pacchetto è già esterno — quindi il caricamento va provato
  passando dall'app.

  ⚠️ Un PDF **scansionato** non contiene testo: viene respinto dicendolo
  («è un'immagine, serve l'originale o l'OCR») invece di salvare un documento
  vuoto da cui non si ricava niente. Verificato, insieme al rifiuto dei formati
  non letti (.png, .doc vecchio, file Apple) e del file mancante.
  L'elenco dei documenti NON rilegge i testi: estratto e lunghezza li calcola
  Postgres con `left()`/`length()`, altrimenti dieci manuali sarebbero megabyte
  per disegnare dieci righe di tabella.

- SEZIONE **CS AI** — le istruzioni con cui l'AI parla ai clienti (26/07/2026).
  Tabella `IstruzioneAI`, libreria `src/lib/cs-ai.ts`, pagina `/cs-ai`, rotte
  `/api/cs-ai` (CRUD), `/api/cs-ai/iniziali` (6 istruzioni di partenza, non
  duplicano) e `/api/cs-ai/anteprima` (il blocco esatto che finisce nel prompt).
  **Sono il COME, non il cosa**: i testi da mandare restano gli Script. Ogni
  istruzione ha un `ambito` — sempre / solo chat / solo email — perché a una chat
  e a una mail si scrive in modo diverso.
  ⚠️ **DUE LIVELLI: i PALETTI restano nel codice.** Cinque regole (non inventare
  dati, non promettere rimborsi o date, non spacciare decisioni non prese, tacere
  se non si sa) stanno in `PALETTI` e **non si cancellano dall'interfaccia**: se
  fossero righe modificabili basterebbe toglierne una perché l'AI cominci a
  promettere cose mai decise, e nessuno se ne accorgerebbe finché un cliente non
  ci tiene per la parola. Le istruzioni scritte si AGGIUNGONO, e il prompt dichiara
  che in caso di conflitto vincono i paletti.
  ⚠️⚠️ **DOVE VANNO LE ISTRUZIONI NEL PROMPT — misurato, non supposto.** Con
  `gpt-4o-mini` metterle nel **messaggio di sistema NON funziona**: il modello
  restituiva lo script IDENTICO e un'istruzione di prova («chiudi sempre con —
  Reparto Fiori, Deluxy») non compariva mai. Funziona mettendole nel **messaggio
  utente, per ultime**, subito prima di «ora scrivi la risposta». Contava anche la
  `description` del campo `risposta` nello schema JSON: diceva «lo script adattato
  al messaggio (nome, numero ordine, data)», un elenco chiuso che il modello
  prendeva come l'unica libertà concessa — ora dice che il testo si RISCRIVE.
  VERIFICATO con l'AI vera, nei due versi: con l'istruzione di prova attiva la
  risposta finisce con «— Reparto Fiori, Deluxy»; cancellata l'istruzione, la
  firma sparisce. E in contesto **email** la risposta si chiude con «Un cordiale
  saluto…» (istruzione solo-email) mentre in chat no: il filtro per ambito regge
  end-to-end. Logica pura provata a parte: i 5 paletti sempre presenti, le regole
  solo-chat fuori dal prompt mail e viceversa, nessuna sezione vuota senza
  istruzioni.
  `suggerisciRisposta(messaggio, script, contesto)` ha il terzo parametro
  ('chat' | 'email', default 'chat'); `/api/script/suggerisci` lo accetta nel body.
  ⚠️ **DEBITO DA SANARE**: `prisma generate` non è potuto girare (il `.dll` è
  bloccato dal dev server dell'altra sessione, PID sulla porta 3140). Ho aggirato
  generando in una cartella temporanea e copiando tutto tranne il motore — i tipi
  sono giusti, typecheck e build passano, il DB risponde. **Effetto collaterale**:
  il client non carica più `.env` da solo negli script `node` (Next e Vercel lo
  caricano, quindi app e produzione non sono toccate). Al primo momento in cui la
  cartella è libera, rilanciare `npx prisma generate` per rimettere le cose a posto.

- SCRIPT RICHIAMABILI DAL POP-UP DI POSTA (26/07/2026). Dentro il modulo della
  mail c'è **«Usa uno script»**: si cerca fra le risposte pronte e si clicca —
  il testo entra nel messaggio **dove sta il cursore** (o in fondo, se il riquadro
  non è stato toccato). `POST /api/script/[id]/usato` incrementa `usi`, come fa
  già l'AI in `/api/script/suggerisci`: se contasse solo l'AI, l'ordinamento «i
  più usati in cima» racconterebbe le sue abitudini e non quelle di chi lavora.
  ⚠️ **IL SALUTO NON DEVE USCIRE DOPPIO.** Ogni script comincia con «Buongiorno,»
  e il corpo della mail ce l'ha già («Buongiorno Shontelle, le scriviamo…»).
  `src/lib/script-testo.ts` toglie il saluto allo script SOLO se il testo che lo
  precede ne ha già uno, e rimette la maiuscola. Riconosce pochi saluti in testa
  alla frase (buongiorno/buonasera/salve/ciao/gentile…/hello/bonjour/…): meglio
  lasciare un saluto doppio che tagliare una parola che serviva.
  Con una SELEZIONE attiva si sostituisce **in linea**; con il solo cursore lo
  script diventa un **paragrafo a sé**, e le righe vuote non si accumulano.
  ⚠️ **BUG TROVATO IN VERIFICA, il caso più comune di tutti**: un riquadro di testo
  mai cliccato riporta `selectionStart = 0`, indistinguibile da «cursore
  all'inizio». Chi apriva il pop-up e prendeva subito uno script se lo vedeva
  infilato PRIMA del saluto, col «Buongiorno» doppio. Ora la posizione si RICORDA
  (`cursore` in `ComponiMail`) e vale solo se il riquadro è a fuoco o è già stato
  usato; altrimenti si aggiunge in fondo.
  VERIFICATO in pagina: aprendo il pop-up e prendendo subito «Ritardo nella
  consegna» → **un solo «Buongiorno»**, script come paragrafo dopo l'apertura,
  elenco che si chiude, `usi` che cresce, ricerca che filtra («fattura» → 1
  script, «consegna» → 2, testo inesistente → «Nessuno script per «…»»).
  I contatori `usi` gonfiati dai miei clic sono stati riazzerati.

- POP-UP DI POSTA: LA MAIL SI SCRIVE E SI MANDA DA QUI (26/07/2026).
  Il bottone **Email** non è più un link `mailto:` ma apre `ComponiMail.tsx`:
  Da (casella aziendale) · A · Oggetto · Messaggio, già scritti nella lingua del
  cliente, e **Invia**. Rotte nuove: `POST /api/email/invia` e
  `GET /api/caselle` (che espone solo indirizzo/nome/predefinita — password, host
  e porte restano lato server).
  PERCHÉ: `mailto:` dipende dal programma di posta del computer — dove non è
  configurato non succede niente, e dove lo è la mail parte da un indirizzo
  personale, fuori da quest'app e senza lasciare traccia. Ora esce da
  `cs@deluxy.it` via SMTP e **viene registrata in Inbox** come conversazione
  email (stesse convenzioni del sync: canale `email`, `idEsterno` = indirizzo).
  ⚠️ **L'HANDOFF DICEVA IL FALSO**: «SMTP risponde 535 authentication rejected».
  Provato con `provaCasella()` sulla casella vera: **«Invio e ricezione funzionano
  per cs@deluxy.it»**. Il 535 è rientrato, la nota era vecchia. `inviaEmail()`
  esisteva già in `src/lib/email.ts`: mancava solo la rotta per una mail NUOVA
  (prima si potevano solo mandare risposte dentro un thread).
  ⚠️ **DIFETTO TROVATO E CORRETTO**: `casellaPerId()` ripiega da sé sulla
  predefinita, quindi un `casellaId` inesistente faceva partire la mail **da un
  altro indirizzo senza dirlo**. Ora se l'id è indicato esplicitamente e non
  esiste si rifiuta (400): una mail a nome di qualcun altro non è un ripiego
  accettabile.
  VERIFICATO: rifiutati prima di toccare l'SMTP → destinatario mancante, non
  valido, senza dominio, corpo vuoto, casella inesistente. Pop-up su #1731: Da
  `cs@deluxy.it`, A precompilato, oggetto «Ordine #1731», testo nella lingua del
  cliente, Esc chiude, `mailto:` **non compare più** in pagina.
  ⚠️ **NON ho premuto Invia su un cliente vero** (sarebbe una mail a una persona
  reale). Da provare a mano: l'unica cosa non verificata è l'invio vero dal
  pop-up. Il percorso SMTP però è provato da `provaCasella` (autenticazione ok).
  ⚠️ **INCIDENTE DEL MIO TEST**: un caso di prova con destinatario e testo validi
  ha **inviato davvero** una mail «ciao» a `x@esempio.it`. Traccia rimossa dal
  database (conversazioni email tornate a 0). Lezione: nei test su una rotta che
  invia, i casi devono essere **non spedibili per costruzione** (indirizzo o corpo
  non validi), non «probabilmente innocui».

- CANALI DI CONTATTO A SCELTA (26/07/2026). Il bottone «Contatta» sceglieva da
  solo: WhatsApp se c'era un numero, la mail altrimenti. Non è una gerarchia
  vera — a chi ha appena scritto una mail si risponde per mail, un ritardo
  grave si dice al telefono — quindi ora si mostra **un bottone per ogni canale
  che quel cliente ha davvero**: WhatsApp, Chiama, Email. Senza recapiti resta
  scritto «Nessun recapito» col motivo.
  Vale in tutti e tre i posti: schede, tabella e pannello di dettaglio
  (`canaliContatto()` in OrdiniLista, stessa logica nel dettaglio).
  La telefonata usa un link `tel:` col numero come è scritto (il + conta) e **non porta
  nessun testo**: il messaggio precompilato lì non serve. WhatsApp e mail
  restano nella lingua del cliente e non partono da soli.

- DETTAGLIO: MITTENTE, DESTINATARIO E INDIRIZZO DI CONSEGNA (26/07/2026).
  Nel pannello di un ordine ora si distinguono **chi ordina** (mittente, coi suoi
  recapiti) e **chi riceve** (destinatario), con l'indirizzo di consegna
  completo di CAP, provincia e paese. Quando sono la stessa persona lo dice.
  ⚠️ **Il destinatario NON è in casa**: qui l'ordine tiene i dati di chi compra.
  Arriva da Orders (campo spedizione di GET /api/v1/ordini) nella stessa chiamata
  che già portava le righe e le foto — nessuna copia locale, regola 2 dell'app.
  Verificato su #1733: in casa il campo indirizzo è VUOTO e la città «Florence», da
  Orders arriva «11 Campbell Avenue… IG6 1EA ENG GB». Quindi questa aggiunta
  non è solo un'etichetta in più: prima l'indirizzo di consegna su quegli
  ordini non si vedeva proprio.
  Se Orders non risponde si mostra l'indirizzo della copia locale, dicendo che
  è senza CAP e provincia.

- ORDINI APERTI / ORDINI GLOBALI (26/07/2026): la lista degli ordini ora è due
  pagine, stessa tabella (`OrdiniLista` con prop `modalita`):
  · **/** «Ordini aperti» — la lista di LAVORO: non gestiti, e **senza gli
    ordini con un rimborso vivo** (stato richiesto o approvato). Da quando si
    apre un rimborso quell'ordine si lavora in /rimborsi, e lasciarlo qui vuol
    dire che prima o poi qualcuno lo rilavora per sbaglio. Rifiutato o
    annullato → l'ordine torna nella lista.
  · **/ordini-globali** «Ordini globali» — l'archivio intero, gestiti e
    rimborsati compresi, con la ricerca. Parte dalla vista a tabella perché qui
    si cerca, non si lavora.
  Il filtro sta nell'API (`GET /api/ordini?rimborsi=nascondi`), non nel client:
  così il conteggio e l'elenco non possono divergere. Il rimborso esclude
  **sia per id sia per numero**, perché l'ordine può vivere solo nell'archivio
  di Orders.
  Verificato sui dati veri: aperti 906 → **905** (sparisce #2585, rimborso
  «richiesto»), globali **923**; l'ordine esiste ancora ed è `da_gestire`.

- URGENTI IN CIMA, PAGINA COMPATTA, COPIA FOTO (26/07/2026).
  **ORDINE PER URGENZA A FASCE** (`src/lib/urgenza.ts` + `ordiniPerUrgenza()` in
  `/api/ordini`): oggi (per fascia oraria, prima chi va consegnato presto) →
  domani e oltre (per data) → scadute da ≤3 giorni (dalla più recente) → senza
  data (dalle più recenti) → **scadute da tempo per ultime**.
  ⚠️ NON si ordina per «consegna più vecchia prima», che sarebbe l'ovvio: misurato
  sui dati veri, fra i non gestiti **578 hanno la consegna già passata** (fino a
  due mesi indietro) e quelli di **oggi sono 8** — perché `gestione` è recente e
  nessuno ha spuntato gli ordini vecchi. Ordinando per data il lavoro di oggi
  finiva sotto 578 righe di archeologia.
  ⚠️ Si ordina LATO SERVER perché l'elenco è tagliato a 200: ordinando nel browser
  si ordinerebbero i 200 più recenti, e un ordine da consegnare oggi ma ricevuto
  tre settimane fa non entrerebbe. Sono 5 query, una per fascia, che si fermano al
  tetto. Verificato: gli 8 di oggi in cima nell'ordine 08-12 → 18-20, poi +1gg,
  +2gg…
  In testa: pillole **«8 da consegnare oggi»**, «7 domani», «28 scadute di
  recente», contate sul filtro in corso.
  **SPAZIO**: primo ordine da ~430px a **344px**, scheda da 237 a **166px**
  (−30%), **con tutti i bottoni al loro posto**. Come: testa in una riga sola (il
  dettaglio della catena Shopify → Ordini → qui è nel `title` del pallino);
  azioni con etichette corte ("Paga", "Contatta") e cornice più stretta (gap 4px,
  padding 2×8, font 12px), che porta i 6-7 bottoni da tre righe a due — il blocco
  azioni scende da 97px a 56px. Tolta anche la data dell'ORDINE dalla scheda
  (quella che serve a chi lavora è la consegna, due righe sopra): faceva andare i
  badge a capo, 27px per scheda.
  ⚠️ **ERRORE MIO, CORRETTO**: in un primo giro avevo lasciato sulla scheda solo
  Contatta e Gestito, spostando le altre nel dettaglio. Sono azioni fondamentali e
  vanno tenute tutte: lo spazio si prende dalla cornice dei bottoni, non dal loro
  numero. Stringendola si ottiene **lo stesso risparmio** (166px contro i 167 che
  avevo ottenuto togliendole) senza perdere niente. Le azioni ci sono comunque
  anche nel dettaglio, che è utile a chi ci arriva da lì.
  **COPIA FOTO** (`copiaFoto` in `DettaglioOrdine.tsx`), accanto a Scarica.
  Due vincoli del browser da cui nasce il giro: negli appunti si può mettere
  **solo PNG** (`ClipboardItem` con image/jpeg viene rifiutato), e il canvas si
  sporca con un'immagine di un altro dominio — quindi la foto si carica dalla
  NOSTRA rotta `/api/immagine` (stessa origine) e si riesporta in PNG su canvas,
  con sfondo bianco perché un PNG trasparente incollato in chat diventa nero.
  VERIFICATO fin dove si può da qui: foto scaricata dalla nostra rotta (352 KB),
  canvas **non** sporcato, PNG prodotto (453 KB), `ClipboardItem` presente.
  ⚠️ **La scrittura negli appunti NON è verificata**: da questa sessione il
  pannello del browser non è in primo piano e Chrome risponde `NotAllowedError:
  Document is not focused`. Con un clic vero della persona la finestra è a fuoco,
  quindi dovrebbe funzionare — **da provare a mano**. Se fallisse, il messaggio
  distingue i casi (finestra non a fuoco / browser che non sa copiare / permesso
  negato) invece di dare una spiegazione sola e sbagliata.

- DETTAGLIO ORDINE CON FOTO E MESSAGGIO PER IL FORNITORE (26/07/2026).
  Cliccando **un punto qualsiasi** della scheda (o della riga in tabella) si apre
  `DettaglioOrdine`: foto grande del prodotto, **Scarica foto**, e il messaggio
  già scritto «Per mercoledì 29 luglio possibile questo prodotto con ritiro
  15-19?» da copiare. La riga delle azioni fa `stopPropagation`, altrimenti
  premere *Reclamo* aprirebbe anche il pannello; `role=button` + Invio/Spazio +
  Esc per chiudere.
  RITIRO = **fascia di consegna meno un'ora** (`src/lib/ritiro.ts`): il valet deve
  avere il prodotto prima di partire. 16-20 → 15-19. Una fascia di forma diversa
  da HH-HH, o che comincia a mezzanotte (un'ora prima sarebbe il giorno prima),
  diventa «ritiro da concordare»: a un fornitore non si manda un orario inventato.
  Il messaggio è in ITALIANO anche se il cliente è straniero — qui il destinatario
  è un fornitore, che è un partner italiano (la lingua del cliente è un'altra
  cosa, vedi `src/lib/lingua.ts`).
  LE FOTO VENGONO DA ORDERS: `RigaOrdine.immagine` c'era già ma l'API non la
  esponeva — aggiunta in `serializzaOrdine` (**lato Orders, pubblicato**). Il
  Customer Service NON tiene copia delle righe: le chiede a
  `righeOrdineDaOrders()` quando si apre il dettaglio.
  ⚠️ L'ordine si riconosce dal **gid Shopify**, non dal nome del negozio: `#1733`
  esiste sia su Cake sia su Deluxy, e col match sul brand il pannello diceva «il
  numero esiste su più negozi». Il gid è la stessa chiave con cui il sync fa
  l'upsert, quindi è esatta.
  ⚠️ `/api/immagine` è un proxy con **lista bianca obbligatoria**
  (`cdn.shopify.com`, https): serve perché il browser ignora `download` sui link
  cross-origin, ma una rotta che scarica un URL arbitrario è un proxy aperto verso
  la rete interna. VERIFICATO che respinge 169.254.169.254 (metadata AWS),
  localhost, 192.168.1.1, host estranei, http su host ammesso e URL malformati;
  e che ciò che torna sia davvero `image/*`.
  Copertura reale: negli ultimi 60 giorni **730 ordini su 892 hanno almeno una
  foto** (80% delle righe). Chi non l'ha mostra «nessuna foto».
  Verificato in pagina su #1733: foto 1108×1108, le 4 personalizzazioni del
  prodotto (Numeri: 30, Base, Ingredienti, Topping), messaggio col ritiro 15-19,
  Esc chiude, e premere *Gestito ✓* non apre il pannello.

- «PAGA FORNITORE» + SI SCRIVE AL CLIENTE NELLA SUA LINGUA (26/07/2026).
  Il bottone «Richiedi pagamento» è ora **Paga fornitore** (scheda e tabella), e
  la pagina di arrivo diceva una cosa sbagliata — «le coordinate su cui **farsi
  pagare**» — mentre sono le coordinate del fornitore **da pagare**: corretta.
  LINGUA: `src/lib/lingua.ts` decide in che lingua aprire il messaggio al cliente
  (it/en/fr/es/de) e `linkContatto()` la usa per testo e oggetto; il titolo del
  bottone dice **quale lingua e perché**.
  ⚠️ **IL SEGNALE È CHI COMPRA, NON DOVE VANNO I FIORI.** Qui si vende regalo:
  `paese` è quello di SPEDIZIONE, cioè il destinatario, mentre il messaggio va al
  CLIENTE. Prima avevo messo il paese per primo: sbagliato in entrambi i versi —
  italiano a un londinese che manda a Milano, francese a un italiano che manda a
  Parigi. Ordine corretto: (1) prefisso del suo telefono, (2) dominio della sua
  email, (3) **se il prefisso è estero ma fuori tabella si ferma qui in inglese**
  (altrimenti a un cliente di Dubai che spedisce a Parigi si scriverebbe in
  francese — caso vero, ordine #2378), (4) paese di spedizione, (5) numero senza
  prefisso di forma italiana, (6) niente del tutto → **italiano**, perché 3
  ordini su 4 spediscono in Italia: rispondere inglese a un italiano solo perché
  manca il suo numero è scommettere contro i propri dati.
  Svizzera, Belgio e Canada NON sono in tabella di proposito: da un indirizzo non
  si sa se a Berna si parli tedesco o francese.
  Campo nuovo `Ordine.paese` (ISO 2 lettere) da `spedizione.paese` di Orders.
  VERIFICATO sui 922 ordini veri: italiano 69%, inglese 26%, francese 3%, tedesco
  1%, spagnolo 1% — coerente col 75% di spedizioni in Italia. Casi provati:
  #12572 spedisce in IT ma il cliente ha un +43 → **tedesco**; #2378 (+971 → FR)
  e #2377 (+41 → FR) → inglese; `07534…` (mobile UK senza +44) con spedizione GB
  → inglese. In pagina: Emma Baker → «Hello Emma, we are writing about your order
  #1733.», gli altri in italiano.
  Il messaggio **non parte da solo**: wa.me e mailto lo precompilano, l'operatore
  lo rilegge e può cambiarlo — è la rete di sicurezza di tutte queste deduzioni.

- FORNITORE: PERCHÉ CHIEDE LA PASSWORD, E ORA LO DICE (26/07/2026).
  Diagnosi di `search-deluxy.vercel.app/?brand=…&ordine=…` che chiedeva il login:
  **non è un guasto**, è il link NON firmato. Quell'app si apre senza password
  solo con un codice monouso `?t=<code>` (schema authorization-code: `POST
  /api/link` con `x-api-key: dlxs_…` → codice valido 5 minuti → il browser lo
  scambia con `GET /api/link?code=` per una sessione di 1 ora; vedi
  `deluxy-search-supplier/api/link.js` sul branch **main**).
  CAUSA VERA: in questa app `searchApiKey` **non è impostata** (verificato sulla
  tabella `Impostazione`), quindi `linkFornitore()` ripiega sul link semplice.
  I campi ci sono già in Impostazioni → Ricerca fornitori.
  **PER SISTEMARLO SERVE UNA PERSONA**: la chiave si crea SOLO da amministratore
  dell'app Ricerca fornitori (`POST /api/chiavi {azione:'crea'}`, che risponde
  403 a chi non è admin) e va incollata qui. Non è una cosa che si possa fare da
  codice.
  CORRETTO NEL FRATTEMPO il difetto nostro: il bottone ripiegava **in silenzio**,
  e l'operatore si trovava davanti a un login senza sapere perché. Ora
  `linkFornitore()` torna una `nota` anche nel caso «chiave assente», e
  `apriFornitore()` la mostra in pagina. Verificato: l'API risponde
  `firmato:false` con l'URL identico a quello che l'utente aveva aperto, e
  premendo *Fornitore* compare l'avviso con l'istruzione.

- DATA E FASCIA DI CONSEGNA IN ELENCO (26/07/2026): sulla scheda dell'ordine una
  riga sotto il cliente, e in tabella la colonna **Consegna**. I campi
  (`dataConsegna`, `fasciaConsegna`) c'erano già da Orders e li usava solo il
  calendario. Sui dati veri: 618 ordini su 922 hanno la data, 633 la fascia.
  ⚠️ **LA FASCIA SI SCRIVE SEMPRE CON «ore» DAVANTI** (`fasciaLeggibile`):
  da Orders arriva come `"08-12"`, che accanto a una data si legge come **8
  dicembre** — è l'equivoco già costato (vedi la regola «non dedurre dati
  critici»). `"08-12"` → «ore 8–12». Una fascia di forma diversa da HH-HH si
  mostra **così com'è**, senza interpretarla.
  `consegnaLeggibile` dice «consegna OGGI» (rosso), «domani» (oro), «scaduta da N
  giorni» (rosso) o la data con il giorno della settimana. Se manca il giorno ma
  c'è la fascia: «consegna ore 12–16, giorno non indicato»; se non c'è niente:
  «consegna non indicata» — mai riempita a caso.
  Verificato sui 200 ordini in pagina: tutti e cinque i casi resi correttamente.

- LA REGOLA «GLI ORDINI LI SCARICA SOLO ORDERS» È ORA IMPOSSIBILE DA VIOLARE
  (26/07/2026). Il codice per prendere gli ordini da Shopify era ancora qui,
  inerte ma pronto: `src/lib/shopify.ts` con `scaricaOrdini()` e `risolviToken()`,
  `tokenPerNegozio()`/`negoziAttivi()` in `negozi.ts`, e la pagina `/negozi` che
  **chiedeva e cifrava credenziali Admin di Shopify** che nessuno leggeva.
  Verificato prima di togliere: `scaricaOrdini`, `verificaStore`, `tokenPerNegozio`
  e `negoziAttivi` non erano chiamati da nessuno.
  Ora `src/lib/shopify.ts` è **cancellato**, le credenziali non si chiedono né si
  salvano più, e la regola è scritta in testa a `src/lib/negozi.ts`. Motivo:
  due sorgenti per lo stesso ordine vorrebbero dire due verità, con
  classificazioni diverse a seconda dell'app che si guarda.
  Le colonne `token`/`clientId`/`clientSecret` restano sulla tabella coi valori
  storici — **non le legge più nessuno**. Se si vogliono azzerare quei segreti,
  è una cancellazione di dati e va chiesta prima.

- ORDINI VISIBILMENTE AGGIORNATI, E DAVVERO OGNI 15 MINUTI (26/07/2026).
  ⚠️ **LA CATENA ERA ROTTA A MONTE**: questo cron gira ogni quarto d'ora, ma
  **Orders scaricava da Shopify una volta al giorno (06:00)** — quindi si
  interrogava una fonte ferma e un ordine delle 10:00 compariva qui il mattino
  dopo. Non si poteva nemmeno sospettare: la pagina scriveva «aggiornati 3 minuti
  fa», che era vero e inutile.
  Corretto in `deluxy-orders/vercel.json`: due giri, `*/15 * * * *` su
  `/api/cron/sync?giorni=2` (gli ordini NUOVI in fretta) più la passata piena a
  90 giorni una volta al giorno (rimborsi, annullamenti, evasioni: cose che
  cambiano DOPO e che il giro veloce non guarda). I feedback restano sul giro
  lento — sono una chiamata a un'altra app e un reclamo non si aspetta come un
  ordine. Il parametro `giorni` è letto dalla rotta (max 365, default 90).
  In pagina, al posto della scritta grigia c'è la **barra della catena**
  (`.catena-sync`): pallino verde che pulsa se il giro è vivo, «Ordini aggiornati
  N minuti fa», «Ordini ha scaricato da Shopify N minuti fa» — quest'ultimo da
  `ultimoImportOrders()` che legge `ultimoImport`, campo nuovo di
  `GET /api/v1/health` di Orders (pubblico, è un orario) — e «questa pagina si
  rilegge da sola». Il pulsante è diventato «Aggiorna adesso».
  DUE ALLARMI, perché un elenco fermo e un elenco senza novità si vedono uguali:
  pallino rosso + avviso se l'ultimo giro è **fallito** (`ordiniSyncEsito` che non
  inizia per "ok") o se non si aggiorna **da più di un'ora** (quattro giri
  mancati di fila non sono un ritardo, sono un guasto).
  L'elenco si **rilegge da solo ogni 60 secondi** (non 15 minuti: i giri del cron
  non sono allineati a quando apri la pagina, quindi con un solo controllo ogni
  quarto d'ora un ordine appena arrivato potrebbe aspettarne quasi trenta). Si
  **ferma a scheda nascosta** e rilegge appena torna in primo piano.
  VERIFICATO: barra con i tre orari veri; scheda nascosta → 0 letture, ritorno in
  primo piano → 1 lettura subito; simulando 3 ore di fermo → pallino `fermo` +
  avviso; simulando un giro fallito → avviso con il messaggio d'errore; stato
  normale → nessun avviso. `ultimoImport` in produzione risponde davvero.
  ⚠️ DA CONTROLLARE FRA UN GIRO: che il cron `*/15` di Orders parta **da solo**
  (si vede da `ultimoImport` che avanza). Vercel registra i cron al deploy.

- RIMBORSI: BOTTONE SULL'ORDINE + REGISTRO (26/07/2026): da ogni ordine (scheda e
  tabella) il pulsante **Rimborso** apre `/rimborsi` col modulo già pieno
  (ordine, cliente, recapiti, **totale** e **stato del pagamento**). Tabella
  `Rimborso`, `src/lib/rimborsi.ts`, API `/api/rimborsi` e
  `/api/rimborsi/[id]/stato`, pagina + voce di menu.
  Flusso: **richiesto → approvato → rimborsato** (oppure rifiutato/annullato).
  ⚠️ **QUEST'APP NON RIMBORSA.** Registra la richiesta e la decisione; i soldi li
  muove una persona su Shopify o in banca e poi si segna «rimborsato». È la
  regola del repo (nessuna app Deluxy paga per conto proprio, vedi
  deluxy-transactions): **non aggiungere qui una chiamata che sposta denaro** —
  semmai si instrada a Transactions.
  I PALETTI, verificati contro l'API vera sull'ordine #1729 da 64 €:
  · non si rende più di quanto incassato → 64,01 rifiutato;
  · il tetto è **cumulativo** sulle altre richieste dello stesso ordine → 40 ok,
    poi 25 rifiutato («al massimo 24,00 €»), 24 ok, poi anche 1 € rifiutato
    («già chiesto o reso l'intero importo»);
  · importo 0 / negativo / NaN rifiutati; **motivo obbligatorio** (un rimborso
    senza motivo scritto è indifendibile dopo); ordine obbligatorio;
  · rifiutato e annullato **non impegnano** denaro: dopo un rifiuto si può
    richiedere di nuovo l'intero importo (verificato);
  · «rimborsato» **esige l'esito scritto** (400 senza), stato inventato → 400.
  I confronti sono in **centesimi interi**, non in float: con 66,66 già impegnati
  su 100, chiedere 33,34 deve passare — in virgola mobile il residuo risulta
  negativo e verrebbe rifiutato un rimborso legittimo (provato).
  AVVISI (non bloccano, informano) da `avvisoPagamento(statoPagamento)`: REFUNDED
  «già rimborsato per intero», PARTIALLY_REFUNDED, VOIDED «pagamento stornato»,
  PENDING «non ancora incassato», vuoto «stato sconosciuto». Sui dati veri
  servono davvero: 16 REFUNDED, 11 PARTIALLY_REFUNDED, 11 VOIDED, 5 PENDING.
  KPI: da approvare, approvati da pagare, **promesso e non ancora uscito** (somma
  di richiesti+approvati: un eseguito non ci conta, verificato) e rimborsato.
  MANCA: legare la richiesta al reclamo da cui nasce (il campo `reclamoId` c'è ed
  è accettato dall'API, ma non c'è ancora il pulsante dal reclamo), e l'invio a
  deluxy-transactions per l'uscita vera.

- TIPO DI CLIENTE SUGLI ORDINI (26/07/2026): ogni ordine mostra **da che tipo di
  cliente arriva** — privato, azienda, hotel/ristorante, eventi, rivenditore.
  Il dato **viene da Orders, non si calcola qui**: campi nuovi `Ordine.clienteTipo`
  e `clienteTipoDa` (copia riscritta a ogni sync), letti da `cliente.tipo`/`tipoDa`
  di `GET /api/v1/ordini`. Nomi e colori in `src/lib/clienti-tipo.ts` — solo
  presentazione: la classificazione resta di Orders, e un valore sconosciuto si
  mostra grezzo invece di sparire.
  In pagina: bollino su ogni scheda e colonna in tabella, filtro «Tipo cliente»
  (con *Tipo non rilevato* per gli ordini senza recapiti) e la riga «Da che
  clienti: …» coi conteggi cliccabili, da `perTipoCliente` in `/api/ordini`.
  ⚠️ **LATO ORDERS SERVE IL DEPLOY**: l'esposizione del campo è in
  `deluxy-orders/src/lib/tipologia-cliente.ts` + `serializzaOrdine` + la rotta
  `/api/v1/ordini`, ma **finché Orders non è pubblicato** la produzione risponde
  senza `cliente.tipo` e il sync scrive vuoto. Verificato in locale contro Orders
  vero: 894 ordini su 917 marcati, distribuzione reale **858 privato, 3 azienda,
  1 horeca, 32 non rilevati**; filtro «Azienda» → i 3 giusti (Recarlo Spa,
  Chatwin SRL, Eightstone Pte Ltd), «Tipo non rilevato» → 54.
  NOTA SUL DATO: la deduzione guarda il NOME DELL'ACQUIRENTE, e su Shopify quello
  è quasi sempre una persona anche quando compra un'azienda — perciò il B2B
  risulta sottostimato. Non è un errore del codice: si corregge caso per caso in
  Orders (tag manuale sul cliente), e da lì arriva qui col sync.
- CORRETTO «Scarico non riuscito.» SUL PULSANTE AGGIORNA (26/07/2026):
  `/api/ordini/sync` chiamava `sincronizzaOrdini({completo})` e `contatti` ha
  come default **true**, quindi il pulsante salvava anche la rubrica Google:
  ~218 secondi misurati (40 chiamate alla People API) contro `maxDuration = 60`.
  La funzione veniva uccisa, Vercel rispondeva 504 con una pagina non-JSON e il
  client — che fa `res.json().catch(() => ({}))` — restava senza campo `errore`,
  mostrando il messaggio generico. Per lo stesso motivo l'errore non finiva
  nemmeno in `ordiniSyncEsito`: `annotaSync` non faceva in tempo a girare.
  Ora passa `contatti: false`: i contatti li salva il cron dedicato
  (`/api/cron/contatti`, ogni ora, maxDuration 300) o il pulsante «Salva tutti i
  contatti». È la stessa correzione già applicata al cron dei 15 minuti, che sul
  pulsante era rimasta indietro. Verificato: **200 in 7,3s**, 36 ordini, 2 nuovi.

- API A CHIAVE PER LE ALTRE APP (26/07/2026): `GET /api/v1/feedback` espone in
  **sola lettura** i reclami e i voti legati a un ordine, per il registro ordini
  (deluxy-orders), che li mostra sulla scheda dell'ordine. Nuovi: `model ApiKey`
  (nel DB solo lo SHA-256), `src/lib/api-auth.ts`, `scripts/crea-chiave.mjs`
  (`npm run chiave -- <app>`), e in `middleware.ts` il ramo che lascia passare
  `/api/v1/*` — si autentica da sé (standard Deluxy §4.3) — con gli header CORS.
  Chiave già creata per **deluxy-orders**.
  Due scelte da non ribaltare per sbaglio: (a) **niente scrittura**, un reclamo
  si apre e si chiude qui, dove c'è chi ha parlato col cliente; (b) un voto
  **senza numero d'ordine non esce**, perché a un registro di ordini non serve
  un giudizio che non sa dove attaccare.
  ⚠️ **Da pubblicare**: finché questa versione non è su Vercel, l'import di
  Orders in produzione non trova la rotta (in locale è già provato e funziona).

- PUNTEGGI CONFIGURABILI DI VALET E PARTNER (26/07/2026): la "pagella".
  4 tabelle nuove (`VocePunteggio`, `Feedback`, `Puntualita`, `MetricaManuale`),
  motore di calcolo in `src/lib/punteggi.ts`, pagine `/reclami/punteggi` (pagella
  + configurazione delle voci) e `/reclami/feedback` (registrazione di feedback e
  orari), API `/api/punteggi`, `/api/punteggi/voci`, `/api/punteggi/voci/iniziali`,
  `/api/punteggi/manuale`, `/api/feedback`, `/api/puntualita`.
  **IL PUNTEGGIO NON È UNA FORMULA NEL CODICE.** È la media pesata di VOCI che
  l'operatore configura: ognuna ha una `fonte` (`reclami` | `feedback` |
  `puntualita` | `manuale`), un `peso` e una `soglia`. Aggiungere una variabile
  ("cura del confezionamento") = aggiungere una voce, non toccare il codice.
  Le 4 voci di partenza: Reclami (tutti, peso 3, soglia 10), Feedback (tutti,
  peso 3), Puntualità (solo valet, peso 4, tolleranza 15 min), Qualità del
  prodotto (solo partner, manuale, peso 2). Peso 0 = voce presente ma esclusa.
  **DUE REGOLE CHE TENGONO ONESTO IL NUMERO, da non rompere.**
  1. Una voce SENZA DATI per quel soggetto è **esclusa** dalla media, non contata
     come zero: un partner di cui non misuriamo la puntualità non deve risultare
     scarso per un dato mai raccolto. Svuotare un valore manuale lo rimuove
     (≠ metterlo a 0), e l'interfaccia lo dice.
  2. Sotto il 50% di peso coperto (`COPERTURA_MINIMA`) **non si dà la fascia**:
     si scrive "Da valutare". Nata da un problema visto in verifica: 38 partner su
     41 uscivano "100 Ottimo" solo perché non avevano ancora reclami — un
     complimento costruito sul nulla, che seppelliva i due soggetti con dati veri.
     Ora la pagella mostra per default solo chi ha prove sufficienti, col
     conteggio degli altri e il link per andare a misurarli.
  `Puntualita` salva i **minuti di ritardo** (0 = in orario, negativo = anticipo),
  non un "in orario sì/no": la tolleranza vive sulla voce, così cambiandola gli
  stessi dati si rileggono da soli (VERIFICATO: tolleranza 15→60 porta un valet
  da Critico 37,8 a Attenzione 57,8; rimettendo 15 torna esatto a 37,8). Se si
  passano le due date, il ritardo si **calcola** e il numero scritto a mano viene
  ignorato: una sola verità.
  VERIFICATO sui dati veri: voci iniziali 4 aggiunte / al secondo giro 0 aggiunte
  e 4 saltate; valet puntuale (9/10 in orario, feedback 5-5-4) → **93,5 Ottimo**,
  valet ritardatario (1/10, feedback 2-1) → **37,8 Critico**, ordinati dal
  peggiore; partner vero del registro con feedback 4 e qualità 80 → 85,6 su 3
  voci, togliendo il valore manuale → **87,5 su 2 voci con la terza "ESCLUSA"**
  (sale, perché l'80 non viene più contato né azzerato). Rifiutati: valore a mano
  su una voce calcolata 400, voce "puntualità" su un partner 400, voto 9 su 5 400,
  feedback senza soggetto 400, consegna senza valet 400, consegna senza minuti né
  date 400, data non valida 400; valore manuale 999 → 100, −50 → 0, soglia 0 non
  produce NaN.
  Dati di prova cancellati filtrando solo i miei record: 914 ordini e 2 utenti
  veri intatti. Le 4 voci restano: sono il catalogo di partenza.
- CUSTOMER SERVICE — RECLAMI, CASISTICHE, VALET, GIUDIZI (26/07/2026): l'app
  diventa il servizio clienti. Quattro tabelle nuove (`Valet`, `CasistaReclamo`,
  `Reclamo`, `Giudizio`), vocabolario e calcoli in `src/lib/reclami.ts`, quattro
  pagine sotto `/reclami` e sei rotte API. `prisma db push` fatto: sono tabelle
  NUOVE, nessuna esistente è stata toccata.
  **Il giro completo**: da ogni ordine (card e tabella) il bottone **Reclamo**
  apre `/reclami?ordineId=&ordine=&cliente=&telefono=&email=&negozio=` con il
  form già pieno → si scegle una **casistica** e questa riempie da sola gravità,
  colpa tipica e la **checklist delle azioni** → si attribuisce la **colpa** a un
  valet (registro locale `/reclami/valet`) o a un partner (tendina letta da
  Anagrafiche via `/api/partner`, la chiave non passa dal browser) → in
  `/reclami/giudizi` i reclami di ogni soggetto diventano un **giudizio**.
  **GIUDIZIO AUTOMATICO, come funziona** (`giudizioAutomatico()`): si sommano i
  pesi dei reclami, dove il peso è la gravità (1 lieve / 2 media / 3 grave)
  **dimezzata se il reclamo è risolto o chiuso** — rimediare conta. Soglie: 0 →
  Ottimo, ≤2 → Buono, ≤6 → Attenzione, oltre → Critico. Le soglie sono state
  ritarate durante la verifica: con la prima versione (≤3 → Buono) UN reclamo
  grave ancora aperto risultava "Buono", troppo indulgente. Il giudizio manuale
  (voto 1-5 + nota, upsert su `[soggettoTipo, soggettoId]`) **non sostituisce**
  quello automatico: si affianca, così resta visibile da cosa nasce il numero.
  **VERIFICATO sui dati veri** (dev server su porta 3141 per non litigare col
  3140 di un'altra sessione): casistiche di esempio 7 aggiunte e al secondo giro
  0 aggiunte / 7 saltate (il seed non duplica, match sul nome); un valet con 2
  gravi + 1 medio aperti → punti 8 **Critico**, un altro con 1 medio risolto →
  punti 1 **Buono**, ordinati dal peggiore; `risoltoIl` valorizzato da solo
  passando a "risolto"; azioni copiate dalla casistica (3 righe); tendina partner
  popolata con i **41 partner veri** del registro; nella sidebar si accende una
  sola voce anche sulle sotto-pagine. **Rifiutati come devono**: reclamo senza
  casistica 400, stato inventato 400, giudizio a un soggetto non giudicabile
  (azienda/cliente) 400, voto 99 → stretto a 5.
  I dati di prova sono stati cancellati **filtrando solo i miei record** (mai
  `deleteMany` globali su questo DB condiviso): 914 ordini e 2 utenti veri
  intatti. Le **7 casistiche di esempio sono state lasciate**: sono il catalogo
  di partenza, non dati di test.
  NON rinominati (romperebbero cose vive): cartella, progetto Vercel, schema
  `messaging`, cookie `msg_session`, `MARCATORE` di google.ts.
  **DEVIAZIONE SCRITTA, da sapere prima di toccare i valet.** La tabella `Valet`
  di quest'app **duplica** un registro che esiste già: quello vero è in
  deluxy-platform-next (`model Valet`, con IBAN, codice fiscale, veicolo, regole
  di stipendio). Non lo rileggiamo perché **per i valet non c'è una API a
  chiave**: `GET /api/v1/valets` è protetta da JWT utente + ruolo
  (`api/src/valets/valets.controller.ts`, guardie globali in `app.module.ts`), e
  l'unica strada praticabile oggi sarebbe tenere la password di un utente di
  servizio — peggio della copia. Perciò qui c'è solo il minimo per attribuire una
  colpa (nome, recapito, zona), e la pagina lo dice all'operatore. **Da fare
  quando si potrà**: aggiungere in platform-next una lettura a `x-api-key` sul
  modello di `deluxy-orders/src/lib/api-auth.ts`, poi sostituire la tabella con un
  `src/lib/valet.ts` che rilegge il registro, esattamente come
  `src/lib/anagrafiche.ts` fa per i partner (quelli infatti **non** sono
  duplicati). Attenzione a non prendere la strada opposta per comodità: se questa
  tabella diventa il posto dove si gestiscono i valet, nasce un secondo registro
  divergente da quello dei compensi.
- ORDINI AUTOMATICI OGNI 15 MINUTI (26/07/2026): `vercel.json` → cron
  `*/15 * * * *` su `/api/cron/ordini`, protetto da `Authorization: Bearer
  CRON_SECRET` (Vercel lo manda da solo; senza segreto la rotta risponde 503
  invece di restare aperta). `CRON_SECRET` impostata su Vercel (Production) e in
  `.env` locale. Il middleware ora ESCLUDE `api/cron` (i cron non hanno cookie:
  finivano rimandati al login).
  La logica di scarico è stata estratta in `src/lib/sincronizza.ts`
  (`sincronizzaOrdini({completo, contatti})`), condivisa fra il cron e il
  pulsante "Aggiorna" — prima viveva dentro la rotta e non era riusabile.
  MISURATO: il giro con i contatti Google durava **218 secondi** (40 chiamate
  alla People API), quello coi soli ordini **~21-25 s** (31 ordini). Perciò i
  contatti sono stati staccati sul loro cron `/api/cron/contatti` (`7 * * * *`,
  maxDuration 300): attaccati ai 15 minuti li avrebbero fatti scadere, cioè
  avrebbero fatto perdere proprio gli ordini che il cron deve salvare.
  `ordiniSyncUltimo`/`ordiniSyncEsito` in Impostazione registrano ogni giro; la
  pagina Ordini scrive "Aggiornati da soli 4 minuti fa" (verificato: "adesso").
  Verificato in locale e in produzione: senza header 401, header sbagliato 401,
  header giusto 200 con `{scaricati: 31}`. **PROVA DEFINITIVA**: alle 12:30:34
  UTC del 26/07 il giro è partito **da solo** (nessuna chiamata nostra), come si
  legge da `ordiniSyncUltimo` — il cron è davvero registrato, non solo dichiarato
  in `vercel.json`. In produzione dura **~2 secondi** (il DB Supabase è a fianco),
  contro i 21-25 s da casa.
- SEZIONE PARTNER (26/07/2026): `/partner` + `src/lib/anagrafiche.ts`
  (`partnerAttivi()`) + `/api/partner` (proxy: la chiave non passa dal browser).
  Legge `GET {anagraficheUrl}/api/v1/partners?stato=attivo` con `x-api-key`.
  NESSUNA copia locale (regola del registro: "non tenete una copia, rileggete").
  `stato=attivo` è lo stato COMMERCIALE, che nel registro vuol dire "è Partner".
  Chiave di sola lettura creata con `npm run chiave -- deluxy-messaging` in
  deluxy-anagrafiche e salvata cifrata in Impostazione `anagraficheApiKey`
  (+ `anagraficheUrl`); card dedicata in Impostazioni.
  SCOPERTA CHE HA CAMBIATO IL CODICE: nel registro **nessuno** dei 41 partner
  attivi ha un telefono proprio, ma 28 hanno un REFERENTE col numero. Il bottone
  "Scrivi" guarda prima l'insegna e poi i referenti: senza quel ripiego sarebbe
  spento per 37 partner su 41. Verificato sui dati veri: 41 righe, 38
  contattabili (27 WhatsApp + 11 email), 3 senza recapito; filtro FIORISTA → 11,
  ricerca "milano" → 22.

- SCRIPT — RISPOSTE RAPIDE CHE L'AI IMPARA (26/07/2026): tabella `Script`
  (titolo, categoria, testo, `quando` = quando usarlo, attivo, `usi`), pagina `/script`
  (`src/components/ScriptLista.tsx`) con CRUD, ricerca, copia e un BANCO DI PROVA
  ("Prova la risposta automatica": si incolla un messaggio e si vede cosa risponderebbe).
  `suggerisciRisposta()` in `src/lib/ai.ts` manda all'AI SOLO i nostri script (max 60, i
  più usati per primi) e le chiede quale usare + il testo adattato al cliente.
  API `POST /api/script/suggerisci` con `{messaggio}` oppure `{conversazioneId}` (in questo
  caso prende da sola l'ultimo messaggio IN ENTRATA della conversazione); lo script scelto
  incrementa `usi`, così i più usati salgono.
  PRINCIPIO (come per l'IBAN): l'AI propone, noi decidiamo. Lo `scriptId` restituito è
  validato contro l'elenco mandato — se l'AI inventa un id, la risposta viene scartata; e
  se nessuno script c'entra torna `null` invece di improvvisare.
  Nell'inbox: bottone **Risposta rapida** accanto a Invia — il testo finisce nel riquadro
  di scrittura, NON parte da solo, e un avviso dice da quale script arriva.
  Verificato con 3 script veri e l'AI vera: "ordine in ritardo" → Ritardo nella consegna
  (con il nome del cliente inserito), "mi serve la fattura" → Richiesta di fattura,
  "vendete macchine fotografiche usate?" → nessuno script, rifiutato correttamente.
  Dall'inbox su una conversazione widget: bottone → riquadro riempito + avviso, invio non
  automatico.
- CALENDARIO, VISTA "DA OGGI" (26/07/2026): `/calendario` apre sull'AGENDA che parte da
  oggi (`/api/ordini/calendario?giorni=60`), con "Oggi" evidenziato; la griglia del mese
  resta a un clic. Le date di consegna arrivano da Orders (campo `consegna`).
- AI = OPENAI (26/07/2026): `src/lib/ai.ts` usa la chiave OpenAI (Impostazione
  `openaiApiKey`, cifrata), con Anthropic come ripiego. Due modelli per motivo misurato:
  `gpt-4o-mini` per il testo, `gpt-4o` per le IMMAGINI — mini ha sbagliato un IBAN letto da
  foto (due zeri persi, beccato dal checksum), 4o l'ha letto giusto.

- Scaffold completo dell'app (Next 15 + Prisma, porta 3140, design system Deluxy).
- Schema dati: `Utente`, `Impostazione` (token cifrati AES-256-GCM), `Conversazione`
  (unica per canale+idEsterno), `Messaggio` (dedup su id Meta, stati di consegna).
- Webhook Meta unico (`/api/webhooks/meta`): verifica GET col verify token, firma
  X-Hub-Signature-256 con l'App Secret, ricezione WhatsApp/Messenger/Instagram,
  aggiornamenti di stato WhatsApp.
- Invio: WhatsApp Cloud API, Messenger e Instagram via `/me/messages` (src/lib/meta.ts).
- Inbox a due colonne con polling (elenco 5s, thread 4s), badge canale, non letti,
  stati di consegna e errori d'invio visibili in bolla.
- Widget: `public/widget.js` (bottone flottante + iframe) → pagina `/widget` (pubblica,
  frame-ancestors *), API pubbliche `/api/widget/sessione` e `/api/widget/messaggi`
  autenticate dal token di sessione del visitatore.
- Impostazioni: token canali (cifrati, "vuoto = non toccare"), verify token, App Secret,
  titolo/benvenuto widget, URL webhook e snippet pronti da copiare.
- Login (`/login`) e registrazione (`/registrati`) come pagine separate con link
  incrociati: il primo account registrato è l'amministratore (bootstrap), i successivi
  nascono operatori; middleware a sessione firmata.
- Tessera "Messaggi" nel catalogo del Hub (`deluxy-hub/src/lib/apps.ts`, icona nuova).

- Negozi Shopify MULTI-STORE: tabella `NegozioShopify` (credenziali cifrate), pagina
  `/negozi` (aggiungi/modifica/sospendi/elimina), `src/lib/negozi.ts`. Ogni negozio si
  autentica con token statico `shpat_` OPPURE Client ID+Secret (client credentials grant
  `POST {shop}/admin/oauth/access_token`, `src/lib/shopify.ts` `risolviToken`/`tokenDaClientCredentials`).
  Lo scarico ordini gira su tutti i negozi attivi e riporta l'esito per-negozio; ogni
  `Ordine` è legato al negozio (`negozioId`, unique `[negozioId, shopifyId]`).
  NB: il "Token di automazione dell'app" (`atkn_`) NON legge ordini — serve solo al deploy CI/CD.
- Ordini da Shopify: `src/lib/shopify.ts` (Admin GraphQL 2024-10, `X-Shopify-Access-Token`,
  ultimi 60 giorni), tabella `Ordine`, API `/api/ordini/sync` (scarica+upsert),
  `/api/ordini` (lista + se Google collegato), `/api/ordini/[id]/contatto` e
  `/api/ordini/contatti-tutti` (salva su Google), pagina `/ordini`. Dominio+token in
  Impostazioni (token cifrato).
- Google Contacts: OAuth server-side con refresh token (`src/lib/google.ts`), People API.
  Flusso `/api/google/connetti` → consenso Google → `/api/google/callback` (salva
  refresh token cifrato). `src/lib/contatti.ts` conia l'access token e salva con dedup
  per telefono. Client ID/Secret + redirect URI in Impostazioni. Scelta server-side (non
  il token-client del browser di anagrafiche) perché su Vercel i contatti vanno salvati
  anche senza operatore davanti. Verificato: il connetti reindirizza a accounts.google.com
  col client_id giusto (serve progetto Google Cloud reale per completare).
  NB: il redirect URI va messo negli **URI di reindirizzamento autorizzati**, non nelle
  Origini JavaScript (quelle rifiutano i percorsi) → errore `redirect_uri_mismatch`.
- LIVE su https://deluxy-messaging.vercel.app (progetto Vercel `deluxy-messaging`, team
  deluxy). Env di produzione: DATABASE_URL, DIRECT_URL, APP_SECRET (LO STESSO del locale,
  altrimenti i token cifrati nel DB condiviso non si aprono), APP_URL.
- Vista a colonne + bottone Fornitore (26/07/2026): `/ordini` alterna Colonne/Elenco; le
  colonne sono per negozio con conteggio e valore dell'intero filtro (groupBy). Bottone
  "Fornitore" = deep link `search-deluxy/?brand=&ordine=` (`linkRicercaFornitori`), brand
  per negozio da `brandRicercaDaNegozio()` (campo `brandRicerca` per l'override).
  Verificato: cakedesign.me/1730, deluxy.it/12650, deluxyflowers.com/2582.
- Clienti/rubrica (26/07/2026): `/clienti` + `/api/clienti`, ricavati dagli ordini
  raggruppando per telefono (fallback email) — nessuna tabella nuova. Verificato: 684
  clienti da 782 ordini.
- Archivio storico via Orders (26/07/2026): `src/lib/orders.ts` → `GET {ordersUrl}/api/v1/ordini`
  con header `x-api-key`. Chiave creata in deluxy-orders (`npm run chiave -- deluxy-messaggi`,
  sola lettura) e salvata cifrata in Impostazione `ordersApiKey` (+ `ordersUrl`). La ricerca
  in `/ordini` mostra la sezione "Archivio storico" con i risultati. Il brand di Orders viene
  tradotto per Ricerca fornitori ("Flowers" → "deluxyflowers.com").
- Email register.it, PIÙ CASELLE (26/07/2026): tabella `CasellaEmail` + pagina `/caselle`
  (schema/pagina gemelli di NegozioShopify//negozi). `src/lib/email.ts` lavora per casella.
  PARAMETRI UFFICIALI verificati su www.register.it/assistenza/parametri-email:
  IMAP `pop.securemail.pro:993` SSL, SMTP `authsmtp.securemail.pro:465` SSL, utente =
  indirizzo completo — host GENERICI, non del dominio cliente. (Prima avevo messo
  `imaps./smtps.register.it`: ERRATO. Attenzione: il DNS di questa rete risolve QUALSIASI
  nome a 10.147.17.27, quindi non è una verifica valida.) Porte/host modificabili; sulla
  587 `smtpSicuro=false` (STARTTLS). TLS con `rejectUnauthorized:false` (certificato
  intestato ad altro nome; connessione comunque cifrata).
  `/api/email/sync` gira su TUTTE le caselle attive con esito per casella; la risposta
  parte dalla casella che ha ricevuto (`Conversazione.casellaId`), altrimenti dalla
  predefinita. `/api/email/prova` prova SMTP **e** IMAP e legge dal DB (salvare prima).
  Campo `Messaggio.oggetto`. MANCA: allegati, HTML (solo testo), cartella Inviata sul
  server, cron di scarico, invio di una mail NUOVA (oggi solo risposte da thread).
- Link firmato Ricerca fornitori (26/07/2026): `src/lib/fornitori.ts` — POST
  `{searchUrl}/api/link` con `x-api-key: dlxs_…` e body `{quando: ISO}` torna
  `{url: …/?t=<code>}` valido ~5 min; ci aggiungiamo brand+ordine. Senza chiave ripiega
  sul link semplice `?brand=&ordine=` (verificato: `firmato: false`). Il bottone apre la
  scheda PRIMA della fetch, altrimenti il browser la blocca come popup.
- LAVORAZIONE ORDINI + MENU A SCOMPARSA (26/07/2026): `Ordine.gestione`
  (da_gestire | in_pagamento | comunicazione | gestito) + `gestioneIl`, con
  `src/lib/gestione.ts` per nomi e colori. NON confonderlo con `statoChiave` (pipeline di
  Orders): il sync non lo tocca. `POST /api/ordini/[id]/gestione` lo cambia; il filtro
  `gestione=aperti` (default in pagina) mostra solo i non gestiti.
  Pulsanti su card e tabella: Richiedi pagamento (→ `/pagamenti?ordine=&cliente=&importo=`,
  segna in_pagamento), Contatta cliente (wa.me se c'è il telefono, altrimenti mailto; segna
  comunicazione), Gestito ✓ / Riapri. I link si aprono in modo sincrono nel gestore del
  click, altrimenti il browser li blocca come popup.
  Menu a scomparsa: `ToggleSidebar` + `[data-sidebar-chiusa] .sidebar { margin-left:-232px }`
  + script nel `<head>` che riapplica la scelta da localStorage prima del paint.
  ⚠️ VERIFICA: col pannello del browser nascosto le TRANSIZIONI CSS non avanzano, quindi
  `margin-left`/`opacity` risultano fermi ai valori iniziali anche se la regola si applica
  (si vede da `pointer-events: none` che invece cambia). Misurare con
  `.sidebar { transition: none !important }`: così risulta 1033px → 1265px, corretto.
- INOLTRO A DELUXY PARTNER (26/07/2026): `src/lib/partner.ts` →
  `POST {partnerUrl}/api/richieste-pagamento`, header `X-API-Key` + `X-App: deluxy-messaging`,
  body {importo, beneficiario, iban, bic, causale, contatto, linkConversazione, riferimento,
  note}. Idempotente su (origine, riferimento) — vedi
  deluxy-partner/src/app/api/richieste-pagamento/route.ts. Campi nuovi su RichiestaPagamento:
  bic, contatto, linkConversazione, riferimento (unique), inviataIl, partnerId, partnerStato,
  esitoInvio. Partner RIFIUTA importo <= 0. Un invio fallito non annulla il salvataggio: si
  rimanda con `POST /api/pagamenti/[id]/invia`, e `GET` sulla stessa rotta aggiorna lo stato.
  Verificato con un finto Partner: header e body esattamente come da contratto.
  MANCA: chiave API vera di Partner in Impostazioni.
- RICHIEDI PAGAMENTO (26/07/2026): tabella `RichiestaPagamento` + pagina `/pagamenti`.
  `src/lib/iban.ts` verifica l'IBAN col checksum mod-97 (ISO 13616) + lunghezza per paese;
  `stringaPagamento()` compone la stringa pulita. `src/lib/ai.ts` estrae iban/intestatario/
  importo/causale con **Claude Opus 5** (`@anthropic-ai/sdk`, `output_config.format` con
  json_schema, immagini via blocco `image` base64), gestendo `stop_reason: "refusal"`.
  API `/api/pagamenti/estrai` (testo e/o immagine) e `/api/pagamenti` (GET/POST/DELETE).
  Chiave in Impostazione `anthropicApiKey` (cifrata).
  PRINCIPIO: l'AI propone, il checksum decide — un IBAN che non torna si salva ma resta
  "da controllare", non viene mai dato per buono. Verificato: cifra alterata → rifiutata,
  spazi → normalizzati, lunghezza IT sbagliata → rifiutata, DE valido → accettato.
  MANCA: prova reale dell'estrazione AI (serve una chiave Anthropic vera).
- Menu a SINISTRA (26/07/2026): `src/components/Sidebar.tsx` + `.layout/.sidebar/.main`
  copiati da deluxy-orders; la topbar tiene solo marchio e utente. Sotto 800px la sidebar
  diventa una riga orizzontale. Voci: Ordini/Calendario/Clienti · Inbox · Negozi/Caselle/
  Impostazioni.
- CALENDARIO ORDINI (26/07/2026): `/calendario` + `/api/ordini/calendario?mese=YYYY-MM`.
  Griglia del mese per DATA DI CONSEGNA, ogni ordine con il bordo del colore dello stato;
  legenda cliccabile per filtrare, filtro negozio, KPI consegne/valore.
  Campi nuovi su `Ordine`: `dataConsegna`, `fasciaConsegna`, `statoChiave`, `statoNome`,
  `statoColore` (da `consegna` e `classificazione.stato` di Orders + `GET /api/v1/stati`
  per i colori). Verificato: 610 ordini su 911 hanno una data di consegna, 876 hanno stato;
  luglio mostra 260 consegne per €47.539,98.
  NB: i campi nuovi NON si riempiono col sync incrementale — serve
  `POST /api/ordini/sync?completo=1` (rifà tutta la finestra di 60 giorni, dura minuti).
- FONTE ORDINI = DELUXY ORDERS (26/07/2026, non più Shopify diretto): `/api/ordini/sync`
  usa `scaricaOrdiniDaOrders()` (`GET {ordersUrl}/api/v1/ordini?da=&page=&limit=200`,
  `x-api-key`). INCREMENTALE: `da` = giorno dell'ordine più recente locale − 1 (primo giro
  fino a 60gg), altrimenti su Vercel si sfora il tetto di tempo. Dedup sul **gid Shopify**
  (`orderId` di Orders = il nostro `shopifyId`): i 782 ordini presi prima da Shopify si
  aggiornano, non si duplicano (verificato: 782→789→…→910 senza doppioni).
  Ogni brand di Orders → negozio in `NegozioShopify` (match su nome/dominio/brandRicerca,
  altrimenti creato). ATTENZIONE: `negozioNome` va scritto col nome del NEGOZIO, non col
  brand grezzo — Orders chiama lo stesso negozio ora "Flowers" ora "deluxyflowers.com" e si
  ottengono 6 nomi per 3 negozi (già corretto + riallineati i record vecchi).
  Le credenziali Shopify in /negozi non servono più (restano per storia).
  `src/lib/shopify.ts` non è più usato dal sync.
- Fornitore, link firmato VERIFICATO (26/07/2026) contro un finto `/api/link`: il backend
  fa POST con `x-api-key: dlxs_…` e body `{quando: ISO}`, poi al `url` restituito aggiunge
  brand e ordine → `…/?t=<code>&brand=deluxyflowers.com&ordine=2582` (numero senza #).
  La chiave non passa mai dal browser.
- Home = Ordini (26/07/2026): `/` mostra gli ordini, l'inbox è su `/inbox`, `/ordini`
  reindirizza a `/` (resta valido: è l'URL registrato come app su Shopify). Ordine in
  barra: Ordini, Clienti, Messaggi, Negozi, Caselle, Impostazioni.
- Grafica di Deluxy Orders importata (26/07/2026): stessi nomi di classe
  (`page-head/page-title/page-sub`, `kpi-riga/kpi`, `ricerca` a pillola con lente,
  `filtri` + `stato-pill`, `tabella-wrap` + `cella-*`, `tag`, `paginazione`, `vuoto`,
  `btn`) copiati da deluxy-orders/src/app/globals.css. Le regole di tabella sono confinate
  in `.tabella-wrap` per non toccare la `.tabella` preesistente. `/clienti` rifatta su quel
  modello (KPI, ordinamenti Più spesa/Più ordini/Più recenti/Nome — verificati).
- Ricerca ordini (25/07/2026): `/api/ordini` accetta `q` (numero, cliente, telefono con
  normalizzazione delle cifre, email, indirizzo, negozio), `negozio` e `contatto=si|no`;
  torna anche `totale` e l'elenco negozi. UI: barra con campo di ricerca (ritardo 300ms),
  due select e "Azzera"; lista tagliata a 200 con conteggio dei corrispondenti.
  Verificato su 782 ordini reali: nome→1, telefono con spazi→1, email→1, negozio→145,
  negozio+nome→4.
- Contatti automatici (25/07/2026): `src/lib/contatti.ts` → `salvaContattiOrdini()`, chiamata
  in coda a `/api/ordini/sync` (e da `/api/ordini/contatti-tutti`). Nome in rubrica
  `SIGLA Nome #ordine` (es. `FL Mario Rossi #1042`): sigla per negozio da
  `prefissoDaNegozio()` — flowers→FL, cake→CK, deluxy→DL, campo `prefisso` per l'override.
  Dedup per ultime 9 cifre del telefono: un contatto per persona, aggiornato col numero
  dell'ordine PIÙ RECENTE (`aggiornaContatto` = people.updateContact con etag rifresco).
  I contatti NON creati da noi non vengono mai rinominati (marcatore "Deluxy Messaggi" in
  biografia). Tetto di 40 clienti per giro (serverless): `rimasti` nel riepilogo.
  Verificato con le funzioni reali: FL/CK/DL corretti sui 3 negozi dell'utente.

## MANCA

Stato reale delle chiavi **al 28/07/2026**, letto dalla tabella `Impostazione` (solo
pieno/vuoto, mai i valori). **Configurate**: `metaVerifyToken`, `metaAppSecret`,
`waToken`, `waPhoneNumberId`, `searchApiKey`, `openaiApiKey`, `ordersApiKey`,
`anagraficheApiKey`, `googleRefreshToken`. **Mancanti**, con la conseguenza concreta:

| Cosa manca | Cosa non funziona finché manca |
|---|---|
| `fbPageToken` / `igToken`, e **nessuna riga in `/account-meta`** (0 pagine collegate) | Messenger e Instagram non ricevono e non rispondono. L'impianto multi-account c'è: mancano id e token. Con più pagine il token va messo **per pagina** — quello generale non basta. |
| Il numero WhatsApp collegato è **1**, ma va **ri-verificato lato Meta** | Il numero risultava `DISCONNECTED` con verifica `EXPIRED`: finché non si rifà `Fatti chiamare` → codice → PIN (o si fa da WhatsApp Manager), non arriva né parte niente. |
| `partnerApiKey` (chiave verifiche di deluxy-partner) | Le richieste di pagamento si salvano qui ma non arrivano a Partner (si rimandano poi con *Invia*). |
| `emailPassword` | Ora è **vuota** in tabella: la casella non manda finché non si reinserisce (la cifratura è a posto — verificato a parte). |
| `widgetTitolo` / `widgetMessaggio` | Il widget mostra i valori di riserva («Deluxy», «Ciao! Come possiamo aiutarti?»). Non è un guasto, ma sui siti dei singoli marchi conviene scriverli. |

Da fare, in ordine di utilità:

- **App Meta reale**: webhook registrato, token permanenti, pagina FB e account IG
  professionale collegati. Fuori dalla finestra di 24h Meta rifiuta i messaggi liberi:
  serviranno i **template WhatsApp**, non ancora gestiti.
  Costi (listino Meta 1/7/2026, per messaggio, Italia): Marketing €0,0658,
  Utility/Authentication €0,0248, Service (risposte entro 24h) **gratis**.
- **Script veri**: in tabella ce ne sono 3, creati solo per provare l'AI (ritardo
  consegna, fattura, cambio indirizzo). Vanno sostituiti con le risposte reali.
- **Rubrica Google**: restano ~594 clienti da salvare, 40 per giro orario → circa 15 ore
  per smaltirli da soli. Il redirect URI del progetto Google Cloud va messo fra gli "URI
  di reindirizzamento autorizzati" (non fra le origini JavaScript).
- Media in entrata (oggi mostrati come `[tipo]`) e allegati in uscita.
- **Assegnazione** delle conversazioni a una persona e notifiche push: chi ha fatto cosa
  ora *resta scritto* (ordini e messaggi in uscita), ma nessuno *prende in carico* una
  conversazione — due operatori possono ancora rispondere allo stesso cliente insieme.
- **Il widget non sa chi sta scrivendo**: nessun campo nome/email prima del primo
  messaggio, quindi le conversazioni dei siti non si agganciano né al cliente né
  all'ordine. È il pezzo che manca perché la scheda cliente le veda.
- Account `diagnostica@deluxy.local` (operatore, non creato in queste sessioni): da
  tenere o togliere — sono 3 utenti in tutto.
- Collegare un ordine alla conversazione WhatsApp dello stesso cliente (oggi sono due
  mondi separati: si contatta dall'ordine, ma la risposta non si aggancia all'ordine).

## Come riprendere

```bash
cd C:\Users\nicol\scoutwt\deluxy-messaging && npm install && npx prisma generate && npm run dev
```

Porta 3140. Senza `.env` con `DATABASE_URL` l'app non parte: vedi `.env.example`.
Il manuale funzionale completo è il **README.md** di questa cartella.

Prima di ogni commit, **entrambe**: `npx tsc --noEmit && npm run build`.
Su Windows, se `prisma generate` dà `EPERM … query_engine.dll`, ferma prima il dev
server: tiene il file bloccato.

Attenzione al database: è il **Postgres Supabase condiviso** con le altre app
(`?schema=messaging`). Mai `deleteMany` senza filtro per ripulire i test — cancella dati
veri (è già successo con la tabella `Utente`). Filtrare sui soli record creati dal test.
