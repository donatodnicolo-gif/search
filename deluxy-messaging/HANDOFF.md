# Handoff — Deluxy Messaggi

Ultimo aggiornamento: 24/07/2026

## FATTO

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

- Database di produzione: creare lo schema/istanza Postgres e fare `npm run db:push`.
- Deploy (Vercel) + `APP_URL_MESSAGGI` nel Hub.
- App Meta reale: registrare il webhook, generare token permanenti, collegare la pagina
  FB e l'account IG professionale. Nota: fuori dalla finestra di 24h Meta rifiuta i
  messaggi liberi (serviranno i template WhatsApp — non ancora gestiti).
- Media in entrata (oggi mostrati come `[tipo]`) e allegati in uscita.
- Più operatori/assegnazione conversazioni; notifiche push.
- Ordini/contatti: credenziali reali (token Shopify, progetto Google Cloud con People API
  e redirect URI autorizzato). Da valutare: cron Vercel per scarico ordini + salvataggio
  contatti automatici; collegare un ordine alla conversazione WhatsApp del cliente.
- Costi WhatsApp (listino Meta 1/7/2026, per messaggio): Italia — Marketing €0,0658,
  Utility/Authentication €0,0248, Service (risposte entro 24h) gratis.

## Come riprendere

`cd deluxy-messaging && npm install && npm run dev` (porta 3140). Senza `.env` con
`DATABASE_URL` l'app non parte: vedi `.env.example`. Il manuale dell'app è nel README.
