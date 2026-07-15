# Repo Deluxy — regole per lo sviluppo

Questo repo contiene le app dell'ecosistema Deluxy: `deluxy-platform-next/` (piattaforma logistica, staging moderno), `deluxy-scout/` (app mobile prospezione), `deluxy-suppliers/` (app fornitori/smistamento ordini), `sviluppi-siti-deluxy/` (temi Shopify), `deluxy-scout-manager/`.

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

## Design system (obbligatorio per ogni lavoro di UI)

**Tutte le app — esistenti e nuove — seguono il Deluxy Design System**: [deluxy-design-system/DESIGN-SYSTEM.md](deluxy-design-system/DESIGN-SYSTEM.md).

- Prima di creare o modificare qualsiasi schermata, leggere quella specifica e usare i token in `deluxy-design-system/tokens/` (`tokens.css` per web, `theme.ts` per React Native, `tokens.json` come fonte).
- Mai hardcodare colori, radius, ombre o font che esistono come token.
- Stile: linguaggio Apple — sfondo `#F5F5F7`, superfici bianche con bordi hairline, bottoni a pillola (primari neri, mai oro), badge di stato a pillola con dot, sidebar chiara traslucida, tipografia di sistema con tracking negativo sui titoli, oro `#B8963E` solo come accento.
- Se serve un componente o token nuovo: aggiungerlo prima al design system (con bump di versione), poi usarlo nell'app.
- Implementazione di riferimento: `deluxy-platform-next/web/`.

## Piattaforma Deluxy (app.deluxy.it)

La fonte di verità funzionale della piattaforma è [deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md](deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md) (manuale completo verificato sull'app in produzione, luglio 2026). Ogni feature del nuovo ambiente va confrontata con quel documento.
