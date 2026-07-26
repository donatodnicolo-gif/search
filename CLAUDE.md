# Repo Deluxy — regole per lo sviluppo

> 🧭 **Sessione nuova? Parti da [DA-DOVE-PARTIRE.md](DA-DOVE-PARTIRE.md)**: per ogni progetto dice cartella, porta, URL di produzione, **quale documento leggere per primo**, le trappole già pagate e il prompt di avvio pronto.
>
> 📘 **Non conosci Deluxy?** [DOSSIER-DELUXY.md](DOSSIER-DELUXY.md) è il briefing completo da dare anche a un'altra AI: business, glossario, regole di consegna, ecosistema delle app e chi possiede quale dato.

Questo repo contiene le app dell'ecosistema Deluxy: `deluxy-hub/` (portale unico di accesso con utenti e ruoli), `deluxy-platform-next/` (piattaforma logistica, staging moderno), `deluxy-anagrafiche/` (registro centralizzato partner/prospect B2B con API, fonte di verità delle anagrafiche), `deluxy-scout/` (app mobile prospezione), `deluxy-suppliers/` (app fornitori/smistamento ordini), `deluxy-partner/` (gestione finanziaria partner, sostituisce PARTNER.xlsx), `deluxy-marketing/` (memoria operativa ADV: analisi/audit, azioni con storia, campagne con guardrail, connettori Google Ads e Meta, dashboard per brand con MER, lettura AI, API della spesa reale per le altre app; porta 3130, live su deluxy-marketing.vercel.app), `deluxy-messaging/` (**Deluxy Customer Service**: reclami sugli ordini con casistiche, azioni da eseguire e colpa a valet o partner da cui nascono i giudizi; più gli ordini da lavorare e l'inbox unificata WhatsApp/Messenger/Instagram via API Meta + widget di chat per i siti; porta 3140 — la cartella resta `deluxy-messaging/`, è cambiato solo il nome dell'app), `deluxy-budgets/` (budget aziendali su 3 livelli — raggiungibile/sfidante/irraggiungibile — con P&L, premi, proposte dei responsabili e spese ADV, porta 3080), `deluxy-search-supplier/` (ricerca fiorai/pasticcerie + smistamento ordini Shopify via WhatsApp/Email; include il plugin in `plugin/`), `deluxy-orders/` (registro centralizzato degli ordini Shopify: import da Shopify, riclassificazione a piacimento — stato/pipeline, etichette, categorie, instradamento — ed esposizione alle altre app via API a chiave; porta 3150), `deluxy-scripts/` (archivio centralizzato degli script operativi: ogni script ha le sue variabili scritte `{{COSÌ}}` e si abilita o disabilita per singola app, che se lo legge già composto via API a chiave; porta 3170), `deluxy-transactions/` (registro sicuro delle richieste di pagamento: le altre app le inviano via API firmata, gli operatori le autorizzano con secondo fattore e doppia firma, ne esce la distinta SEPA per la banca; porta 3160), `sviluppi-siti-deluxy/` (temi Shopify), `deluxy-scout-manager/`.

> `deluxy-search-supplier/` è pubblicata su Vercel (progetto `search-deluxy`, **Root Directory = `deluxy-search-supplier`**) dal branch **`main`**: si sviluppa lì, non su questo branch. Spec: [deluxy-search-supplier/AI_SPEC.md](deluxy-search-supplier/AI_SPEC.md).

## Anagrafiche partner (deluxy-anagrafiche)

Le anagrafiche dei partner B2B vivono SOLO in `deluxy-anagrafiche/` (porta 3060): le altre app le leggono via API con chiave di sola lettura; l'unica app con chiave di scrittura è la piattaforma consegne (`deluxy-platform-next`), che sincronizza automaticamente ogni partner creato/modificato. Non duplicare dati anagrafici nelle altre app: integrare le API descritte in [deluxy-anagrafiche/README.md](deluxy-anagrafiche/README.md).

## Pagamenti (deluxy-transactions)

**Nessuna app Deluxy paga nessuno per conto proprio: `deluxy-transactions/`
(porta 3160) è l'unica da cui può uscire denaro.** Chi deve far uscire denaro
manda lì una richiesta via API firmata; una persona autorizza — con secondo
fattore e, sopra soglia, doppia firma — e il file di pagamento si genera **solo**
quando il *pagatore* (una persona sola, impostazione `pagatoreEmail`) sblocca con
un **codice ricevuto per email** più il suo **PIN**. Credenziali bancarie non ce
ne sono: l'ultimo passo lo fa un umano nel portale della banca. Se un domani si
collegherà una banca, l'esecuzione dovrà passare dallo stesso cancello
(`verificaCancello()` in `deluxy-transactions/src/lib/sblocco.ts`).
Integrazione: [deluxy-transactions/docs/API.md](deluxy-transactions/docs/API.md);
controlli e deviazioni dallo standard:
[docs/SICUREZZA.md](deluxy-transactions/docs/SICUREZZA.md).

## Portale (deluxy-hub)

`deluxy-hub/` è la porta d'ingresso: un utente accede con email e password e vede solo le icone delle app abilitate per il suo ruolo (`admin`, `partner`, `commerciale`). Le app restano autonome, il Hub le linka.

**Aggiungendo o rinominando un'app del repo, aggiornare il catalogo in [deluxy-hub/src/lib/apps.ts](deluxy-hub/src/lib/apps.ts)**, altrimenti l'app non è raggiungibile dal portale. Dettagli in [deluxy-hub/README.md](deluxy-hub/README.md).

