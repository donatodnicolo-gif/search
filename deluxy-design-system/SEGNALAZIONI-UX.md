# Segnalazioni UX — il registro del custode

**Dal 27/08/2026 il layout di tutte le app Deluxy ha un custode: l'agente `architetto-ux`** (`.claude/agents/architetto-ux.md`), che applica il [Libro UX&UI](LIBRO-UX-UI.md) e il [Design System](DESIGN-SYSTEM.md).

## Come funziona

1. **Chi trova un errore di interfaccia o vuole un cambiamento di layout NON lo risolve in autonomia**: lo scrive qui sotto (una riga nella tabella «In attesa») oppure interpella direttamente l'agente `architetto-ux` in sessione.
2. **Il custode valuta** ogni segnalazione contro il Libro e decide una di tre cose:
   - **correzione locale** (l'app era fuori canone: si adegua, citando la voce del Libro);
   - **regola nuova del Libro** (il caso non era coperto: la voce entra nel Libro con bump di versione e **vale anche per le altre app** — il custode elenca quali app sono toccate);
   - **respinta** (non è un difetto, o è una deroga legittima: si annota il perché).
3. L'esito si sposta nella tabella «Decise», con la data e la voce del Libro citata o creata.
4. Le **deroghe** concesse a un'app si annotano ANCHE nel README di quell'app.

> Formato della segnalazione: `app · schermata/percorso · cosa succede o cosa si vorrebbe · chi la segnala/data`. Meglio un sintomo osservato («il bottone Salva finisce sotto la tastiera su Android») che una diagnosi («manca il KeyboardAvoidingView»).

## In attesa

| Data | App | Segnalazione | Fonte |
|---|---|---|---|
| 03/09 | AI Mail | Composizione (`/scrivi` e risposta) · «da mobile l'invio di una mail è scomodo: il pulsante Invia si trova in alto». Le due barre azioni (cima+fondo pagina) su telefono lasciano l'Invia sempre fuori schermata mentre si scrive. **Correzione applicata nello stesso giro su richiesta dell'utente**, col pattern già nel Libro (piede sticky delle modali, §9): sotto i 900px la barra del fondo diventa sticky al bordo dello schermo (`globals.css`, selettore `:has` sulle sole card di composizione) e quella in cima si nasconde. **Da valutare come regola**: nelle pagine-form lunghe su mobile, la barra delle azioni primarie è sticky in fondo allo schermo, non duplicata in cima | utente |
| 28/08 | Scout | Deferiti dalla passata filtri: `storico.tsx` ha ancora il `Gruppo` locale (duplicato di GruppoFiltro, chip `<Text onPress>` sotto i 44px) dentro il pannello; le 10 copie locali di `Chip` si sostituiscono col `Chip` di `ui.tsx` man mano che si toccano le schermate | custode |
| 28/08 | search-supplier | Col metro del Libro v1.2 §8: i filtri gemelli sopra i risultati (`#resultTools`, 3-4 righe dopo una ricerca) andrebbero misurati a 375px contro il tetto delle 2 righe — non è l'offensore del caso (compaiono solo a risultati presenti e wrappano), ma va verificato | custode |
| 30/08 | Budgets | `Sidebar.tsx` · **due voci con la stessa icona**: «Target e premi» e «Accesso» usano entrambe `icons.premi` (il trofeo) — nello screenshot dell'utente «Accesso» ha un trofeo. Viola la regola decisa il 28/08 («mai la stessa icona», misura: zero icone duplicate). In più «Chiavi» usa `icons.cfo`, che disegna un riquadro con spunta: l'icona non è l'etichetta. Nel set non esistono icone chiave/lucchetto: vanno aggiunte | utente (richiesta «rivedi il menù in modo logico») |
| 30/08 | Budgets | `Sidebar.tsx` · **ordine del gruppo «Lavoro»**: «Conto economico» — la lettura quotidiana — è l'ultima voce, sotto «Target e premi» che si apre di rado. Col criterio deciso il 28/08 (ordine per **frequenza** d'uso, non per flusso) andrebbe più in alto. Da decidere anche se «Scenari e costi» resti in «Configurazione»: non è un'impostazione dell'app ma un **input del calcolo** (livelli di scenario, costi, margini) che entra nel conto economico — caso non coperto dalla regola del 28/08 | utente (richiesta «rivedi il menù in modo logico») |

## Decisa il 28/08/2026 — struttura di una sidebar densa (FINANCE, poi Libro)

