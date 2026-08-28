# Il Libro UX&UI Deluxy

**Versione 1.6 — 28 agosto 2026** · *1.6: la riga di tabella si apre col click quando il record ha un dettaglio (§8).* · *1.1: il drawer di menu si apre sempre da sinistra (§2). 1.2: la zona filtri di un elenco — tetto di 2 righe a pannello chiuso, fasce a breakpoint, eccedenza dietro «Filtri (N)» (§8; giuria: architetto + ostile). 1.3: su mobile i gruppi di chip scorrono su UNA riga (decisione utente; §8 punto 9). 1.4: le notifiche in-app — toast + pallino giallo + numero, il sistema del Customer Service promosso a canone (§7). 1.5: il ritorno al punto esatto — «← Indietro» esplicito su ogni dettaglio, che ripristina filtri/pagina/scroll (§2).*

Il canone dei **pattern di interfaccia** di tutte le app Deluxy: menù, bottoni, form, tabelle, stati, feedback, conferme, finestre, mobile. D'ora in poi **ogni elemento di interfaccia, in ogni app esistente e nuova, si costruisce attingendo da qui** — non dal gusto del momento e non copiando un'altra app a caso.

**Autorità.** Il [Design System](DESIGN-SYSTEM.md) (v1.4) dà i materiali: token, componenti base, principi. Il Libro dice **come si compongono** e **quale implementazione fa da riferimento**. Su un pattern vince il Libro; su un token vince il DS. Se un caso non è coperto: si interpella l'agente **`architetto-ux`** (definito in `.claude/agents/architetto-ux.md`), che ricerca, decide e propone la voce nuova del Libro — mai inventare un pattern in un'app.

**Come è nato.** 27/08/2026: ricerca sui riferimenti mondiali (Apple HIG, Material 3, NN/g, WCAG 2.2, Polaris, Carbon, Pajamas, Primer) + analisi del codice di 10 app (Hub, Consegne/piattaforma, Finance, Anagrafiche, Ricerca fornitori, Tasks, Fondo, AI Mail, Scout; Maison è esclusa: app esterna base44, codice non nostro) + giuria di 3 agenti (operatività, coerenza Apple/Deluxy, mobile/accessibilità) + revisione ostile che ha demolito e corretto il verdetto prima della promulgazione. Ogni regola qui dentro cita la sua fonte o la sua misura.

---

## Le undici leggi

Le regole su cui **tutte** le fonti convergono e che nessun capitolo può contraddire:

1. **La label sta sopra il campo, sempre visibile.** Il placeholder non è una label.
2. **Una sola azione primaria per vista.** La distruttiva è rossa e mai a fuoco di default.
3. **Tab bar mobile: 3–5 voci**, icona + etichetta; il resto dietro «Menu».
4. **Bersagli touch ≥ 44px** (`--touch-min`). 24px è il minimo legale WCAG, mai l'obiettivo.
5. **L'errore sta presso il campo**: rosso + testo che dice come correggere, input conservato.
6. **Il colore da solo non comunica mai uno stato**: sempre colore + testo (o icona + testo).
7. **Conferma solo per l'irreversibile** — ma l'irreversibile **mai senza conferma**; dove si può, esegui + annulla.
8. **I successi passano, gli errori restano**: toast/nota per l'esito buono, banner persistente per il guasto.
9. **Un vuoto spiega e offre la strada; un fallimento non è MAI una lista vuota.**
10. **Caricamento a soglie**: sotto 1 s niente, 2–10 s testo sobrio/skeleton, oltre 10 s barra.
11. **Nella suite la coerenza è legge**: stessa entità = stesso nome, stessa icona, stesso colore in ogni app. Ogni divergenza non motivata è un bug; ogni divergenza motivata è **scritta nel README dell'app**.

---

## 1. Navigazione desktop

**La sidebar canonica** (DS §3 Navigazione): 250px, vetro chiaro (blur 24 saturate 180%), sezioni con etichetta MAIUSCOLA, voce = icona SVG stroke 1.7/19px + label 13.5px, attiva = `fill-active` + peso 600 + icona oro + **`aria-current="page"`**, in basso avatar con iniziali su `gold-soft` + nome + ruolo + logout a icona.

- **Riferimento: AI Mail** (`scoutwt/deluxy-mail`, `components/Sidebar.tsx` + `VoceMenu.tsx`): è l'unica con la voce attiva *vera* (confronto esatto di rotta, motivato nel codice) e i badge di conteggio per voce. I suoi buchi noti sono obblighi, non modelli: le voci con query (Archivio, Spam, Sezioni) devono accendersi; le icone previste dal CSS vanno montate; il logout diventa icona.
- Per il **drawer mobile** e il **logout a icona** il riferimento è `deluxy-search-supplier/index.html` (righe 366–376, 420–438). Attenzione al suo difetto: due voci `data-scroll` che puntano alla stessa vista — **lo stato attivo indica una vista, mai una posizione di scroll**.
- **La voce attiva è obbligatoria ovunque.** Due segnali visivi (sfondo + peso) + `aria-current` (WCAG 1.4.1). Un CSS `.attivo` scritto e mai applicato (Fondo) è codice morto che inganna.
- **Sidebar collassata**: può ridursi a sole icone, ma **logout e logo non spariscono mai** (oggi in piattaforma spariscono).
- **La sidebar può essere anche il filtro** (Anagrafiche: voci → `/?stato=…` con conteggi): pattern promosso, purché i conteggi arrivino da una query sola.
- **Sidebar montata UNA volta nel layout**, voce attiva calcolata dal componente (`usePathname`), mai passata a mano da ogni pagina.

**La topbar** è ammessa **solo con ≤ 3 destinazioni** (Hub, Tasks), con tre obblighi: voce attiva a due segnali + `aria-current`; **utente + logout sempre visibili** (nelle app con autenticazione — Fondo non ne ha: deroga da annotare); comportamento dichiarato sotto la soglia mobile (wrap o collasso, mai overflow). Fondo ha 8 voci: o le raggruppa o passa a sidebar. La gerarchia visiva non si inverte: «Esci» non può pesare più del resto della barra (Hub oggi).