## Script operativi (catalogo unico)

Tutti gli script del repo (deploy, migrazioni, import, setup chiavi, generazione asset) sono catalogati **per tipologia** in **[scripts/README.md](scripts/README.md)**, con il comando pronto da copiare e le variabili d'ambiente necessarie. Gli script restano nelle cartelle delle rispettive app: quello è l'**indice**.

**Aggiungendo un nuovo script, aggiungerlo anche al catalogo** nello stesso commit. Nel catalogo vanno solo i *nomi* delle variabili e i link da cui prendere le chiavi — **mai valori di token o segreti**.

Gli script che **non hanno un file nel repo** (Google Ads Script da incollare, snippet Liquid, SQL ricorrenti) o che cambiano da app ad app vivono invece nell'app **[deluxy-scripts](deluxy-scripts/README.md)** (porta 3170): lì hanno variabili `{{COSÌ}}`, valori diversi per ogni app e un interruttore per abilitarli app per app. I segreti non si salvano nemmeno lì.

## Regole di lavoro (obbligatorie)

Prima di lavorare, leggere **[deluxy-platform-next/docs/REGOLE-DI-LAVORO.md](deluxy-platform-next/docs/REGOLE-DI-LAVORO.md)** e l'**handoff** [deluxy-platform-next/docs/HANDOFF.md](deluxy-platform-next/docs/HANDOFF.md) (stato FATTO/MANCA, come riprendere). In sintesi:

0. **Documento app sempre aggiornato**: a ogni commit che cambia comportamento, aggiornare anche il manuale `docs/COME-FUNZIONA-APP-DELUXY.md` nello stesso commit.
1. **Handoff sempre aggiornato**: a ogni tappa e prima di fermarsi, aggiornare `docs/HANDOFF.md` + la memoria del progetto (una finestra nuova deve poter riprendere senza contesto).
2. **Commit spesso**, con verifica reale (typecheck + build/preview) prima del commit.
3. **Segreti mai su file né committati**; `.env`/`.env.legacy` in `.gitignore`.
4. **Una sola sessione Claude per cartella** (altrimenti si sovrascrivono branch/lavoro); per il parallelo usare un git worktree isolato.
5. **Confermare le azioni irreversibili/esterne** (deploy, push, invii, cancellazioni, impostazioni).
6. **Durabilità**: pushare su GitHub (dopo conferma). Il non-pushato è a rischio.
7. **Riportare il vero esito**: se un test fallisce o un passo è saltato, dirlo con l'output reale.

## Standard tecnico (obbligatorio per tutte le app)

**CSS, server, database, chiavi interne e chiavi esterne si fanno in un modo solo**: [deluxy-standard/STANDARD-DELUXY.md](deluxy-standard/STANDARD-DELUXY.md). È la fonte unica; il design system qui sotto ne è il capitolo estetico.

- Prima di toccare configurazione, connessioni al database, chiavi o deploy di **qualsiasi** app, leggere quel documento e la checklist di conformità (§6).
- Se un'app fa diversamente: **o si allinea, o la deviazione va scritta nello standard** con la motivazione. Non esistono deviazioni non scritte.
- Per allineare una singola app (ordine pronto da incollare + stato rilevato app per app): [deluxy-standard/ALLINEAMENTO.md](deluxy-standard/ALLINEAMENTO.md).

## Design system (obbligatorio per ogni lavoro di UI)

**Tutte le app — esistenti e nuove — seguono il Deluxy Design System**: [deluxy-design-system/DESIGN-SYSTEM.md](deluxy-design-system/DESIGN-SYSTEM.md).

- Prima di creare o modificare qualsiasi schermata, leggere quella specifica e usare i token in `deluxy-design-system/tokens/` (`tokens.css` per web, `theme.ts` per React Native, `tokens.json` come fonte).
- Mai hardcodare colori, radius, ombre o font che esistono come token.
- Stile: linguaggio Apple — sfondo `#F5F5F7`, superfici bianche con bordi hairline, bottoni a pillola (primari neri, mai oro), badge di stato a pillola con dot, sidebar chiara traslucida, tipografia di sistema con tracking negativo sui titoli, oro `#B8963E` solo come accento.
- Se serve un componente o token nuovo: aggiungerlo prima al design system (con bump di versione), poi usarlo nell'app.
- Implementazione di riferimento: `deluxy-platform-next/web/`.

## Piattaforma Deluxy (app.deluxy.it)

> ⚠️ **Versione unica della piattaforma.** `deluxy-platform-next/` ha **una sola versione valida**, allineata su `main`, `deluxy-scout` e `scout-ui` (19/07/2026). Prima di lavorarci fare **sempre** `git pull`. **Non ripescare né copiare file di questa cartella da branch, worktree, cartelle o zip più vecchi** (es. `C:\Users\nicol\scoutwt\deluxy-platform-next`, `deluxy-platform-next.zip`): contengono copie obsolete che hanno già causato lavoro perso. In caso di dubbio la versione buona è quella su **`main`**.
>
> Cartella di lavoro: `C:\Users\nicol\app\deluxy-platform-next`. Stato, funzioni e API: [docs/HANDOFF.md](deluxy-platform-next/docs/HANDOFF.md).

La fonte di verità funzionale della piattaforma è [deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md](deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md) (manuale completo verificato sull'app in produzione, luglio 2026). Ogni feature del nuovo ambiente va confrontata con quel documento.
