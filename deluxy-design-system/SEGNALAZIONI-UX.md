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
| 28/08 | search-supplier | Restano deferiti dalla passata su `main`: badge senza dot (emoji), empty-state con icona/titolo, emoji→SVG, chip come `<div>` — tutti toccano il JS che genera l'HTML | custode |
| 27/08 | Scout | Migrazione COMPLETA di `lib/theme.ts` ai token DS (rinominando le chiavi in collisione `spacing.md` 16≠12 — mai swap secco). Fatta la parte ADDITIVA sicura (token nuovi + hex→token); lo swap dell'import resta | custode |
| 27/08 | scoutwt/DS | Allineare la copia del DS in `scoutwt/deluxy-design-system` alla v1.4 (oggi 1.3) — bassa priorità: le app hanno già la loro copia dei token a v1.4 | custode |
| 27/08 | Calendario | Un errore DB reso dentro `.vuoto` (page.tsx:187) = «fallimento = lista vuota» (Libro cap.6, legge 9): serve una card d'errore con «Riprova» | passata UX |
| 27/08 | Anagrafiche | Drawer mobile: aggiungere focus-trap + ritorno del focus; ridurre il padding pagina mobile (40/24) | passata UX |

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