Nata dal riordino del menu di **FINANCE** (`deluxy-partner`, 19→20 voci), valutato da una giuria (Controller + Treasury + `architetto-ux` con Apple HIG, Material 3, Fluent, NN/g). Il caso non era coperto dal Libro §1 (che dà la sidebar canonica ma non il numero di sezioni, il criterio d'ordine, le sezioni monovoce, la leggibilità a icone, i nomi ambigui). **Regola nuova, vale per tutte le app** — da portare nel Libro §1 al prossimo bump:

- **≤ 6-7 sezioni di primo livello, < 8 voci per sezione, un solo livello** (niente sottovoci per alleggerire una densità che a 3-4 voci/sezione non esiste). Fonti: NN/g (mediana 7 categorie top), Fluent NavigationView.
- **Ordine per FREQUENZA d'uso**, non per flusso di processo (il flusso è per i wizard): Dashboard in cima, Configurazione in fondo, posizione **stabile** nel tempo (memoria muscolare degli esperti).
- **Un'etichetta di sezione si paga solo se raggruppa ≥ 2 voci**: le sezioni monovoce si accorpano.
- **In modalità ridotta** (solo icone) il raggruppamento sopravvive con **separatore/spaziatura**, ogni icona ha **tooltip** e **icona univoca** (l'icona È l'etichetta).
- **Due voci con nomi quasi uguali** si **rinominano** perché ciascuna si spieghi da sé (o si annidano se padre/figlio), e **mai la stessa icona**.

Applicato su FINANCE: 7→6 sezioni, accorpate «Rete» e «Ordini Shopify» (monovoce), rinominata la coppia «Servizi a fatturazione»/«Fatture» → «Fatturazione servizi»/«Registro fatture» con icone diverse, tolti i 2 doppioni d'icona, aggiunto il separatore hairline fra i gruppi a barra ridotta. **Misura**: n. sezioni ≤ 7, voci/sezione < 8, livelli = 1, zero sezioni monovoce, zero icone duplicate.

## ⚠️ Copie vive vs stale (scoperto il 28/08 durante «push tutto live»)

Alcune app hanno DUE copie (repo `app/` e `scoutwt/`, stesso repo GitHub, branch diversi). La copia VIVA è quella col progetto Vercel pinnato (`.vercel/project.json`):

| App | Copia VIVA (deploy) | Nota |
|---|---|---|
| **Hub** | `scoutwt/deluxy-hub` (proj `deluxy-hub`) | `app/deluxy-hub` è STALE (più semplice). Adeguamento+drawer applicati su scoutwt |
| **Finance** (deluxy-partner) | `scoutwt/deluxy-partner` (proj id) | `app/deluxy-partner` STALE (166 file di diff). Adeguamento su scoutwt |
| **Customer Service** | `scoutwt/deluxy-messaging` | solo in scoutwt |
| **Anagrafiche · AI Mail** | `scoutwt` | solo/live in scoutwt |
| Tasks | `app/` — deploy **dalla RADICE** `app/` (proj `deluxy-tasks`, Root Dir=deluxy-tasks); il pin dentro la sottocartella («tasks») è vecchio e FALLISce | |
| Piattaforma (delivery) | `app/` — deploy **dalla RADICE** con `VERCEL_ORG_ID/PROJECT_ID` del progetto `delivery` (la radice è linkata a Tasks) | |
| CRM · Personale · Calendario | `app/` (pin proprio) | deploy dalla loro cartella |
| **Fondo · Acquisti** | — | NON su Vercel (solo locale, porte 3180/3100): nulla da deployare |

## Deploy in produzione (28/08, «push tutto live»)

Deployate e verificate (target production, aliased): **Hub, Finance, Customer Service, Anagrafiche, AI Mail, Piattaforma (delivery→app.deluxy.it), CRM, Tasks, Personale, Calendario, Scout** (Scout via `bash scripts/deploy-web.sh`, verifica post-deploy ✓). Fondo/Acquisti non deployati (non su Vercel). **search-supplier** adeguata su `main` (worktree `.claude/worktrees/search-main`, token v1.4 + InfoWindow + card errore) e pushata: il push su `main` ha fatto partire il deploy di produzione `search-deluxy` (Vercel git-integration) — verificato Ready. **12 app live in tutto.**

## Audit v1.10 «Nessun click muto» — fotografia del parco (28/08/2026)

Verifica della regola su 20 app (6 audit paralleli sul codice delle copie VIVE). Esito: **4 conformi, 15 parziali, 1 fuori canone**. Nessun fix applicato: solo la fotografia, in attesa di decisione.

| App | Verdetto | Nodo principale |
|---|---|---|
| **Tasks** | ✅ CONFORME | implementazione di riferimento della regola (`.campo-errore` con `role="alert"`, messaggi rete/server distinti, input conservato) |
| **Transactions** | ✅ CONFORME | 13 Moduli* a canone; riserve: niente `error.tsx`, 6 form `void` senza in-corso (peggiore: «Segna come pagata» `distinte/[id]/page.tsx:71`) |
| **Scout** | ✅ CONFORME | canone `avvisa()`+guardia `salvando` a tappeto; 2 falle: `pagamenti.tsx:298-320` cambiaStato/salvaIncassato SENZA catch (incassi), `comunicaProforma` best-effort muto |
| **Fondo** | ✅ n/a | sola lettura, zero azioni mutanti |
| **Piattaforma** | 🟡 PARZIALE | ~40/69 scritture a canone; gravi: `calendar.component.ts:446-463` salva/rimuove disponibilità con errore MUTO; `delivery-form.component.ts:738-747` PATCH richiesta→accettata `error:()=>undefined` |
| **search-supplier** | 🟡 PARZIALE | `saveStato` (`index.html:3087`) ottimismo senza rollback né messaggio su stato/stelle/archivia (condiviso fra operatori); revoca chiave senza `r.ok`; «Errore 500» crudo nei fallback |
| **Hub** | 🟡 PARZIALE | esiti i migliori del parco (dizionari su 6 pagine) ma **zero stati in-corso su 16/16 submit** e input perso su `?errore=` (nuovo utente, registra giornata) |
| **Anagrafiche** | 🟡 PARZIALE | modali ottimi; manca `error.tsx` su cui contano MenuStato/MenuInteressi/pill (crash inglese di Next); `RisolviMatch.tsx:47` try/finally senza catch |
| **AI Mail** | 🟡 PARZIALE | la più matura sui 3 stati, MA: toast-errore ancora 9 s (`Flash.tsx:90`, migrazione a banner mai avvenuta) e **7 call-site col Flash senza tono** = fallimento vestito di verde (`BottoneRispostaAI.tsx:28`, `ChiudiThread`, `MessaggiContatto` che azzera pure la selezione…) |
| **Customer Service** | 🟡 PARZIALE | invio Inbox ORA a canone (rollback + content-type) ma: `Dashboard.tsx:86-95` spunta attività ottimistica con `catch(()=>{})` (stesso schema del 30/07); polling Inbox 4-5 s SENZA controllo redirect (si congela muta a sessione scaduta); 17 delete fire-and-forget |
| **Orders** | 🟡 PARZIALE (al confine) | 42 server action con 1 solo try, **nessun `error.tsx`**, zero `useFormStatus` su 63 form; sync Shopify ricliccabile durante l'esecuzione |
| **Marketing** | 🟡 PARZIALE | fix cornice 24/08 ok nel caso generale MA `ESITI_NEGATIVI` contiene `drive-json-invalido` che nessuna azione emette (l'azione emette `drive-json-rotto`): JSON invalido = cornice VERDE col ✕ nel testo; 114 action/14 try, no error.tsx |
| **Merchandising** | 🟡 PARZIALE | `?avviso=` scritto dal redirect ma MAI letto dalla pagina prodotto (errori parziali Shopify invisibili = successo bugiardo); zero in-corso (doppio click su «Crea su Shopify» = doppio prodotto); form 30 campi perso su errore |
| **Scripts** | 🟡 PARZIALE | il «Salva» principale su successo è indistinguibile dal non aver salvato (solo revalidate); i 3 componenti AI/chiavi invece sono il canone esatto |
| **Finance** | 🟡 PARZIALE | esiti a banner ovunque + `error.tsx` + `AzioneTransazione.tsx` (il miglior componente del parco), MA `BottoneInvio` usato in 10 file su 88: **116 submit nudi** (il rischio doppio-protocollo è scritto nel commento del componente stesso) |
| **CRM** | 🟡 PARZIALE | zero in-corso (mail personalizzata SENZA dedup: doppio click = mail doppia al cliente); 5 delete con `catch(()=>{})`; input perso su `?errore=`; `WaAssistito` mostra «Aperta ✓» comunque |
| **Personale** | 🟡 PARZIALE | la più disciplinata delle 5 piccole; manca in-corso sui form classici, input perso su validazione (tranne il flusso omonimia, che è il pattern giusto) |
| **Calendario** | 🟡 PARZIALE | `RigaEvento.tsx:27-39`: ✓ completato/Annulla/Archivia senza `res.ok` né catch né esito — il click può non fare nulla in silenzio |
| **Acquisti** | 🟡 PARZIALE | `CardAcquisto.tsx:24-36` 3 bottoni muti; trappola prod: errori attesi modellati come `throw new Error("…")` → Next 15 li REDIGE in produzione, i modali mostrano il generico inglese (in dev sembra tutto ok) |
| **Budgets** | 🔴 FUORI CANONE | **falso successo sistemico**: il middleware redirige anche le `/api/*` interne a `/login` → `fetch` segue → 200 HTML → `res.ok` true → TUTTI gli editor mostrano «salvato» a sessione scaduta senza aver scritto nulla (`ImpostazioniForm.tsx:45`, `TeamEditor.tsx:65` che chiude e PERDE l'input, `MarginiEditor.tsx:116`); delete senza ramo errore; zero try nei components (rete giù = bottone inchiodato per sempre) |

**Le due mancanze TRASVERSALI** (colpiscono quasi tutto il parco, candidate a correzione di sistema, non app per app):
1. **Zero `useFormStatus`** sui form a server action in tutte le app Next: lo stato «in corso» esiste solo nei componenti client. Serve UN componente condiviso (il `BottoneInvio` di Finance è già scritto: va promosso a DS e adottato).
2. **`error.tsx` assente** in Anagrafiche, Orders, Marketing, Merchandising, Scripts, Transactions, CRM, Personale, Calendario, Acquisti: ogni throw non catturato è la pagina inglese di Next. Il modello c'è (Finance, Mail, Tasks).

**Priorità proposte al custode** (dalla gravità del danno):
- **P0 Budgets**: escludere le `/api/*` dal redirect del middleware (rispondere 401 JSON) + controllo `res.redirected` nei client — è il falso successo che scrive la regola.
- **P0 Marketing**: allineare `drive-json-rotto`/`drive-json-invalido` (una riga) — cornice verde su errore, il bug del 24/08 ancora vivo su un ramo.
- **P0 Scout pagamenti**: try/catch su `cambiaStato`/`salvaIncassato` — sono gli incassi.
- **P1**: Calendario RigaEvento; CS Dashboard.spunta + redirect-check sui polling Inbox; piattaforma calendar.component + chiudiRichiesta; search-supplier saveStato; CRM dedup mail personalizzata; Acquisti throw redatti in prod.
- **P2**: error.tsx ovunque manca; BottoneInvio/useFormStatus a tappeto; Mail toast→banner + 7 toni mancanti; input conservato sui redirect `?errore=`.

## Decise

| 31/08 | **tutte (login)** | Utente: «per tutte le app in fase login crea la possibilità di recuperare password, esiste già per deluxy delivery e hub» | **Censimento prima di scrivere codice: su 19 login la parola «recupero» vuol dire tre cose diverse.** (a) **Ce l'hanno già**: piattaforma (`465e04f0`, link 2h monouso via AI Mail) e **Hub** (`password-dimenticata` + `reimposta-password` + `TokenReset`, con chiusura di tutte le sessioni al cambio) — la premessa dell'utente era esatta. (b) **Utenti veri, recupero da fare**: Customer Service, FINANCE, AI Mail, **Transactions** (tabella `Operatore` con blocco tentativi e registro), Scout (Supabase). (c) **Nessun utente da riconoscere: 9 app** (Acquisti, CRM, Personale, Anagrafiche, Budgets, Marketing, Merchandising, Orders, Scripts) hanno **una sola password di squadra** in variabile d'ambiente: nessuna email, nessun account, niente da mandare. **Deciso dall'utente per le 9**: non un link finto ma un `<details>` «Password dimenticata?» sotto il bottone che dice la verità — «una sola password per tutto il team, non legata a un indirizzo email, chiedila a chi amministra». **Calendario e Tasks** non hanno utenti propri (leggono `hub."Utente"` in SQL diretto): il loro link punta al recupero **del Hub**, perché una schermata locale potrebbe solo mentire. tsc 0 su 11 app, blocco provato aperto/chiuso sul dev server. ⚠️ **Trappola costata un giro di lavoro**: la cartella canonica era stata deumbrata dalla data di UN file (`login/page.tsx`) e per il Hub dava `app/` — che è invece una **copia morta** (24 file contro 63). Il recupero c'era, ma nell'altra copia. La misura giusta è l'ultimo commit **della cartella intera** + il numero di file: `scoutwt` è viva per Hub, Mail, Anagrafiche, FINANCE e **Scout**; `app` per la piattaforma. ⬜ Restano da fare (serve una **tabella token nuova** su ogni app, cioè schema sul Postgres condiviso: mai in autonomia): CS, FINANCE, AI Mail, Transactions, Scout |
| Data | App | Segnalazione | Esito |
|---|---|---|---|
| 04/09 | **CRM** (login, Impostazioni) | Utente: «consentimi di fare reset password da app» — il `<details>` del 31/08 diceva la verità (nessun link da mandare) ma non dava una via d'uscita | **Fatto, coerente con la decisione del 31/08 sulle 9 app a password di squadra**: la password resta unica, ma ora ha una casella fissa di amministrazione a cui mandare il link (`CRM_RESET_EMAIL`→`MAIL_UTENTE`), quindi il «recupero» smette di essere finto. Login: nel `<details>` «Password dimenticata?» un bottone ghost «Mandami il link di recupero» (nessun campo email: il modulo pubblico non chiede né rivela indirizzi), esito unico «se la posta è configurata il link è partito», e avviso onesto in arancione quando la posta del CRM NON è configurata (oggi: manca `MAIL_API_KEY`). Pagina `/reimposta-password` con la stessa cornice del login (link scaduto = `errore-card` + ritorno al login; form 2 campi con label, `minLength`, `autocomplete=new-password`). Impostazioni: card «Password del team» con pillola di stato (nascita in env / cambiata dall'app il …), form a 3 campi, messaggi d'errore in pagina via `?password=`. ⚠️ Vale come modello per le altre 8 app a password di squadra SOLO se hanno una casella di amministrazione e la posta accesa: senza, resta il `<details>` del 31/08. tsc NON eseguito (Node assente sulla macchina il 04/09): da verificare al primo `npx tsc` |
| 29/08 | **Customer Service** | Utente, screenshot della scheda ordine (cioccolatini a Roma): «qui devono apparire solo quelli collegati a quella provincia» · «bliss cake è su milano» · «e poi due sono legati ai fiori» — la sezione «Hanno già preparato ordini per noi» mostrava 6 righe: 1 pasticceria di Milano, 4 fiorai, 1 negozio di palloncini | **Correzione locale, con dentro una regola che il custode dovrebbe guardare.** La sezione ORDINAVA soltanto, per una ragione scritta e vera: la provincia di una consegna passata si ricava dalla città e `siglaProvincia` risponde solo sui capoluoghi (**misurato: 12 ordini su 49**; `indirizzo`, `fornitoreCitta` e `fornitoreId` vuoti su 47 fornitori su 47). Adesso **filtra** per mestiere (dal nome del fornitore e dai negozi per cui ha lavorato) e per zona — ma la parte che conta è **come nasconde**: chi consegna per certo altrove esce (due prove sole: una sua provincia ricavata che non è questa, oppure solo paesi esteri), chi **non si sa** dove consegna non si scarta — sta dietro «Altri N lavorano con noi, non sappiamo dove» — e sotto l'elenco una riga dice **quanti** sono usciti e per quale dei due motivi. Corretta nella stessa passata una bugia preesistente: bastava una città qualunque per essere dichiarato «altrove», e chi consegna a **Valmontone** risultava altrove su un ordine a **Roma**. I comuni non capoluogo si risolvono coi comuni che il registro Anagrafiche indica in quella provincia, letti nella stessa richiesta (segnale che può solo includere, mai escludere). tsc 0, build 0, **21 prove sui dati veri**, da 47 righe a 5. ⬜ **Da decidere dal custode**: se «un elenco che si accorcia dice quanti mancano e perché, e chi non si sa non si scarta ma si mette da parte» diventa voce del Libro (§5/§8) valida per ogni app — qui il costo di nascondere una riga è una telefonata in meno, altrove può essere peggio |
| 29/08 | **tutte (19 login)** | Utente: «il bottone Entra dei log-in deve essere NERO con TESTO ORO, come già ora per alcune app» | **CHIUSA SENZA MODIFICHE — l'utente ha deciso: si resta BIANCO** (29/08, dopo il censimento). Il censimento ha smontato la premessa: **nessuna** delle 19 app aveva il testo del CTA in oro — tutte `#fff`/`--on-ink` su `ink`; l'oro visto nei login è il **quadratino del logo** (piattaforma `login.component.ts:96 color:var(--gold)`, Scout `logoD`). Non era quindi un allineamento ma una regola NUOVA, e messo davanti al fatto l'utente ha confermato il bianco. **Nessun file di app toccato; Libro e DS restano alle versioni correnti** (niente v1.11/v1.5, niente classe `.btn.login-cta`). Le misure restano agli atti se un domani si riapre: `#B8963E` su `#111318` = **6,61:1** (AA ✓, AAA ✗), su `--ink-hover #2A2D35` = **4,90:1**, a `:disabled` (opacity .55) crolla a **2,42:1** — ed è lo stato che porta «Accesso…», quindi l'oro avrebbe comunque imposto il rientro a `--on-ink` sul disabilitato (legge 12). Il bianco su ink vale **18,58:1**: la scelta dell'utente è anche la più leggibile. ⬜ Aperti scoperti nella stessa passata, NON toccati e da decidere a parte: (a) l'anello di focus oro vale **2,58:1** su `bg` e 2,81 su `surface` → sotto il 3:1 di WCAG 2.4.11, difetto DS preesistente su tutte le app; (b) in 12 app la `.btn` **nuda** è ink/bianco invece di `fill`/`text` (Libro §3 «API unica delle classi»); (c) lessico non uniforme: Scout e CS dicono «Accedi», tutte le altre «Entra» (legge 11) |
| 29/08 | **Transactions** | Utente (dalla home): la coda «Da autorizzare» non rispettava la regola ricerca+periodo (§8-bis) — l'archivio le aveva, la coda no | Correzione locale: ricerca su riferimento/beneficiario/causale/IBAN/app + scorciatoie di periodo su `creataIl` col set chiesto dall'utente per la coda (**Oggi · Ultimi 7 giorni · Mese · Trimestre · Anno**, chips-link fuori dal form, un parametro), vuoto che distingue «filtro attivo» da «coda finita». tsc+build ✓, **live** |
| 29/08 | **Scout** | Utente: «allinea la tua UX&UI a quella delle altre app, ora è molto distante» | **Passata sistematica su tutta l'app** (censimento agente: ~151 usi d'oro fuori posto su 171, 23 card a radius sbagliato, 170 pesi 800/900, 22 colori hardcodati, 16 bottoni fuori forma). Applicato: l'ORO NON È MAI UNO STATO (8 mappe stato ripulite: nuova=orange, chiuso=green, bozza=neutro; icone fatto/non-fatto degli ordini in verde con legenda aggiornata; switch/step in ink); oro via da importi, link, frecce, spunte, etichette, grafici e dalla label attiva della nav (resta su icona attiva, ⭐, preferiti, avatar, logo, empty-state, avvisi di cautela); tag categoria neutri fill+testoSoft (§5 categorie≠stati); card a radius-l ovunque; scrim dal token; selezioni fill-active/ink; bottoni sempre a pillola; pesi 800/900→700 e titoli a 600 col tracking; label campi form 12.5/500 sentence case; `accessibilityState selected` su drawer e barra mobile, tab attiva per prefisso. tsc 0, 74/74 jest, deploy ✓. ⬜ Restano per il custode: sidebar in vetro (blur) vs bianco opaco; ~40 ridefinizioni locali di SectionLabel da unificare; le label MAIUSCOLE di «Paga fornitori» (riga sotto) ora divergono dal §4 |
| 28/08 | **Scout** | Utente: la schermata nuova «Paga fornitori» era «molto distante» dalla UX&UI delle altre app — bottoni con stili locali invece del Btn condiviso, card locale invece di Card, FAB cerchio muto col solo «+», etichette dei campi in stile proprio | Correzione locale allineata alla schermata sorella «Pagamenti» (ordine diretto dell'utente): azioni col **Btn** di ui.tsx (primario ink / secondario fill, small), righe con **Card**, FAB a **pillola CON etichetta** «Paga fornitore» (navy + shadow.float, come pagamenti.tsx — un cerchio muto non dice cosa crea), etichette campi al pattern styles.label (11px/700 MAIUSCOLE) e input con radius.m + spacing token. Logica invariata. tsc ✓, deploy web ✓ |
| 28/08 | **Scout** | Utente, screenshot della scheda negozio: «il layout non è come dovrebbe essere sulla base dell'architettura UX&UI» — titoli di sezione ORO maiuscoli, bottone «Trova contatti su HubSpot» color oro, «+ Aggiungi contatto» rettangolo bordato, link telefono oro | Correzione locale allineata al DS (ordine diretto dell'utente): etichette di sezione al token `label` (11px/700 testoSoft, via l'oro — anche su modifica/[id] e nuovo-target che avevano la stessa copia), bottoni secondari a **pillola `fill`** (mai oro: DS §3), telefono con icona call + testo scuro, card contatto con bordo hairline. L'oro resta solo sulla ⭐ del decisore (accento legittimo). Nella stessa passata: la scheda mostra solo i contatti ATTIVI e ogni riga ha «Archivia» (stessa strada della Rubrica, notifica il registro) — un referente tolto da Anagrafiche non spariva da qui perché la rubrica è di Scout. tsc ✓, 74/74 jest |
| 28/08 | **tutte** | Utente: «se un bottone genera un errore (es. chiamata API non valida) l'errore va comunicato; il bottone non può rispondere con un'azione anonima» | **Libro v1.10 (§7 + dodicesima legge «Nessun click muto»)**, verdetto `architetto-ux`: regola NUOVA (le leggi 8-9 dicevano dove vivono gli errori e coprivano le letture, nessuna regola imponeva l'esito visibile delle azioni). Contratto a 3 stati (in corso / successo / errore presso il punto dell'azione), tre proibizioni: fallimento silenzioso (catch vuoto, console.error come unico esito, `res.ok` senza controllo di `res.redirected`+content-type), esito ambiguo (UI di successo su errore server; ottimismo senza rollback — riferimento Anagrafiche `MenuStato`), codice nudo (401/403/500 tradotti dal dizionario per app — riferimento Hub `utenti/page.tsx`). Collaudo falsificabile: chiamata fatta fallire + click → se lo schermo resta identico o mostra successo, il bottone è fuori canone. **Coda di adeguamento (per il custode)**: censimento dei catch vuoti/solo-console.error dietro bottoni di salvataggio in tutto il parco; toast-errore 9 s di Mail → banner (già segnato); controllo `res.redirected` esteso alle app con middleware di login |
| 28/08 | **tutte** | Utente (da Finance/fatture: né ricerca né periodo rapido) | **Libro v1.9 (§8-bis)**: ogni elenco ha ricerca `q` sui campi identificanti + filtri principali + scorciatoie di periodo `Mese in corso · Mese scorso · Trimestre · Anno` (UN parametro, chips-link fuori dal form, data dichiarata in commento per pagina). **Implementata e LIVE su tutto il parco**: Finance (9 pagine, /fatture è il riferimento server-rendered), Orders (5+ChipsPeriodo), CS (7 liste + `lib/periodo.ts` unico, filtro passato al server dove le liste sono tagliate), Mail (8), Marketing (10, integrato con SceltaPeriodo), Transactions (3+beneficiari solo ricerca), Merch (ricerche), Hub (utenti), CRM (eventi, membri lista), Tasks (periodo su scadenza), Personale (ricerca nome+ruolo), Calendario (chips SOLO in Agenda: la vista Mese ha già la griglia), Acquisti (chips client su dataOrdine), piattaforma (4 scorciatoie accanto a Oggi/Domani/Tutte + Trimestre su stipendi e fatturazione, i18n it/en), Scout (pagamenti aveva ZERO gambe; richieste e preventivi completate). **Esclusi con motivazione scritta nel codice**: registri e cataloghi (Anagrafiche, rubrica Mail, beneficiari, collezioni, organico, universo Fondo), pagine a struttura mensile (saldi, consuntivo/pl Budgets), trattative Scout (created_at assente sulle vecchie: il filtro le nasconderebbe in silenzio), clienti CRM (l'API non filtra: sarebbe l'OR largo col take). tsc/build 0 ovunque, 16 deploy a esito 0 |
| 28/08 | **Scout** (rete per tutte le sue tabelle) | Utente, screenshot di Ordini: colonna «Cliente» collassata a ~14px con le lettere in VERTICALE | Causa: le colonne fisse cresciute (icone v1.8) dentro il cap fermo, e la colonna elastica aveva `minWidth: 0` — pagava lei tutto il conto. **Rete in `Tabella.tsx`**: le colonne elastiche non scendono MAI sotto 90px (override `minWidth` per colonna); cap extra-largo 1560→1608. Misurato sul dev server con fisse che sforano apposta: l'elastica tiene 90px su una riga. **Live** ✓ | 
| 28/08 | **tutte** | Utente, screenshot della modale «Aggiungi sede» di Anagrafiche più alta dello schermo (Salva irraggiungibile) | **Libro v1.7 (§9)**: la modale sta DENTRO la viewport — tetto `min(92dvh,…)` + scroll SUL contenitore + testata sticky con **✕ obbligatoria** + piede azioni sticky; collaudo a 375×812 e 1366×768. **Implementata e LIVE**: Anagrafiche (riferimento), Finance, Orders, Mail (vh→dvh), CS (il pannello ordine NON aveva tetto: scorreva il velo; ✕ aggiunte a 8 finestre), Transactions, Marketing (l'`overflow: hidden` RITAGLIAVA il contenuto), Acquisti (✕ nuova sul componente condiviso), piattaforma (5 famiglie; il dialogo Assegna del dettaglio era senza tetto né ✕), search (mailModal/lightbox in dvh), Scout (Foglio già a norma; 13 ScrollView annidate sanate). CRM/Tasks/Personale/Calendario/Fondo/Hub/Budgets/Merch: senza modali, nulla da fare |
| 28/08 | **tutte** (da Scout/Ordini) | Utente, screenshot: «icone troppo piccole, e al passaggio del mouse devono dire cosa fanno» | **Libro v1.8 (§3)**: azione a icona = icona ≥18-19px in bersaglio ≥28px desktop / 44 touch + tooltip (`title`) obbligatorio con la stessa parola del bottone testuale. Applicata su Scout: colonna azioni di Ordini 27→33px con icone 19 (conto rifatto: colonna 283, soglie +48), TabellaTrattative 15→19 (cella 124), card trattative → 19; i `title` c'erano già. `AzioniRiga` (38px+title) resta il riferimento. Le app web si verificano col metro nuovo alla prossima passata (molte usano già bottoni testuali) |
| 28/08 | **Piattaforma** | Utente, screenshot del dettaglio partner: «bottoni distanti e uno si sovrappone alle lingue» | Correzione locale: il `margin-left:auto` era su ENTRAMBI i bottoni (Calendario e Modifica) — ora le azioni stanno in un gruppo unico a destra; e la riga del titolo di TUTTI e 7 i dettagli riserva 96px alle bandierine fisse della lingua (prima «Modifica» ci finiva sotto). ng build ✓, live |
| 28/08 | **Piattaforma** | Utente, sul modulo partner: «pessima UX&UI — in base alle regole dell'architetto allinea e migliora la ux di tutta l'app, rivedi ogni pagina» | **Passata integrale sul Libro, con censimento misurato prima delle correzioni**: legge 1 (placeholder-come-label nelle righe-servizio → intestazioni di colonna), §4 (asterischi rossi via classe globale `.req`; barra azioni **sticky** sui 4 form lunghi), v1.5 (back con history su 7 form), §7 (**8 `confirm()`/`prompt()` → conferma narrativa unica** `shared/conferma.component.ts` con nome+conseguenze+verbo rosso+✕/Esc; il rifiuto richieste ha il campo motivo), §8-bis (**ricerca su 9 elenchi** che non l'avevano + «N di M»), legge 9 (Vendite: fallimento non è più lista vuota), §9 (scrim dal token, Esc su rule-form e preventivi), WCAG 2.4.7 (`.chip:focus-visible` globale + bersagli 44px touch). In più: nel dettaglio consegna il nome prodotto apre la FOTO (lightbox a norma §9) — la CSP bloccava `app.deluxy.it` in `img-src`, corretta. Verifica live su produzione (sticky, filtro chip 107→3, asterischi rgb(215,0,21), Esc). Deroga annotata: `window.prompt` come ripiego copia-negli-appunti |
| 28/08 | **Piattaforma** → candidata per **tutte** | Utente, con screenshot di `/partners`: «la tabella diventa lunghissima credo a seguito della lista province — non allungare la tabella ma dopo tot metti "+ altre 10"» | Correzione locale **+ proposta di regola**: in una cella di tabella un elenco di chip mostra al massimo **6** voci e poi una coda «+N» (pillola senza sfondo, l'elenco nascosto nel `title`, **non cliccabile** perché la riga intera naviga — Libro §8). Misurato sui 289 partner veri: province per partner mediana 1, **p75 = 12** (91 partner ne hanno esattamente 12), **max 107** su due partner. Applicato anche alle **categorie** (max 18 nomi in fila), che avevano lo stesso difetto. ⬜ **Da decidere dal custode**: se diventa regola del Libro, vale per ogni cella-elenco di ogni app |
| 28/08 | **Piattaforma** | Utente, con screenshot della card «Registro Anagrafiche»: «rendi questi bottoni parlanti: se significa che crea l'anagrafica scrivi "Crea"» | Correzione locale: l'etichetta segue lo **stato del confronto** — *non trovato* → «**Crea nel registro**», *trovato non collegato* → «**Collega al registro**», *collegato* → «**Aggiorna il registro**», *ambiguo* → bottone **spento** col motivo (il server rifiuterebbe comunque: più schede possibili, per non crearne un'altra). Anche la riga sotto cambia: dice la **conseguenza**, non una descrizione generica. «Aggiorna» (secondario) → «**Ricontrolla il registro**», che è quello che fa |
| 28/08 | **Piattaforma** | Utente: «nel dettaglio partner mostra in fondo le ultime top 10 consegne richieste» | Blocco nuovo in fondo alla scheda: 10 righe (numero, data, destinatario, servizio, valet, stato col **colore dalla mappa unica** `core/stati-consegna.ts`), riga cliccabile. ⚠️ Il bottone «Vedi tutte» avrebbe **mentito**: l'elenco consegne non leggeva `partnerId` dall'indirizzo e defaultava a OGGI — avrebbe mostrato le consegne di oggi di TUTTI. Aggiunti quindi: filtro `?partnerId=` con **chip rimovibile che dice il nome** (Libro §5: un elenco ridotto deve dire da cosa) e terza vista «**Tutti gli stati**» — *non* «Tutte», perché a mezzo centimetro c'è già un «Tutte» che vuol dire «tutti i GIORNI» |
| 28/08 | **tutte** | Utente: «il sistema di notifica del CS è eccezionale — pallini gialli, riquadri in basso a destra: per tutte le app» | **Libro v1.4 (§7) «le notifiche in-app»**: tre segnali (toast = appena successo · pallino giallo = nuovo da quando HAI guardato · numero = carico), mai confrontare orologi, poll che respira e si ferma a scheda nascosta, poller = sentinella della sessione scaduta, regola in funzione pura con le prove. **Implementata e LIVE su 8 app** (Tasks, CRM, Acquisti, Calendario, Anagrafiche, Finance, Orders, Marketing — toast dove ci sono arrivi veri: Tasks, Acquisti, Orders, Marketing); prove pallini passate ovunque |
| 28/08 | **tutte** | Utente: «quando si va in un dettaglio ci vuole un Indietro che torna alla stessa vista di prima» | **Libro v1.5 (§2) «il ritorno al punto esatto»**: «← Indietro» esplicito su ogni dettaglio; history (che conserva filtri/scroll) con ripiego sull'elenco; i «← Torna a X» cablati sull'URL nudo sono fuori canone. **Implementata e LIVE**: ~45 pagine di dettaglio su 12 app web (`TornaIndietro`), 7 dettagli Angular a `Location.back()`, Scout era già conforme (header stack + backBehavior history) |
| 28/08 | **tutte** | Utente: «al click su un record della tabella si apre il suo dettaglio» | **Libro v1.6 (§8) «la riga si apre col click»**: riga intera cliccabile dove il dettaglio esiste, guardia sulle azioni interne (closest — esteso a `details/summary/dialog` dove serviva), pointer+hover solo sulle righe che navigano, link da tastiera conservato. **Implementata e LIVE**: ~35 tabelle su 12 app + Scout (Storico → visita-dettaglio; il resto già conforme); i casi ambigui (righe multi-destinazione, editor, pannelli-in-riga) esclusi con motivazione nei rapporti |
| 28/08 | **tutte** | Utente, con screenshot del gruppo Periodo su 2 righe: «su mobile rendi scorrevole, così per tutte le app» | **Libro v1.3 (§8.9)**: sotto la soglia mobile un gruppo di chip sta su UNA riga e SCORRE (rovescia il vecchio «mai scroll orizzontale» per i chip — il divieto resta per le tabelle); due guardie: l'ultima chip deve sbucare (niente scrollbar, niente tagli netti), azioni/ricerca MAI nella corsia. Implementata: Scout (`RigaChips` in ui.tsx, montato su GruppoFiltro/GruppoScelta/PeriodoSelector/PannelloFiltri e su tutte le righe chip — misurato a 375×812: corsie scorrevoli, zero overflow), CS (.filtri-passi, ClientiLista), Orders (FiltriTaglio + 5 gruppi), CRM e Tasks (wrapper `.riga-chips-scorri` attorno alle sole chip, ricerca fuori), Marketing (pillole periodo), search-supplier (9 gruppi, media query 560; label «Risultati» sticky al bordo). Utility web: nowrap+overflow-x+scrollbar nascosta+`>*{flex:0 0 auto}` |
| 28/08 | **Marketing** | Utente, con screenshot: «come mai questi bottoni così?» — «Deposita analisi» era un ovale nero gigante | Correzione locale (trappola flex nota): la testata era un flex senza `align-items` → il default `stretch` stirava la pillola all'altezza di BottoneSync (bottone + riga di esito). `alignItems: flex-start` esplicito su home e /analisi. «Vai» è a norma (pillola con label corta) |
| 28/08 | **tutte** (da Scout/Ordini) | Utente, con screenshot: «filtri così non funzionali, su mobile occupano il 30% della pagina» (misurato: 37-40%). Studio con la giuria piena: censimento (Explore) + architetto-ux (HIG/M3/NN-g/Polaris/Pajamas) + **ostile** (4 confermati, 6 demoliti con rimedio) | **Regola nuova del Libro v1.2 §8 «la zona filtri di un elenco»**: tetto 2 righe a pannello chiuso (collaudo: prima riga dell'elenco nella prima schermata a 375×812), fasce a breakpoint, eccedenza dietro «Filtri (N)» chiuso di default, primaria UNA e nella stessa riga del bottone, ordinamento fuori da N, disclosure accessibile sul web (mai checkbox-hack), «Filtra» legittimo nei form GET. **Implementata e IN PRODUZIONE su 5 app**: Scout (Ordini/Dashboard/Storico dietro il pannello, prop `primaria` di PannelloFiltri, «Mostra N risultati», 5 scroll orizzontali vietati eliminati, Chip+GruppoScelta condivisi in ui.tsx — misurato sul dev server: zona filtri di Ordini da ~330px a **136px, 17%**), Anagrafiche (5 pagine, `ZonaFiltri` con N dai searchParams), Finance (6 pagine; 6 già nel tetto non toccate), Orders (clienti da 5 card a UNA; rimosso il checkbox-hack M7 e il suo `display:none` globale che nascondeva zone intere su mobile), Customer Service (5 select nel pannello; pillole dei passi e ricerca sempre visibili). Già conformi, nessun cambio: **Tasks** (riferimento riga-unica), **CRM**, **piattaforma** (segmented quick-tabs + viste salvate), Hub/Fondo/Calendario/Acquisti (senza zone filtri da elenco). tsc/build verificati, deploy CLI tutti a exit 0 |
| 28/08 | **Anagrafiche** | (coda del punto drawer) deploy prima bloccato dal classifier | Deploy riuscito al secondo giro: focus-trap + padding mobile + ZonaFiltri ora **live** |
| 28/08 | **tutte** | «Tutti i menù drawer devono essere a sinistra» (utente, con screenshot del Hub che scivolava da destra) | **Regola nuova del Libro v1.1 (§2)**: drawer di menu sempre da sinistra (`left:0`, chiuso `translateX(-100%)`, `border-right`). Censimento: l'unico fuori regola era il **Hub** (corretto su scoutwt e deployato); Anagrafiche, AI Mail, CS, Orders, Transactions, piattaforma già a sinistra |
| 28/08 | **search-supplier** | Deferiti della passata su `main`: badge senza dot, empty-state, emoji→SVG, chip `<div>` | Chiusi (commit `c81349d1`, push su main = deploy): badge alla formula con `.bdot` (~14 siti), chip categorie `<button>` + `font:inherit`, `#resultsEmpty` icona SVG e `#noResults` con icona+titolo, icone funzionali → costanti `ICO` SVG (tel/wa/mail/archivio/Shopify/foto/utente/cerca) e dot su chip apertura. **Restano di proposito** le emoji nei punti a `textContent` (bottoni «📋 Copia» coi toggle, `<option>`, riga di stato, ST_TIPO passato da `esc()`) e nei testi: lì l'HTML non renderizza o è contenuto (Libro §icone). Sintassi JS + DOM verificati in locale |
| 28/08 | **Scout** | Migrazione COMPLETA di `lib/theme.ts` ai token DS | Chiusa (commit `61ce9bde`, deploy web verificato ✓): chiavi in collisione rinominate in 76 file PRIMA dello swap (spacing md16/lg24/xl32 → lg/xxl/xxxl DS; radius sm/md/lg → s/m/l, valori identici), poi `theme.ts` attinge da `lib/ds.ts` (copia locale del DS v1.4 — Metro non importa fuori root). tsc pulito, zero residui |
| 28/08 | **scoutwt/DS** | Copia DS ferma alla 1.3 | Allineata alla v1.4 + copiati Libro UX&UI (v1.1) e Libro Sicurezza. I registri SEGNALAZIONI restano SOLO in `app/` (registro unico vivo, niente seconda copia che invecchia) |
| 28/08 | **Calendario** | Errore DB dentro `.vuoto` | Card d'errore `red-soft` con titolo + «Riprova» (link alla stessa URL); il messaggio da sviluppatore «Imposta DATABASE_URL…» ora va in `console.error` (Libro cap.6, legge 9 lo vieta all'utente). Build ✓, **deployato in produzione**; commit solo locale (repo GitHub ancora mancante) |
| 28/08 | **Anagrafiche** | Drawer mobile senza focus-trap; padding mobile 40/24 | `ScrimSidebar` ora intrappola Tab nella sidebar a drawer aperto (≤800px) e restituisce il focus all'hamburger alla chiusura (MutationObserver su `data-sidebar-chiusa`); `.main` su mobile 20/16. tsc ✓, pushato — deploy da lanciare (riga «In attesa») |
| 27/08 | tutte | Nasce il Libro UX&UI: ~140 divergenze censite su 10 app, giuria a 3 lenti + revisione ostile | Libro v1.0 + DS v1.4 + piano P0/P1/P2 (Libro, Appendice B) |
| 27/08 | 10 app web | Copie `tokens.css` ferme alla v1.0 | Propagata la v1.4 + token v1.4 in `platform-next/web/styles.css` |
| 27/08 | **Hub** | Adeguamento P0/P1/P2 | focus oro, tabella sticky, empty-state, conferma elimina utente, loading+SubmitButton, asterischi rossi, login raggruppato, responsive; **+ drawer laterale mobile** (hamburger+scrim). tsc+build ✓, pushato |
| 27/08 | **Fondo** | Adeguamento | bug `.tabella` inesistente (3 tabelle Tips), nav attiva, badge alla formula, empty+loading, th sticky, prima @media a 900; deroghe annotate. tsc+build ✓, pushato |
| 27/08 | **Tasks** | Adeguamento | focus, badge, errori inline per-campo, «Archivia» con conferma+vista Ripristino, logout, empty+loading. tsc+build ✓, pushato |
| 27/08 | **Piattaforma** | Adeguamento | 8 `.page-header` rotti definiti, `.error-card`/`.ok-card` mancanti, **mappa stati unica** (`stati-consegna.ts`: not_delivered rossa ovunque), oro→orange, sidebar collassata mostra logo+logout. ng build ✓, pushato |
| 27/08 | **Finance** | Adeguamento | bug sidebar mobile (style inline), conferma narrativa sugli 8 delete nudi, empty con azione, loading, PartnerForm in sezioni. tsc+build ✓, pushato |
| 27/08 | **AI Mail** (scoutwt) | Adeguamento | classi bottone rotte, token fantasma, voci nav con query, icone nav, login raggruppato+footnote, toast alla formula. tsc+build ✓. scoutwt `scout-ui` pushato (no deploy) |
| 27/08 | **Anagrafiche** (scoutwt) | Adeguamento | focus oro, badge alla formula, th sticky, asterischi rossi, empty+loading, **navigazione mobile (drawer)**. tsc+build ✓. scoutwt pushato |
| 27/08 | **Scout** (scoutwt) | Adeguamento conservativo | StatusBar bug, palette-ombra badge→token semantici, bersagli 44px, oro→stato, login radius; token additivi (no swap). tsc ✓. scoutwt pushato **+ deploy web in produzione** (deluxy-scout.vercel.app) |
| 27/08 | **CRM · Personale · Acquisti · Calendario** | Passata UX | focus oro, :focus-visible, asterischi rossi, loading, badge/titolo dove divergevano; molte già conformi post-token. tsc ✓ (build ✓ Acquisti). Le prime 3 pushate; Calendario gitignorata (locale) |

## Passata integrale su PERSONALE (29/08/2026) — 7 esami + 3 revisioni ostili

Nata da una segnalazione dell'utente: «la tabella di deluxy-personale.vercel.app non rispetta
l'architetto su come devono essere tutte le tabelle». Metodo: il custode ha emesso il verdetto sulle
tabelle; 6 agenti (ux-desktop ×3, ux-mobile ×3) hanno esaminato **11 pagine** sul dev server;
le **49 accuse** raccolte sono passate da 3 revisioni `ux-ostile` (layout · form ed esiti · coerenza).

**Esito: 26 accuse reggono, 5 cadono, 18 ridimensionate.**

### ⚠️ Trappola di misura scoperta dagli ostili (vale per ogni futuro esame browser)

Col pannello del browser nascosto, `innerWidth` è **0** e Next non completa lo swap del boundary
Suspense: il contenuto resta in un `div#S:0` **figlio diretto di `<body>`**. Chi si limita a togliere
`hidden` misura su tutta la larghezza della finestra invece che dentro `.contenuto` — **ogni misura
orizzontale esce gonfiata**. La via giusta è `$RV($RB)`, che riloca nel contenitore vero. Verificato:
i sei accusatori l'avevano usata (numeri coincidenti entro 1-3px su 9 misure indipendenti).
Il «Caricamento…» che si vede è **cold start del dev server, non un guasto dell'app**.

### Confermate — con danno reale all'utente

1. **La ricerca dà risultati sbagliati con l'aria di essere giusti**: ricerca e «Filtra» sono due
   `<form>` separati e il secondo porta la `q` **dell'URL**, non quella digitata. Da `/?q=Edoardo`,
   digitando «Luca» e cliccando «Filtra» si torna a Edoardo con una lista coerente e plausibile.
   La ricerca funziona solo con Invio, che nessuna etichetta annuncia.
2. **I KPI mentono a un click**: sono calcolati sull'insieme filtrato ma le etichette parlano
   dell'azienda — `/?stato=cessati` dichiara «Persone attive 0» e «nessun compenso con contributi
   dichiarati» mentre i dati ci sono. Prova che non è deliberato: il KPI «Funzioni» esce da una
   query separata e NON segue il filtro (la riga è un miscuglio, non un riepilogo del filtrato).
3. **Un errore di validazione cancella il lavoro**: `conErrore` fa `redirect(?err=)` senza i campi.
   Scrivendo una RAL come «28.500 €», sulla scheda persona si perdono 6 campi e il messaggio compare
   a **3353px (4,1 schermate)** dal campo colpevole. La capacità di conservarli esiste già ed è usata
   solo nel giro dell'omonimia.
4. **Una mail al commercialista parte con un click**, destinatario precompilato, senza passo di
   conferma (l'anteprima del testo c'è: manca il passo).
5. **Un refresh ripropone «Rapporto inviato»**: l'esito vive in `?nota=` e non viene ripulito.
6. **«Crea la persona» resta muto fino a 4 secondi** (dietro c'è la proposta a Budgets, timeout 4000 ms):
   nessun `useFormStatus`, nessun disabled — l'utente ri-clicca.
7. **Mobile — la sidebar non diventa drawer**: 278px (34% di 812) su ogni pagina, con le 8 voci su
   8 `top` e 3 colonne diverse, una orfana in mezzo: griglia rotta dal `flex-wrap`.
8. **Mobile — le 7 tabelle non diventano schede**: 51-61% fuori schermo; su una scheda persona il
   bottone «Elimina» sta a 668px dentro una finestra da 291.
9. **Mobile — 27 bersagli su 27 sotto i 44px**; `--touch-min` è definito e mai consumato; input a
   14px (zoom iOS a ogni tocco).
10. **Mobile — la CTA sotto la tastiera con lo scroll esaurito** (`/persone/nuova`: bottone a 808,
    visibili 586, `maxScroll` finito).
11. **La prima riga dell'elenco a 1165px** su una piega di 812. ⚠️ Causa mal attribuita dagli
    accusatori: non è la zona filtri (124px) ma la sidebar (278) e i 4 KPI impilati (501).
12. **Desktop 1366×768 — 35px su 50 di ogni «Costo azienda» tagliati** su 11 righe: la colonna
    Contratto è larga 232px per il badge «Stage / tirocinio dal 01/09/2026» in `white-space: nowrap`.
13. **Le intestazioni non si fermano**: `th` non sticky e wrapper senza `max-height` (th a top −302).
14. **25 campi su 25 con label non associate** su /funzioni, **16 senza alcun nome accessibile**.
15. **L'oro dice sia «inviato» sia «non configurato»** sulla stessa pagina (il canone del successo
    è la nota verde: la citazione giusta è §7, non §5).
16. **Sul login 9 link focalizzabili prima della password** (il layout monta la sidebar sotto l'overlay).
17. Minori confermati: `aria-current` assente; select dei filtri senza nome accessibile; tre `✎` muti;
    CTA di /cartellini attiva mentre la pagina dichiara l'invio spento; messaggi con nomi di variabili
    d'ambiente e «Il Hub risponde 500»; «Torna all'elenco» cablato che butta i filtri; il segreto della
    chiave senza «Copia»/«Ho finito»; `/chiavi` con un `inCorso` condiviso che fa annunciare «Creo…»
    al bottone sbagliato durante una revoca; scheda persona da 6,4 schermate con 6 primari neri;
    15 celle (non 24) marcate «non applicabile» dove sono «da compilare»; `.card-sub` senza tetto.

### Cadute (accuse demolite)

- **Indentazione dell'organigramma** (41px/livello «senza tetto»): l'albero vero è profondo **2**, la
  scheda più stretta misura 939px. Il livello 6 proiettato non esiste.
- **«4 bottoni primari per vista» su /funzioni**: sono 4 form indipendenti in 4 card. La legge 2
  governa le primarie che competono nella stessa decisione.
- **L'oro sulla «mansione principale»**: il §5 dice il contrario dell'accusa — l'oro-identità resta.
- **Le tinte `-soft` hardcodate**: scarto di 0,01 di alpha = **2 valori su 255**, invisibile, e i
  token del repo sono byte-identici alla fonte. Igiene, non difetto.
- **La footnote del login**: la frase prescritta c'è; l'aggiunta sull'Hub è aiuto, non nota tecnica.
- **Sub-accuse cadute dentro accuse vere**: «le chip vanno a capo» (non wrappano: stanno su una riga
  a 205px di 341); «`.btn.mini` 28,4px» sulla home (lì è 39px, stirato dal form); «l'esito fuori
  schermo su /chiavi» (con 2 chiavi la pagina è alta esattamente quanto la viewport);
  «sei Salva identici» sulla scheda (sono sei verbi diversi e giusti); «senza riepilogo di cosa parte»
  su /cartellini (l'anteprima c'è); «fabbricabile dall'URL» (l'app è dietro login: si inganna solo sé).

### Due contraddizioni DEL LIBRO da arbitrare (non sono difetti dell'app)

- **§3 vs §10.1 sul bottone piccolo**: `.btn.mini` misura 28,4px, ma il `.btn.small` **del Libro**
  («5×13, 12.5px») produce **28,4px identici**, e §3 v1.8 fissa il minimo desktop a ≥28px mentre
  §10.1 dice ≥32px. L'app implementa alla lettera il canone e veniva accusata di averlo fatto.
  **Da decidere una volta per tutte: se si alza `.btn.small`, cambiano TUTTE le app.**
- **La riga dei totali in `<tfoot>`**: il custode la propone come voce nuova (§8 v1.11), ma nel
  metro vigente (v1.10) `tfoot` non è nominato. Finché non è promulgata, l'app non viola nulla.

### Tensioni fra le correzioni (chi tocca una deve guardare l'altra)

- La **conferma che attutisce la × a 0px dal nome** su /funzioni è lo stesso `window.confirm` che
  un'altra accusa chiede di rimuovere: chi migra le conferme deve prima separare quei due bersagli.
- La **`max-height`** chiesta per le intestazioni sticky mette una scrollbar verticale nella stessa
  card che ha già 49px di eccedenza orizzontale: **prima si stringe la colonna Contratto**.
- **Rendere cliccabile tutta la scheda dell'organigramma** aggrava il rischio dell'altra accusa
  (la tendina «riporta a» che salva subito all'onChange, a ~700px dal nome).
- La utility `tabelle-a-schede` della piattaforma **non si copia alla cieca**: quest'app ha **8 celle
  con `colSpan`** in 4 tabelle (totali e stati vuoti), che un porting per indice etichetterebbe male.
- Il **cookie flash** al posto della querystring **non regge in RSC** (un Server Component non può
  cancellare un cookie durante il render): la via è PRG + `history.replaceState` da client.

### Buco di parco (non di questa app)

`.cella-manca` — la terza gamba della tripletta delle celle vuote del §8 — **non esiste in nessun
file dell'intero repo `app/`**. È un'adozione mai fatta, non una sciatteria di Personale.

---

## Hub — il menu laterale riordinato per materia (30/08/2026, richiesta dell'utente)

**Richiesta**: «rivedi menù laterale in modo logico» (screenshot del Hub allegato in chat).
**Fatto**: riordino applicato e verificato in locale, desktop 1440 e telefono 375.

Cosa non tornava, e la regola dietro ogni correzione:

1. **La stessa materia stava in due gruppi lontani.** «Cartellino» era sotto PRESENZA,
   «Gestione cartellino» in fondo ad AMMINISTRAZIONE, dopo Utenti/Chiavi/Stato: chi cercava
   le ore del team le trovava in mezzo a segreti e servizi. Ora le presenze stanno **tutte**
   nel gruppo *Presenze* («Il mio cartellino» + «Gestione cartellini»), e *Amministrazione*
   resta il governo dell'impianto (chi entra, i segreti, la salute delle app).
2. **Il nome nel menu diverso dal titolo della pagina** (legge 11: stessa entità, stesso nome
   ovunque): «Installa» apriva una pagina intitolata «Installa le app» — e per giunta faceva
   pensare a installare *il Hub*, mentre quella pagina parla di portarsi sul telefono **tutte**
   le app Deluxy. Ora la voce si chiama come la pagina. Stessa cosa per «Gestione cartellino»
   → «Gestione cartellini».
3. **«Cartellino» → «Il mio cartellino»**: ora che le due voci sono adiacenti, la cosa da dire
   è *di chi* sono le ore. Allineato anche il titolo della pagina.
4. **Bersagli sotto soglia nel cassetto mobile** (legge 4): a 375px le voci misuravano **33px**,
   sotto i 44 di `--touch-min`. Aggiunto `min-height: 44px` alle voci dentro la media query del
   cassetto (≤800px), dove si tocca col dito; sopra quella soglia la sidebar è una colonna da
   mouse e resta compatta a 33px. Verificato: 33 → 44/47px, desktop invariato.

Nessuna voce è stata tolta (regola dell'utente: si stringe la cornice, non il numero dei comandi).

### Da arbitrare — due soglie mobile nella stessa app (§2 chiede UNA soglia)

Il Hub ne ha due: il guscio (sidebar→cassetto, e il JS `suTelefono()` di `ToggleSidebar`)
commuta a **800px**, mentre form e bottoni a **900px**. Sono coerenti tra loro a coppie e
nessuna delle due è rotta, ma il Libro §2 vuole una soglia sola dichiarata in un punto per app.
Non toccata in autonomia: allinearle significa spostare il guscio di tutte le pagine.
**Decisione del custode richiesta**: portare il guscio a 900 (canone) o annotare la deroga
nel README del Hub.

### Trappola di misura incontrata (vale per chi verifica, non per l'app)

Il cassetto mobile sembrava **non aprirsi**: con `data-menu-aperto` presente e la regola giusta
nel foglio, il `transform` calcolato restava `translateX(-100%)`. Non era un difetto dell'app:
il pannello browser **non aveva il focus** e la **transizione CSS non avanzava**, così la misura
leggeva il fotogramma iniziale. Togliendo la transizione il valore corretto compare subito.
⚠️ Misurando una proprietà **in transizione** in un pannello senza focus si legge il valore di
partenza: neutralizzare la transizione prima di misurare, o misurare una proprietà non animata.

## Decisa il 30/08/2026 — riordino del menu di PERSONALE, e tre regole nuove per tutte le app

Richiesta dell'utente («l'organizzazione del menù» di `deluxy-personale`), gemella di
quella su Budgets già in attesa. Il custode ha letto le 8 pagine — non i nomi — prima di
decidere. **Applicato sull'app** (commit di Personale del 30/08):

| Prima | Dopo | Perché |
|---|---|---|
| Sezione «Configurazione» con **1 voce** | accorpata: «Chiavi delle app» in fondo, staccata da una spaziatura, senza etichetta | regola del 28/08 (le sezioni monovoce si accorpano) |
| Sezione «**Amministrazione**» | «**Contratti e paghe**» | vedi regola B: l'app propone «Amministrazione» come esempio di FUNZIONE aziendale (`funzioni/page.tsx:73`) — la stessa parola era una sezione del menu e un reparto |
| Stipendi · Benefit · Inquadramenti · Cartellini | **Cartellini** · Stipendi · Inquadramenti · **Benefit** | Cartellini è l'unica voce con cadenza garantita e controparte esterna (il commercialista, ogni mese); Benefit ha la cadenza più bassa e una seconda via di scrittura sulla scheda |
| Icona «Funzioni» = griglia 2×2 | elenco puntato senza cornice | la griglia 2×2 è il glifo universale di «tutte le app» (App Library iOS, `apps` di Material): diceva la cosa sbagliata, ed era il vicino più somigliante dell'organigramma che le sta sopra |
| KPI «Contratti in scadenza» **non cliccabile** | link a `/inquadramenti` | dichiarava un allarme e non portava da nessuna parte: si doveva scendere nel menu e indovinare sotto quale voce |

**Confermato e NON toccato** (perché un riordino si paga in memoria muscolare): la sezione
Organico e il suo ordine interno; i nomi «Funzioni e mansioni» / «Inquadramenti» (nessuna
sovrapposizione: catalogo impersonale vs quadro per persona, e per un HR «inquadramento» è
il termine esatto); «Stipendi» / «Benefit» (denaro in busta vs beni in natura). Organigramma
e Funzioni restano **due voci**: due assi indipendenti — l'albero nasce da
`Persona.responsabileId`, le funzioni da `Funzione → Mansione → Attività`, e una persona può
stare in Operations e riportare a qualcuno di Commerciale.

**Scostamento accettato e dichiarato**: «Stipendi» è stretto per i consulenti P.IVA, che nel
roster ci sono. Non rinominato a «Retribuzioni» perché la pagina gestisce già il caso al suo
interno (KPI «Monte lordi annui (RAL e compensi)», e la card che diventa «Compenso» per gli
autonomi): perdere la parola più cercata del menu per una precisione già presente nella
pagina è un cattivo scambio.

⚠️ **Precondizione dichiarata dal custode**: promuovere Cartellini in testa alla sezione
mette in evidenza un lavoro che oggi non si chiude, perché `MAIL_API_KEY` manca e l'invio al
commercialista è spento. Dal 30/08 la chiave si incolla nella **cassaforte del Hub**
(progetto `personale`) e Personale la legge: fino ad allora la pagina lo dichiara e tiene il
bottone spento.

### Tre regole NUOVE proposte per il Libro §1 (valgono per tutte le app)

**A — L'ordine per frequenza quando la frequenza NON è misurata.**
Quasi nessuna app Deluxy ha conteggi per rotta, quindi «ordinare per frequenza» (regola del
28/08) diventa il gusto di chi scrive. Se mancano i conteggi, l'ordine si fonda su tre
osservabili **dichiarati nel commit**: (a) cadenza del dato sottostante, (b) numero di link
in entrata da altre pagine, (c) esistenza di un appuntamento esterno con scadenza. A
frequenza ignota o pari, **la voce con cadenza garantita e controparte esterna sta sopra la
voce consultata a piacere** (una chiusura mensile saltata costa denaro, una consultazione
rimandata no). Chi ordina scrive anche il **falsificatore**: quale misura ribalterebbe la
scelta. *Un riordino senza falsificatore non si applica.*
*App toccate:* tutte quelle con sidebar e senza analitiche — Personale, **Budgets** (richiesta
gemella in attesa), Anagrafiche, Tasks, Fondo, CRM, Marketing.

**B — L'etichetta di sezione non usa una parola che l'app usa già come DATO.**
Un'etichetta di sezione non può coincidere con un valore di dominio (uno stato, un reparto,
una categoria che l'utente digita o sceglie). Se coincide, si rinomina la sezione, mai il
dato. *Perché:* NN/g, ogni categoria ha un'identità unica — un utente che scrive
«Amministrazione» come nome di funzione e poi la legge in maiuscolo nel menu non sa se il
menu parla di lei. *Misura:* grep delle etichette di sezione contro i vocabolari dell'app
(enum, placeholder, valori seed) → **zero coincidenze**.
*App toccate:* Personale (caso di partenza); da verificare su **Finance** e **Anagrafiche**,
dove sezioni e stati condividono lo stesso lessico.

**C — Si raggruppa per SCOPO dell'operatore, mai per proprietario del dato.**
Le sezioni si formano su cosa l'operatore sta facendo. Il proprietario del dato
(Standard §7), l'app di provenienza e la tabella di origine **non entrano mai** nel
raggruppamento: se una voce legge da un'altra app, sta dove il lavoro la mette. *Perché:* con
14 app che si leggono a vicenda via `/api/v1` il rischio è sistematico — menu che riflettono
l'architettura invece del mestiere. Caso concreto: Cartellini legge dal Hub, ha una
popolazione diversa (righe per email) e zero link alla scheda persona, eppure sta con le
paghe, perché chi lavora pensa «cartellino → busta paga». *Misura:* per ogni sezione si
scrive in una riga lo scopo che la lega; se la riga suona come «i dati che stanno in X», la
sezione è sbagliata.
*App toccate:* tutte quelle che leggono dati altrui in una pagina propria — Personale, Budgets,
CRM, Customer Service, la piattaforma consegne.

**D — Chiarimento alla regola del 28/08 (non è una regola nuova).** «Tooltip e separatore in
modalità ridotta» vale **solo se una barra ridotta esiste**. Dove l'etichetta è sempre
visibile non si aggiungono `title` sulle voci (doppiano l'etichetta per lo screen reader).
Resta invece valido l'obbligo di **icona univoca**: l'icona è il bersaglio della scansione
veloce anche con l'etichetta accanto. Criterio di accettazione da usare al posto dell'occhio:
due icone adiacenti devono differire per **classe di silhouette** (chiuso/aperto,
incorniciato/libero, curvo/spigoloso), non per numero di forme, e il confronto si fa **a 19px
affiancate nel loro ordine reale**, non ingrandite e isolate.

## Hub — §8 v1.6 attuata sui cartellini: il dettaglio si apre dalla riga (30/08/2026)

**Segnalazione dell'utente**: «non rispetta regola del dettaglio al click» (tabella «Le
timbrature di tutti», Gestione cartellini). **Confermata**: il dettaglio si apriva solo dal
comando «Timbrature» in fondo alla riga.

**Attuata** con un componente client (`RigaPersona.tsx`), con tutte e quattro le guardie del §8
v1.6: `closest("a,button,input,select,label")` perché le azioni dentro la riga non facciano
partire l'apertura; riga dichiarata (pointer + hover + filo oro da aperta); comando da tastiera
con `aria-expanded`/`aria-controls`; e **chi non ha dettaglio non finge** (niente pointer, la
cella dice «nessun dato»). In più il dettaglio è passato dall'ultima colonna a una riga con
`colSpan` a tutta larghezza. Verificato in produzione con click reale.

### Trappola di verifica da mettere a canone (vale per ogni app React)

**Un click sintetico non innesca l'idratazione pigra.** Verificando dal pannello con
`element.click()` (`isTrusted: false`) su una pagina appena caricata, sembrava che nulla
funzionasse: riga che non si apre, ricerca della home che non filtra, **orologio del cartellino
fermo su `--:--:--`**. Nessuno dei tre era un guasto: React idrata su interazione, e un evento
non fidato non fa scattare il replay. Con un **click vero** (o dopo una navigazione interna)
tutto risponde — misurato: orologio 08:05:35 → 08:05:37, riga aperta al primo colpo.
⚠️ Chi verifica un'interazione deve usare il click del driver (o navigare prima), altrimenti
apre segnalazioni per difetti che non esistono. È parente della trappola della transizione
misurata senza focus (voce precedente).

## 31/08/2026 — Piattaforma consegne: passata mobile del custode (2 proposte di voce nuova)

**Proposta §8-ter «La legenda di un elenco»** (dal custode, 31/08): la legenda
colori/stati vive solo dalla soglia mobile in su; sotto NON si monta — lo stato
si porta il nome sulla scheda (§5), che la rende ridondante per costruzione.
Misura: a 375×812 la legenda di Consegne costa ~250px (5–9 righe a wrap) prima
della prima scheda. Collaudo: prima scheda nella prima schermata (come §8.1).
STATO: applicata alla piattaforma come correzione locale in attesa di
approvazione nel Libro (v1.11).

**Proposta §4 «Il form di creazione in testa a un elenco»**: sta chiuso dietro
un bottone nel page-header; aperto di default SOLO se creare è il compito
primario della pagina per quel ruolo (es. partner in Preventivi), annotato.
Misura: a 375×812 il form Preventivi costa ~600px prima dell'elenco.
STATO: applicata alla piattaforma (form ufficio dietro bottone; partner resta
aperto, deroga annotata) in attesa di approvazione nel Libro.

## 28/08/2026 — Scout: il campo che il contesto già conosce (segnalazione utente, con screenshot)

Aprendo **Nuovo task dalla scheda di un negozio**, il campo «Contatto» partiva
come una **ricerca vuota in tutta la rubrica** — anche quando quel negozio ha
**un contatto solo**, mostrato peraltro due riquadri più sotto nella stessa
pagina. L'utente ha scritto la cosa giusta: «ma il contatto è già quello
giusto». Misura sui dati veri: **537 negozi hanno esattamente un contatto**
(su 946 con almeno uno), quindi nel caso più frequente si chiedeva di cercare
un valore che l'app conosceva già.

È la stessa cosa già decisa il 27/08 su Anagrafiche
([trappola-campo-ereditato-mostrato-vuoto], regola dell'`architetto-ux`): un
modulo che crea un figlio dentro un padre non deve mostrare vuoto un campo che
il padre determina. Applicati qui i **tre regimi**:
· **un contatto solo** → precompilato col valore vero + nota che nomina la
  fonte («Il contatto del negozio — cambialo o toglilo se non è lui»);
· **più contatti** → NON se ne sceglie uno (sarebbe inventato): si mostrano
  pronti da toccare, con la ricerca che resta accanto;
· **nessuno** → la ricerca di sempre.
⚠️ La proposta si fa una volta sola: togliere il contatto con la × è
un'affermazione dell'utente, e rimetterlo sarebbe discutere con lui.

STATO: **applicata a Scout come correzione locale** (`components/SceltaContatto.tsx`).
**PROPOSTA per il Libro**: la regola dei tre regimi è nata su Anagrafiche ed è
ora applicata su due app, ma nel Libro UX&UI non c'è ancora una voce — vale la
pena scriverla come «il campo che il contesto già conosce non si chiede»,
perché ogni form che nasce dentro un contesto (task da negozio, riga da ordine,
richiesta da cliente) incontra la stessa scelta.

## 31/08/2026 — Scout: «i miei task» non comprendeva quelli che ho assegnato io

Segnalazione dell'utente: «perché non si vedono le task che ho creato per Martina
Calia?». Il filtro di default si chiamava «Assegnati a me» e chiedeva al database
solo `owner = io`: un task delegato **spariva dalla vista di chi lo aveva appena
scritto**, che è il momento in cui uno si aspetta di vederlo. Restava sotto
«Tutti», in mezzo a cose che non lo riguardavano.

Il difetto non era la query ma la **tassonomia**: due filtri per tre casi
(assegnati a me · che ho assegnato · di altri). Correzione: «I miei task» =
assegnati a me **oppure creati da me** — è ciò che una persona intende dicendo
«i miei», e la riga mostra già l'assegnatario, quindi non si confondono. Il
secondo filtro diventa «Di tutta la squadra» e ora è vero per chiunque
(vedi SEGNALAZIONI-SICUREZZA, migr. 0108). Misura: per l'utente «i miei» passa
da 2 a 7 righe, e le 5 che comparivano erano tutte sue deleghe.

STATO: applicata a Scout (`lib/db.ts`, `task.tsx`, `da-completare.tsx`).
**PROPOSTA per il Libro**: «chi delega resta nella lista» — ogni app con un
assegnatario (task, incarichi, richieste) ha lo stesso trivio, e il default
«assegnati a me» nasconde sempre il lavoro appena delegato.

---

## 01/09/2026 — Piattaforma consegne: «Gestione dell'ordine» illeggibile da telefono (segnalata dall'utente, corretta su suo mandato)

Nel form consegna il blocco prodotti stava su una griglia a 3 colonne (ricerca ·
quantità · ✕): sotto i 640px la ricerca si strizzava e il blocco diventava
illeggibile (screenshot dell'utente, 01/09). Correzione applicata nello stesso
giro per ordine diretto dell'utente («fai tutte queste cose»): sotto i 640px la
riga si IMPILA — ricerca a tutta larghezza con testo a 16px (sotto i 16px iOS
zooma da solo sul focus), quantità sotto, ✕ ancorata in alto a destra della
card, tendina risultati a tutta larghezza.

STATO: applicata (delivery-form.component.ts, media query 640px, deploy 01/09).
**PROPOSTA per il Libro**: le righe-composte (input+numero+azione) si impilano
sotto i 640px, e gli input testuali su mobile non scendono mai sotto i 16px.

## 31/08/2026 — Scout: «Visita» via dalla barra della scheda negozio

Richiesta dell'utente sulla scheda di un negozio (`/attivita/<id>`): «nascondi
Visita». Era la **prima** azione e l'**unica primaria** (pillola nera), quindi
la scheda si apriva proponendo il giro in negozio — mentre il lavoro di quella
pagina è il **contatto** (chiama · WhatsApp · email · task · trattativa).

⚠️ Non è la regola «non togliere azioni» [feedback dell'utente sul CS]: quella
vale quando si toglie per far spazio. Qui è una scelta esplicita di priorità, e
**l'azione non spare dall'app**: la visita si registra da Potenziali, Mappa,
Contatti, Clienti, «Per interesse» e «Da fare», e la rotta resta valida.

⚠️ Conseguenza gestita, non ignorata: togliendo l'unica primaria la barra
restava tutta bianca, mentre il DS vuole **una** primaria per schermata.
«Chiama» prende quel posto perché è il primo passo della sequenza di contatto —
non per riempire un buco di stile.

STATO: applicata a Scout. **Da valutare come regola**: quando si nasconde
l'azione primaria di una barra, la primaria si RIASSEGNA (al primo passo del
lavoro di quella schermata), non si lascia il vuoto.

## 04/09/2026 — Piattaforma consegne: tre segnalazioni dell'utente, applicate su suo mandato

1. **«Crea prodotto» non produceva nulla (partner Chanel, form consegna).** La
   finestra «Nuovo prodotto» usava le classi `overlay` / `dialog` / `dialog-foot`
   **senza averne lo stile nel componente**: gli stili Angular sono per
   componente e quelle regole vivevano solo nel dettaglio consegna. La
   «modale» renderizzava come un blocco in fondo alla pagina, sotto il piede
   sticky: invisibile per tutti i ruoli. Corretto copiando le regole del
   dettaglio (Libro §9). **Da valutare come regola**: overlay e dialog sono
   UN componente condiviso (o un foglio globale), non una classe da
   ricopiare pagina per pagina — la quarta copia era quella senza CSS.
2. **«Duplica» anche in visualizzazione sullo storico (partner).** Stava
   sotto `canEdit()` e spariva insieme a «Modifica» da gialla in poi; ora ha
   la sua condizione (ufficio sempre, partner su ogni sua consegna tranne le
   vendite). Regola confermata: un'azione che NON modifica il record non
   eredita i limiti di chi lo modifica.
3. **Pattern nuovo per il Libro — le liste si aggiornano da sole** (regola
   utente: «l'app si deve aggiornare in automatico»). `avviaAutoAggiornamento`
   (30″) su Consegne, Vendite, Segnalazioni, Attività, Richieste, Ricevute:
   solo a scheda visibile, sospeso con pop-up/azioni aperte, ricarica
   silenziosa che conserva filtri e selezione. Insieme a chat e pallini fa
   il capitolo «tempo reale senza websocket» che il custode deve scrivere.

STATO: applicate (deploy 04/09). Punti 1 e 3 in attesa del custode per la regola.

## 04/09/2026 (2) — Piattaforma consegne: la home del partner torna, ma per pochi

Regola utente: «solo per chanel_consegne@deluxy.it ricrea la pagina home con la
lista dei servizi che possono essere richiesti». La vetrina `/home` (nascosta
dal 31/08 perché mostrava le linee commerciali di Scout a chi voleva solo
inserire una consegna) rinasce come **pagina dei servizi del listino del
partner**: una tessera per servizio (modello + prezzo), che apre il form con
il servizio già scelto. Si accende **per email** da Impostazioni
(`homePartnerEmails`), non per ruolo: il flag `homeVetrina` arriva col login e
decide atterraggio e voce di menu. Pattern da valutare per il Libro: **una
funzione «per alcuni» si accende da un'impostazione leggibile dall'ufficio, non
da un'email cablata nel codice**. La data non si eredita sul Duplica dallo
storico (stessa giornata).

STATO: applicata (deploy 04/09).
