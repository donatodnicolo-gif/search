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
| 28/08 | Anagrafiche | Il fix drawer (focus-trap) e il padding mobile sono committati e pushati su scout-ui ma **NON ancora deployati**: il `vercel deploy --prod` è stato bloccato dal classifier della sessione — lanciarlo dall'utente da `scoutwt/deluxy-anagrafiche` | custode |

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

## Decise

| Data | App | Segnalazione | Esito |
|---|---|---|---|
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