## 2. Navigazione mobile

- **App a uso mobile primario** (Scout; la piattaforma lato valet): **tab bar in basso, 3–5 voci** (HIG e Material 3 identici), icona + etichetta sempre, item ≥ 48px, indicatore attivo a due segnali. Le 4 destinazioni quotidiane in barra; la quinta è **«Menu»** e apre il drawer con tutto il resto. Riferimento: `scoutwt/deluxy-scout/components/BarraMobile.tsx` (in flusso, non absolute: i FAB non ci finiscono sotto).
- **App desktop-first consultate da telefono**: drawer off-canvas con topbar vetro 56px (hamburger + logo + titolo), scrim `--scrim`, chiusura al tap fuori e a ogni navigazione. Riferimenti: `search-supplier` e `deluxy-platform-next/web` (shell).
- **Il drawer di menu si apre sempre da SINISTRA** (deciso dall'utente il 28/08/2026, su segnalazione del Hub che scivolava da destra): il drawer è la sidebar che su mobile si nasconde, e la sidebar sta a sinistra — il lato non cambia col viewport. Pannello `left:0`, chiuso `translateX(-100%)`, bordo `border-right`. Vale per ogni app; i pannelli non-di-menu (dettagli, carrelli) non sono coperti da questa regola.
- **Le tab sono destinazioni, mai azioni**; `backBehavior="history"` (il back torna dove eri, non alla home).
- **Il ritorno al punto esatto** *(v1.5, 28/08/2026 — regola dell'utente)*: ogni vista di dettaglio raggiunta da un elenco ha un **bottone «← Indietro» esplicito e visibile in alto** (il back del browser non basta come unico gesto), e tornare indietro riporta **alla STESSA vista di prima: stessi filtri, stessa pagina, stesso scroll** — mai all'elenco azzerato. Le due gambe della regola: (a) lo stato dell'elenco vive **nell'URL** (già canone §8: querystring + debounce), così la history lo conserva da sola; (b) il bottone usa la **history** quando si arriva da dentro l'app (`history.back()`, che ripristina querystring e scroll) e ripiega sul link all'elenco solo arrivando da fuori (link diretto, refresh). Un «← Torna a X» cablato sull'URL nudo dell'elenco è FUORI canone: butta i filtri di chi l'aveva filtrato. Web: componente `TornaIndietro` (client, `history.length > 1 → back()`, altrimenti `push(fallback)`); RN/Expo: `router.back()` (lo stack conserva lo stato della schermata precedente); Angular: `Location.back()` con lo stesso ripiego. L'etichetta dice DOVE si torna quando il ripiego è attivo («← Ordini»), o un semplice «← Indietro» quando è la history a decidere.
- **Soglia unica largo/stretto: 900px**, dichiarata come **costante documentata in UN punto per app** (i breakpoint non sono tokenizzabili in CSS puro). Le app nuove nascono a 900. **Deroga annotata**: la piattaforma consegne resta a 800 (soglia tarata in 6 punti coordinati con la trasformazione tabelle→schede) finché non migra in un colpo solo e verificato — il divieto vero è avere N copie del numero, non il numero.
- ⚠️ **Un hamburger che non mostra nulla è un guasto bloccante**: la navigazione mobile deve ESISTERE (oggi Anagrafiche a 375px non ne ha una — P0).
- Lo swipe-da-bordo del drawer si disattiva sulle schermate a gesto pieno (mappa).

## 3. Bottoni e azioni

**API unica delle classi** (riferimenti: Finance `globals.css:176-191`, Mail `globals.css:211-226`):

| Classe | Aspetto | Regola |
|---|---|---|
| `.btn` (nuda) | pillola su `fill`, testo `text` | **la classe nuda è l'aspetto meno enfatico**: un bottone dimenticato degrada in innocuo, mai in primario |
| `.btn.primary` | `ink` / `on-ink`, hover `ink-hover` | una sola per vista |
| `.btn.secondary` | = nuda (alias esplicito) | |
| `.btn.danger` | testo `red` su `fill` | il rosso pieno solo sul passo di conferma, col verbo |
| `.btn.gold` | `gold` / `on-ink` | solo momenti di brand/marketing, mai operatività |
| `.btn.small` | 5×13, 12.5px | modificatore |

- Sempre pillola (`radius-pill`), padding 8×18, `:active scale(0.97)`, `:disabled opacity 0.55`, **`:focus-visible` sempre presente** (mai `outline: none` senza sostituto — WCAG 2.4.7), `min-height: var(--touch-min)` su `pointer: coarse`.
- **Azione di riga nelle tabelle**: pillola outline piccola (la `.act` della piattaforma), **massimo 2 visibili** + il resto in menu «⋯» a fine riga (NN/g, Carbon). La variante distruttiva: stessa forma, testo `red`. **Il link sottolineato non è mai un'azione**: la sottolineatura promette navigazione («Elimina» come link è un inganno semantico, e 12px sottolineati non sono un bersaglio).
- Etichette = **verbo dell'azione**, mai «OK/Sì/No» (NN/g).
- Nei dialoghi: primaria a **destra**, «Annulla» alla sua sinistra (HIG); la distruttiva mai a fuoco di default.
- Mai togliere azioni per far spazio: si stringono o vanno in overflow «⋯» (regola di casa + HIG Toolbars).
- Scorciatoia stampata sul bottone (`<kbd>` a opacità 0.6, nascosta su `hover: none`): pattern promosso da Mail.

## 4. Form

- **Label**: sopra il campo, **12.5px / 500 / sentence case** / `text-secondary`, una sola classe nel layer condiviso. Il token `label` (11px MAIUSCOLO) è per le sezioni, **non** per i campi. Struttura consigliata: `<label class="campo"><span>Etichetta</span><input/></label>` (Hub) — associazione garantita senza id/for.
- **Obbligatori**: `*` **rosso** a inizio o fine label (NN/g Required Fields; l'oro non marca obblighi: è sotto contrasto ed è l'accento brand).
- **Campi**: `surface` + bordo `hairline-strong` + `radius-m`; **focus = bordo `gold` + anello `0 0 0 4px gold-soft`** — su OGNI campo, ricerca compresa. Un focus che "si sbianca" o un `outline:none` senza sostituto è una violazione (WCAG 2.4.7), non uno stile.
- **Errori — la legge**: l'errore compare **presso il campo che l'ha causato**, in `red` + testo che dice come correggere, e **l'input non si perde mai**. `alert()`, popup bloccanti e il banner-unico-in-cima come SOLA segnalazione sono vietati.
  - *Con layer client* (Mail, Scout, piattaforma): validazione al blur (non mentre si digita), messaggio sotto il campo.
  - *Senza JS client* (RSC puro: Hub, Fondo): si soddisfa col **re-render server post-submit** — errori renderizzati sotto i campi colpevoli e `defaultValue` che conserva quanto digitato. Il difetto vero di oggi non è l'assenza del blur: è il redirect che butta via l'input.
  - *Form lunghi* (> ~8 campi): in aggiunta, riepilogo errori in cima con link ai campi + scroll al primo (WCAG 3.3.1).
- **Form lunghi**: sopra gli 8 campi, **sezioni con titolo** (riferimento: Anagrafiche `partner/nuovo` col componente `<Campo>`; piattaforma `block-head`). Se la CTA cade oltre una viewport: **barra azioni sticky** (su mobile fissa in basso con `env(safe-area-inset-bottom)`).
- **CTA**: in fondo a destra, ordine `[Annulla secondario] [Verbo primario]`; disabilitata finché manca l'essenziale; il testo diventa «Salvataggio…» durante l'invio; full-width solo nei form stretti.
- **Salvataggio**: **Salva esplicito** per i form; autosave **solo** per toggle/impostazioni immediate; **mai i due modi nello stesso form** (Pajamas, Primer). Il Salva esplicito è anche ciò che alimenta la coda offline (cap. 6).
- **Aiuto**: `testo-guida` sotto i campi difficili (13.5px `text-secondary`) — pattern promosso da Anagrafiche. I vincoli si scrivono lì o nella label («min 8 caratteri»), non solo nella validazione.
- Riserva di spazio per il messaggio (`min-height`): il layout non salta quando compare l'errore.
- Su mobile: `font-size ≥ 16px` sugli input (anti-zoom iOS), `keyboardType`/`inputmode` giusti (`decimal-pad` per gli importi — non `numeric`), `autoComplete`/`textContentType` sul login (i gestori di password devono funzionare).

## 5. Colori di stato e badge

**La formula del badge** (DS §3, riferimenti: Finance `globals.css:161-173`, Mail `globals.css:196-208`, e la `.stato-pill` di search-supplier come implementazione con dot):

> pillola + **dot** (`background: currentColor`) + **tinta `-soft`** di sfondo + **testo semantico pieno**. Sempre tutti e tre. Il solo-dot su sfondo neutro e la tinta-senza-dot sono le due metà sbagliate della stessa regola.

- **Il colore mai da solo** (WCAG 1.4.1): dove il contesto sparisce (schede mobile senza intestazioni, pin su mappa), il colore **si porta il nome dello stato** (pattern `.st-testo` della piattaforma).
- **La mappa stato→colore vive in UN modulo dati per app**, tipizzato, con etichetta e colore in coppia, fallback su neutro, e **ogni scelta cromatica motivata in commento**. Riferimento: `scoutwt/deluxy-anagrafiche/src/lib/stati.ts` (5 dimensioni documentate) e `deluxy-tasks/src/lib/stati.ts`. Mai N copie: le 5 copie divergenti della piattaforma (la stessa consegna rossa in lista e grigia in mappa) sono il controesempio storico.
- **Semantica dei colori di stato**: `red` = richiede intervento **adesso** · `orange` = attende un'azione (nostra o altrui) · `blue` = in lavorazione, nessuna attesa · `purple` = fase speciale (in consegna) · `green` = concluso bene · `grey`/neutro = terminato/inerte (annullata, archiviata, bozza).
- **L'ORO NON È MAI UNO STATO** (né una validazione). Sostituzioni: «richiesto/aperto/pending» → `orange`; «in corso/in trattativa» → `blue`. L'anello oro «partner» di search-supplier resta: è identità, non uno stato di processo.
- **Deroga annotata — legenda storica consegne** (piattaforma): chi smista consegne da anni legge `created` = **rosso** («da lavorare adesso») e la memoria operativa vale più dell'eleganza tassonomica. La legenda storica resta canonica per il SOLO dominio stati-consegna della piattaforma, a tre condizioni: (1) mappa unica tipizzata (le copie si estinguono); (2) valori solo da token — il giallo diventa `--amber`, tokenizzato apposta e **sempre accompagnato dal testo** (con testo presente, WCAG 1.4.1 è soddisfatto); (3) la semantica del rosso è quella scritta sopra, e vale per `created`, `not_delivered`, `not_accepted` perché tutti e tre **chiedono intervento adesso** — chi toccherà questi colori senza una migrazione governata reintroduce gli errori di smistamento. *(Verdetto 2–1; il giurato della coerenza avrebbe migrato alla mappa DS: dissenso registrato.)* Ogni dominio NUOVO usa la mappa DS.
- **Categorie ≠ stati**: la provenienza (da quale app arriva una task), gli interessi, le tipologie **non** usano i semantici (leggere «pericolo» dove c'è «viene da Anagrafiche» è un falso allarme). Finché il DS non ha una palette categoriale dedicata, le categorie si rendono **neutre** (testo + `fill`) o con l'icona: mai con red/orange/green/purple.
- La priorità (P0–P3) ha la sua mappa centralizzata (riferimento: Mail `lib/format.ts:45-48`): P0 red, P1 orange, P2 blue, P3 neutro.

## 6. Stati delle viste

Ogni vista dati implementa **quattro stati** — e le app da campo **cinque**:

1. **Loading** — obbligatorio su ogni rotta dati (`loading.tsx` / `Suspense` / skeleton). Soglie NN/g: < 1 s niente; 2–10 s testo sobrio («Caricamento…») o skeleton; > 10 s barra con avanzamento. Il bottone che ha innescato l'azione si disabilita e cambia testo («Salvataggio…»): il doppio invio è un bug. Promosso il **loading narrativo a passi** di search-supplier («Cerco l'indirizzo… Calcolo le distanze stradali…») per i processi multi-fase.
2. **Empty** — icona in quadratino `gold-soft` 44px + titolo `title-m` + frase **che insegna** (cosa entra qui, come ce lo si mette) + **azione** (riferimento forma: Finance `.empty`; riferimento testi: Scout `EmptyState`, «il vuoto dei Lead è diverso dal vuoto generico perché il consiglio giusto è diverso»). **Tre vuoti distinti**, mai la stessa schermata: primo uso (CTA «Crea il primo…») · zero risultati di filtro (CTA «Azzera i filtri», + il conteggio «0 di N» già visibile) · errore (vedi sotto).
3. **Errore** — card `red-soft` + bordo rosso 15% (forma: Fondo `Avviso grave`) + **azione di ripresa** («Riprova») + via di fuga (contenuto: Mail `error.tsx`). **LEGGE: un fallimento non è mai una lista vuota.** Ogni fetch senza ramo d'errore è un bug (già costato tre segnalazioni per un guasto solo). Mai messaggi da sviluppatore all'utente («Imposta DATABASE_URL…»).
4. **Dati** — la tabella/lista.
5. **Offline** (app da campo: Scout, piattaforma lato valet) — **indicatore globale di rete sempre visibile** + coda di sincronizzazione **raggiungibile dalla home** («N in coda», pillola arancione con dot). La coda canonica è `scoutwt/deluxy-scout/lib/syncQueue.ts` (non perde, non duplica, autoflush, backoff, mai retry sull'ultimo passo non idempotente): quel motore senza la spia è un airbag senza l'indicatore della benzina.

Componente unico consigliato per i primi tre stati (una card, cambia icona/tono): pattern Mail. La sequenza nei template è sempre la stessa: `loading → errore → vuoto → dati`.

**Avvertenze sul dato** (non errori di sistema): componente «Avviso» oro=cautela / rosso=grave (promosso da Fondo — «Come NON leggere questa pagina»); e ogni metrica aggregata **dichiara la propria copertura** («su X% dei dati previsti») o si rifiuta di mostrare il numero.

## 7. Feedback e conferme

**Tre canali, tre ruoli** (mai confusi):

| Canale | Quando | Riferimento |
|---|---|---|
| **Nota contestuale** accanto al bottone, verde, auto-dismiss ~4 s | esito di un'azione il cui bersaglio resta in vista | Tasks `.nota-ok` |
| **Flash** in alto al centro, 4 s, `role="status"`, sopravvive alla navigazione | esito di un'azione che attraversa un cambio di vista | Mail `Flash.tsx` (il tono è un parametro OBBLIGATORIO: un fallimento non può uscire verde «per costruzione») |
| **Avvisi (toast) in basso a destra** | ciò che succede *intorno* (nuovo messaggio, nuovo ordine) — mai esiti di azioni tue | DS §Avvisi (v1.1); implementazione: Customer Service `Novita.tsx` |

**Le NOTIFICHE IN-APP — il sistema canonico** *(v1.4, 28/08/2026 — promosso dall'utente: «il sistema del Customer Service è eccezionale, implementalo per tutte le app»)*. Tre segnali, tre significati, MAI confusi (riferimento: CS `Sidebar.tsx` + `lib/pallini.ts` + `api/novita/sezioni`):

1. **Il toast in basso a destra** = *è appena successo* (arrivi dall'esterno; sparisce in ~9 s; poll leggero ~25 s).
2. **Il pallino giallo sulla voce di nav** (`--gold`, 8px, in FONDO alla riga — mai davanti al nome, o le voci ballano) = *è arrivato qualcosa da quando HAI guardato*: resta acceso finché non entri nella sezione. È un segnalibro personale.
3. **Il numero sulla voce** (`sb-quanti`, con variante `urgente`) = *quanto lavoro c'è*. Numero e pallino coesistono perché dicono cose diverse: venti pratiche ferme da ieri = numero senza pallino; una novità già presa da un collega = pallino senza numero.

Le regole che rendono il sistema onesto:
- **Mai confrontare orologi**: il server dichiara la data della cosa più recente per sezione; il client ricorda in `localStorage` l'ultima GIÀ VISTA e accende il pallino se le due differiscono. Mai `Date.now()` del browser come «visto» (un orologio avanti = pallino sempre acceso; indietro = mai).
- «L'ho guardato io» è un fatto del browser di quella persona, **non dell'azienda**: niente tabella server per il visto.
- **Budget del poll**: il giro pesante (date+conteggi per sezione) ogni ~90 s + a ogni cambio pagina + al ritorno della scheda; **mai con la scheda nascosta** (`document.hidden`). L'immediatezza è del toast, non del pallino.
- **Il poller è la sentinella della sessione**: gira su ogni pagina, quindi è LUI che si accorge della sessione scaduta (redirect al login seguito da `fetch` = 200 con HTML: si controllano `res.redirected` e il content-type) e mostra la fascia di riaccesso.
- La regola di accensione vive in **una funzione pura con le sue prove** (`lib/pallini.ts`), mai sparsa nel componente.
- Rete assente o storage bloccato → **muti, mai tutti accesi**.

**Gli errori non passano MAI da un toast**: banner/card persistente presso il contesto, finché non è risolto (Polaris). Anche l'attuale «toast errore 9 s» di Mail migra a banner.

**Conferme distruttive** — il canone è la **conferma narrativa**: in linea o in finestra, con
- il **NOME dell'oggetto** («Elimino "Ordini"?» — mai «Sei sicuro?»),
- le **CONSEGUENZE** («Rimuovo 143 messaggi: si perdono riassunti, attività, bozze»; «"X" verrà archiviata dentro "Y": referenti e sedi si spostano lì»),
- il bottone **rosso col verbo**.
Riferimenti: Mail `EliminaSezione`/`SvuotaCestino`, Anagrafiche `Riconcilia`. Per le distruzioni ad altissimo impatto: digitare il nome dell'oggetto (NN/g).

- `window.confirm()` è **vietato nel codice nuovo** e nelle app in restyling. I 16 esistenti (molti già tradotti e col nome dell'oggetto) migrano opportunisticamente: proteggono comunque — la priorità assoluta è dove la conferma **non c'è**:
  - **P0**: Finance (8 eliminazioni a click nudo, incluso «Svuota non registrate» in blocco), Hub (elimina utente = 1 click = `delete`), Tasks («Archivia» senza conferma E senza vista di ritorno: serve l'archivio o l'undo).
- **Su mobile nativo (RN)**: l'Alert di sistema è il canone per **decisioni e conferme** (via `lib/dialoghi.tsx` di Scout: una firma, Alert nativo su device, modale DS su web; etichette col verbo). **I successi non sono mai popup bloccanti** (oggi `avvisa()` ×148 in Scout: 148 tap al giorno per chiudere conferme di cose già riuscite → nota/toast).
- **Prevenire batte confermare**: l'**avviso preventivo** scrive la conseguenza PRIMA del click («rigenerarla manda in pensione la chiave di prima» — Tasks) e l'**esito sul bersaglio** la scrive SUL bottone («Chiuso → lo porta a CLIENTE» — Scout `EsitoButtons`, che con i suoi 64px è anche il miglior bersaglio del parco). Quando un'azione cambia stato altrove, la conseguenza sta sul bersaglio, non in un tooltip.
- L'azione che crea una **regola permanente** si sottodimensiona apposta (link discreto che si accende solo all'hover — Mail `.archivia-def`).
- Il messaggio di esito vive nel layout, non nell'URL: se viaggia in querystring (pattern PRG, legittimo in RSC), un refresh non deve riproporre «Utente eliminato».

## 8. Tabelle, liste e filtri

**La tabella canonica** (riferimento: piattaforma `styles.css:243-291`, «il vestito canonico… UNA volta per tutte» + Mail che la replica):
- dentro card `tight` con wrapper `overflow: auto` e **`max-height` obbligatoria** (⚠️ senza, le intestazioni sticky non si fermano mai: misurato, th a top −66);
- `th` **12px / 500 / `text-tertiary` / sentence case / sticky** — il MAIUSCOLO urlato è abolito;
- hover riga `rgba(120,120,128,0.05)`; divisori hairline; ultima riga senza bordo;
- numeri a destra con `tabular-nums` (`.num`); testo a sinistra;
- **ordinamento** dal click sull'intestazione con freccia di direzione, **preservando i filtri** (componente riferimento: Finance `ThSort.tsx`);
- **paginazione** obbligatoria sopra le ~100 righe (riferimento: Anagrafiche, 50/pagina); un `take` senza paginazione né conteggio è una lista che mente;
- riga cliccabile: `tabindex` + Enter + `focus-visible` oro; azioni di riga col cap. 3.

**Celle vuote — la tripletta** (con `aria-label` sul trattino: molti screen reader lo saltano):
- `—` = **non applicabile** (non ha senso qui);
- «non disponibile» (testo esplicito) = il dato esiste al mondo ma non l'abbiamo;
- **`cella-manca`** (arancione corsivo, da Anagrafiche) = **dovrebbe esserci e non c'è**: una coda di lavoro visibile, non un buco silenzioso.

**La riga si apre col click** *(v1.6, 28/08/2026 — regola dell'utente)*: quando un record della tabella HA una vista di dettaglio, **il click in un punto qualsiasi della riga la apre** — non solo un piccolo link sul nome. Le app dove la riga già naviga restano come sono. Le guardie: **le azioni dentro la riga non fanno partire la navigazione** (`stopPropagation` sul contenitore azioni, o il click-riga controlla `closest('a,button,input,select,label')`); la riga cliccabile **si dichiara** (cursor pointer + hover `--fill`); resta un **link vero da tastiera** (il nome resta `<a>`, o la riga ha `role="link"` + Enter); su mobile vale la SCHEDA intera. Un record senza dettaglio non finge: nessun pointer, nessun hover da link. Insieme alla v1.5, il giro completo è: click sulla riga → dettaglio → «← Indietro» → stessa vista di prima.

**Mobile — la tabella non si strizza**: sotto la soglia, **diventa schede**. Web: utility `tabelle-a-schede` della piattaforma (etichette lette dai `th` già tradotti → `data-label`, MutationObserver; 27 liste sistemate senza toccare una pagina — da estrarre nel layer condiviso). React Native: la tabella **non si monta**, si montano le card (`Scout/Tabella.tsx` + `CardElenco`). Lo scroll orizzontale come UNICA risposta mobile è vietato. Sulla scheda, il pallino di stato si porta il nome (cap. 5).

**Filtri — la ZONA FILTRI di un elenco** *(v1.2, 28/08/2026 — segnalazione utente su Scout/Ordini: 4 gruppi di pillole sempre aperti ≈ 300-330px a 375px, il 37-40% della viewport. Proposta dell'architetto passata dalla revisione ostile: 4 punti confermati, 6 corretti — le correzioni sono incorporate qui.)*

Vale per web e React Native. La regola madre è un **numero falsificabile**:

1. **Tetto a pannello chiuso: 2 righe (~70-90px), contando il wrap REALE** (non le righe «logiche»: la trappola di Ordini era proprio lì). **Misura di collaudo: a 375×812 la prima riga dell'elenco compare nella prima schermata.** Una zona filtri che sfora il tetto è un bug, non uno stile.
2. **Cosa resta visibile: fasce a breakpoint dichiarate**, mai «ciò che non wrappa» (misura runtime che in CSS-only non esiste e in RN è fragile). Sotto la soglia mobile: ricerca (se c'è) + bottone **«Filtri (N)»** + «Azzera» (solo con N>0); la **dimensione primaria** resta fuori solo se è un segmented compatto ≤3 valori corti. Dalla soglia in su: anche la dimensione primaria (UNA sola per elenco, ≤5 valori mutuamente esclusivi, con «Tutti»); su desktop largo anche select compatti — **finché tutto sta nel tetto**.
3. **Il pannello contiene l'ECCEDENZA rispetto al tetto**, chiuso di default; se a quel breakpoint l'eccedenza è vuota (es. Anagrafiche desktop: 6 select in una riga da ~50px), il pannello non c'è e i filtri restano in barra. In RN i gruppi a chip sono alti per natura → di fatto quasi tutto sta nel pannello (`PannelloFiltri`, chiuso di default su ogni viewport — scelta utente già in codice).
4. **Singola o multipla**: valori esclusivi per natura (stato del flusso, periodo, aperto/chiuso) → **singola** con «Tutti»; valori combinabili o numerosi (linea, città, account, tag) → **multipla in OR** con spunta (`GruppoFiltro`). Il wrap dentro il pannello regge fino a ~15-20 valori; la ricerca interna al gruppo è raccomandata solo quando un caso reale la richiede (oggi in Scout nessuno).
5. **Si capisce sempre perché la lista è ridotta**: conteggio (N) sul bottone + **«N di M · filtro attivo» sopra la lista** (`ContoRighe` — UNA fonte sola, mai due conteggi della stessa cosa). I **chip rimovibili** dei filtri attivi a pannello chiuso vivono **solo dalla soglia in su** (tetto una riga + coda «+N»): su mobile ricreerebbero l'impilamento che questa regola abolisce (misurato: a 375px un solo chip sta nei ~150px residui). Il vuoto da filtro resta il vuoto n. 2 del cap. 6 («0 di N» + «Azzera i filtri»).
6. **L'ordinamento NON è un filtro**: fuori dal conteggio (N), mai dentro il numero. Su desktop vive nei `th` (`ThSort`); su mobile, dove la tabella diventa schede e i `th` spariscono, un controllo «Ordina» dichiarato nella riga sempre-visibile (o nel pannello, ma escluso da N).
7. **Applicazione interattiva dove c'è JS client** (canone Tasks: stato nell'URL, debounce ~300 ms, `router.replace`); nelle pagine server-rendered a form GET il bottone **«Filtra» resta legittimo**, con «Azzera» come **link alla rotta nuda** (canone Finance). In RN lo stato è di schermata (nessun URL nativo).
8. **Collasso web sotto la soglia**: disclosure accessibile — un client component con bottone `aria-expanded` («Filtri (N)») o `<details>/<summary>` nativo; **mai il checkbox-hack** (fallisce tastiera e screen reader). Dalla soglia in su i campi sono sempre visibili e il bottone sparisce.
9. **Sotto la soglia mobile un gruppo di chip sta su UNA riga e SCORRE in orizzontale** *(v1.3, deciso dall'utente il 28/08/2026 con screenshot: il wrap faceva crescere la zona in verticale)*; dalla soglia in su i chip **vanno a capo** come prima. Due guardie, che sono il motivo del vecchio divieto: **(a)** niente tagli netti — l'ultima chip visibile deve poter «sbucare» dal bordo (mai un contenitore largo esattamente come le chip), lo scroll indicator si nasconde; **(b)** nella corsia che scorre stanno SOLO chip di filtro — «Filtri (N)», «Azzera» e ogni azione restano FUORI, sempre visibili. Lo scroll orizzontale resta vietato come unica risposta mobile per le TABELLE (che diventano schede). Riferimento RN: `Scout/components/ui.tsx` (`RigaChips`); web: utility `.riga-chips-scorri` (nowrap + `overflow-x:auto` + scrollbar nascosta **+ `> * { flex: 0 0 auto }`** — senza quest'ultima le chip si stringono col flex-shrink invece di sfilare, e la corsia non scorre mai).
10. Restano ferme: chip `<button>` ≥44px; «Azzera tutto» a un tap; le **viste salvate** della piattaforma si integrano sopra questo pacchetto.

**Riferimenti d'implementazione**: RN — Scout `PannelloFiltri.tsx` (bottone «Filtri (N)» + Azzera, chiuso di default) composto come `[riga primaria] + [PannelloFiltri con l'eccedenza]`, `GruppoFiltro` dentro; web con JS — Tasks `components/Filtri.tsx` (riga unica, select-travestito-da-chip, URL+debounce) e piattaforma `deliveries-list` (segmented `quick-tabs` su `--surface-sunken`, media query `flex:1 1 140px`); web server-rendered — il collasso disclosure alla prima app che lo monta (Anagrafiche) diventa riferimento.

## 9. Finestre (modali e fogli)

**Canone web** (riferimento: sistema Mail, `globals.css:1014-1107`):
- scrim `--scrim` (un valore solo — oggi ne circolano tre), pannello `surface` + `radius-l` + **`shadow-float`**, max ~560px, max-height con **scroll dentro il contenitore** (mai nei figli: la cicatrice di Scout — 4 fogli su 11 col Salva fuori schermo — dice perché questa responsabilità si centralizza);
- **titolo sticky con la ✕ sempre visibile** (in un dialogo lungo, la chiusura non finisce mai sotto la piega);
- **tre vie di chiusura**: ✕, click sullo scrim, **Esc** (con stack: chiude prima il figlio poi il padre);
- `role="dialog"` + `aria-modal` + **focus trap** + ritorno del focus al trigger (ARIA APG — oggi 0 modali su 10 app lo fanno: obbligo del Libro);
- **su mobile diventa foglio dal basso** (radius solo in alto, `padding-bottom` con safe-area);
- `bloccaSfondo` quando c'è un form a metà (niente chiusura accidentale col tap fuori).

**Canone React Native**: `Foglio.tsx` di Scout (bottom sheet < 700, finestra centrata ≥ 700) + da aggiungere: handle di trascinamento e `env(safe-area-inset-bottom)`. Mai ScrollView annidate sullo stesso asse.

**Quando NON serve una finestra** — l'inline resta legittimo, col criterio:
- modifica **reversibile di UN campo/oggetto nel suo contesto** → inline (la pillola di stato modificabile con `useOptimistic` e rollback — Anagrafiche `MenuStato`, piattaforma `status-select` — è il pattern più efficiente del parco; il dropdown si riposiziona `fixed` per non farsi ritagliare dallo scroll della tabella);
- creazione **multi-campo**, flusso bloccante o **azione distruttiva** → finestra/foglio col canone sopra.
Il `<details>`-dentro-la-cella di Hub (form di 6 controlli che dilata la riga, senza Esc né overlay) non è un pattern: migra.

Il segreto mostrato una volta sola (chiave API generata) vive in una card **col bordo oro**, deliberatamente ingombrante, con «Copia» e «Ho finito» (Tasks/Anagrafiche).

## 10. Mobile — regole trasversali

1. **Bersagli ≥ `--touch-min` (44px)** su `pointer: coarse` per bottoni, voci, chip, azioni di riga (HIG 44pt / Material 48dp). Il trucco canonico per non muovere un pixel: `padding` positivo + `margin` negativo (piattaforma). Su desktop mouse ≥ 32px.
2. **Input ≥ 16px** sotto la soglia (anti-zoom iOS — due post-mortem indipendenti nel parco; occhio alla specificità nelle media query: vanno ribattuti i selettori con nome).
3. **Safe-area**: `viewportFit: 'cover'` + `env(safe-area-inset-*)` su ogni barra fissa in basso (senza il primo, il secondo vale zero).
4. **`(hover: none)` / `(pointer: coarse)`**: nascondere le affordance da tastiera/hover, allargare i bersagli (gli eventi calendario di Mail erano ALTI 7 PIXEL).
5. **Android**: `softwareKeyboardLayoutMode` dichiarato + `behavior` esplicito nel `KeyboardAvoidingView` (mai `undefined`: la CTA finisce sotto la tastiera).
6. **Padding pagina mobile: 16–20px laterale** (12 è troppo poco, 24 ruba il 13% di una card a 375px), top ridotto (mai i 40 desktop invariati).
7. **Pull-to-refresh** su ogni lista mobile; `ListHeaderComponent` come **elemento**, non funzione (o la ricerca perde il focus a ogni lettera).
8. StatusBar coerente con l'header (testo scuro su barra chiara — il bug `style="light"` su bianco rende invisibili ora e batteria).
9. Login compilabile dai gestori di password (`textContentType`/`autoComplete`), `returnKeyType` che incatena i campi.
10. Zero haptics oggi nel parco: per le app da campo, un haptic sulle conferme d'esito è raccomandato (non obbligatorio).

## 11. Login (la schermata-firma)

È l'unico pattern con testo letterale prescritto, quindi la coerenza si verifica a colpo d'occhio (DS §4 Login): sfondo `bg` + due radial-gradient (oro 14% alto-sx, ink 10% basso-dx) · card vetro blur 30 / radius 24 / `shadow-float` · logo D · titolo + caption · **campi RAGGRUPPATI in un contenitore con divisori hairline e focus-within sul gruppo** (implementato solo da piattaforma e Scout: si estende a tutte) · CTA pillola nera full-width · footnote **«Consegne in guanti bianchi, dal 2019.»** (non note tecniche, non «Deluxy · 2.0»).
In più, promossi a canone: messaggio d'errore **indistinguibile** per email inesistente/password errata/utente disattivato (anti-enumerazione, Hub); `autoFocus` sull'email; errore con spazio riservato (niente salti); nessun `outline:none` senza sostituto.

## 12. Governance, lessico, distribuzione

- **Token**: le app web tengono `tokens.css` **byte-identico** alla fonte, importato per primo, con **check anti-drift in CI** (un diff che fallisce la build). La piattaforma — l'unica non agganciata, già divergita — si riaggancia. **React Native**: mai lo swap secco dell'import — le chiavi in collisione (`spacing.md` locale 16 vs DS 12) si **rinominano prima**, o 44 schermate cambiano in silenzio.
- **Lint «zero hex nei componenti»**: Fondo dimostra che si può al 100% (SVG compresi). Fallback dentro `var()` ammessi **solo se identici al token** (un fallback che contraddice il token è una bomba a orologeria — Mail ne ha 3). Eccezioni solo con commento che cita il motivo.
- **Lessico**: le classi e i componenti del **layer condiviso** parlano **inglese** (i token già lo fanno: `--surface`, `--fill-active`; e il corpus canonico — Mail, Finance, piattaforma — è già in inglese). I pattern nati con nomi italiani si **battezzano in inglese all'estrazione** citando l'origine: `Foglio` → `Sheet`, `.st-testo` → `.state-text`, `.cella-manca` → `.missing-cell`, `dialoghi` → `dialogs`. Nessun rinomina di massa nelle app esistenti: si migra al confine. I testi utente, i commenti e la documentazione restano in italiano.
- **Icone**: SVG stroke 1.7 / 19px, stile SF Symbols, con costante di tratto condivisa (Hub `AppIcon`). **Le emoji sono vietate come icone funzionali** (rendering per-OS imprevedibile, contrasto non verificabile, screen reader verboso) — ammesse solo nel contenuto testuale; il ✓/⚠ di un toast è lecito solo accanto al testo.
- **Commenti**: ogni fix o deroga UI porta **sintomo osservato + misura + data** («53 bottoni disabilitati sembravano attivi», «eventi alti 7px», 24/08). È la sola difesa contro chi «ripulisce» la riga fra sei mesi.
- **Deroghe**: annotate nel **README dell'app** con motivo e voce del Libro derogata (DS §6 — oggi rispettata da 0 app su 10). Una deroga non scritta è indistinguibile da un errore, e in audit si tratta da bug.
- **Il Libro si aggiorna così**: caso nuovo → agente `architetto-ux` (ricerca → verdetto → proposta di voce) → la voce entra qui con bump di versione → poi si usa nelle app. Le decisioni contestate portano il conteggio del voto e il dissenso (come cap. 5).
- **Il custode del layout**: dal 27/08/2026 ogni errore di UI e ogni richiesta di cambiamento dell'interfaccia, in qualsiasi app, passa dal custode (`architetto-ux`) attraverso il registro [SEGNALAZIONI-UX.md](SEGNALAZIONI-UX.md): il custode decide se è una correzione locale, una regola nuova di questo Libro (valida per tutte le app) o una deroga da annotare. La sezione «Custode del layout» sta nel README di ogni app.
- ⚠️ Questo file e il DS esistono in DUE copie (repo `app/` e repo `scoutwt/`): a ogni bump si allineano entrambe. **Attenzione: il repo `scoutwt` è PUBBLICO** — prima di copiarvi il Libro valutare che non esponga dettagli interni sensibili (il piano di adeguamento cita difetti di sicurezza d'uso).

---

## Appendice A — Implementazioni di riferimento (dove si copia)

| Pattern | Riferimento |
|---|---|
| Sidebar (comportamento) | Mail `components/Sidebar.tsx`, `VoceMenu.tsx` |
| Sidebar (lettera visiva) + drawer mobile + logout icona | `deluxy-search-supplier/index.html:313-340, 366-376, 420-438` |
| Tab bar mobile | Scout `components/BarraMobile.tsx` |
| Testata pagina (4 classi, 25/25 pagine) | Finance `globals.css:116-119` |
| Titolo dinamico sul filtro + caption col conteggio | Anagrafiche `app/page.tsx:430-453` |
| API bottoni | Finance/Mail `globals.css` (`.btn` + varianti) |
| Badge (formula completa) | Finance `globals.css:161-173`; dot: `.stato-pill` search-supplier |
| Mappa stati documentata | Anagrafiche `src/lib/stati.ts` |
| Tabella canonica + sticky/max-height | piattaforma `styles.css:243-291` |
| Tabelle→schede automatiche | piattaforma `app/core/tabelle-a-schede.ts` |
| Ordinamento che preserva i filtri | Finance `components/ThSort.tsx` |
| Filtri in querystring con debounce | Tasks `components/Filtri.tsx` |
| Conteggio «N di M» | Scout `components/ui.tsx` (`ContoRighe`) |
| Empty che insegna | Scout `components/ui.tsx` (`EmptyState`) + Finance `.empty` (forma) |
| Errore con ripresa | Fondo `componenti/pezzi.tsx` (`Avviso`, forma) + Mail `app/error.tsx` (contenuto) |
| Toast d'esito | Mail `components/Flash.tsx` |
| Nota contestuale | Tasks `NuovaTask.tsx` (`.nota-ok`) |
| Conferma narrativa | Mail `EliminaSezione.tsx`, `SvuotaCestino.tsx`; Anagrafiche `Riconcilia.tsx` |
| Dialoghi nativi RN | Scout `lib/dialoghi.tsx` |
| Esito sul bersaglio | Scout `components/EsitoButtons.tsx` |
| Modale | Mail `globals.css:1014-1107` + hook `useChiudiConEsc` |
| Bottom sheet RN | Scout `components/Foglio.tsx` |
| Stato inline con optimistic+rollback | Anagrafiche `MenuStato.tsx`; piattaforma `status-select.component.ts` |
| Coda offline | Scout `lib/syncQueue.ts` |
| Login | piattaforma `login.component.ts` (campi raggruppati) + Hub `login/page.tsx` (anti-enumerazione) |
| Icone a costante condivisa | Hub `AppIcon.tsx` |
| Messaggi via dizionario (mai stringhe raw) | Hub `utenti/page.tsx:56-67` |

## Appendice B — Piano di adeguamento (per priorità)

**P0 — prima di ogni lavoro estetico** *(ordine corretto in revisione ostile: prima ciò che distrugge dati)*:
1. **Distruttive senza conferma**: Finance (8 punti + svuota in blocco), Hub (elimina utente), Tasks (archivia irreversibile: aggiungere vista archivio o undo).
2. **Fallimento ≠ lista vuota**: Tasks (fetch di riga senza gestione), Scout (errore di rete = EmptyState; ErrorBoundary), piattaforma (3 classi di stato mai definite → card bianche/testo nudo), Fondo (bug classe `.tabella` inesistente: 3 tabelle Tips senza stile).
3. **Anagrafiche a 375px senza navigazione** (drawer canonico di search-supplier).

**P1 — un gesto, grande resa**: focus oro ovunque manca (Hub blu, Anagrafiche sbiancato, Tasks outline:none) · voce attiva in Hub/Tasks/Fondo/Mail-query · loading.tsx nelle 5 app senza (100+ pagine) · piattaforma: 8 `page-header` rotti + mappa stati 5 copie→1 modulo · bug Sidebar mobile Finance (style inline batte la media query) · StatusBar Scout.

**P2 — uniformazione**: API bottoni (Anagrafiche invertita, search 7 stili) · badge alla formula piena (4 app) · empty canonico con azione · asterischi rossi · th non urlati e sticky (3 app) · `window.confirm` → conferma narrativa (opportunistico) · emoji → SVG (search) · padding mobile · token: sostituire gli hex coi nuovi token v1.4 · check anti-drift in CI per tutte.

*Il piano si esegue app per app citando questo Libro; ogni tappa aggiorna handoff e, se cambia comportamento, il manuale dell'app (regole di lavoro Deluxy).*
