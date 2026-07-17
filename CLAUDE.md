# Repo Deluxy — regole per lo sviluppo

Questo repo contiene le app dell'ecosistema Deluxy: `deluxy-hub/` (portale unico di accesso con utenti e ruoli), `deluxy-platform-next/` (piattaforma logistica, staging moderno), `deluxy-anagrafiche/` (registro centralizzato partner/prospect B2B con API, fonte di verità delle anagrafiche), `deluxy-scout/` (app mobile prospezione), `deluxy-suppliers/` (app fornitori/smistamento ordini), `deluxy-partner/` (gestione finanziaria partner, sostituisce PARTNER.xlsx), `sviluppi-siti-deluxy/` (temi Shopify), `deluxy-scout-manager/`.

## Anagrafiche partner (deluxy-anagrafiche)

Le anagrafiche dei partner B2B vivono SOLO in `deluxy-anagrafiche/` (porta 3060): le altre app le leggono via API con chiave di sola lettura; l'unica app con chiave di scrittura è la piattaforma consegne (`deluxy-platform-next`), che sincronizza automaticamente ogni partner creato/modificato. Non duplicare dati anagrafici nelle altre app: integrare le API descritte in [deluxy-anagrafiche/README.md](deluxy-anagrafiche/README.md).

## Portale (deluxy-hub)

`deluxy-hub/` è la porta d'ingresso: un utente accede con email e password e vede solo le icone delle app abilitate per il suo ruolo (`admin`, `partner`, `commerciale`). Le app restano autonome, il Hub le linka.

**Aggiungendo o rinominando un'app del repo, aggiornare il catalogo in [deluxy-hub/src/lib/apps.ts](deluxy-hub/src/lib/apps.ts)**, altrimenti l'app non è raggiungibile dal portale. Dettagli in [deluxy-hub/README.md](deluxy-hub/README.md).

## Design system (obbligatorio per ogni lavoro di UI)

**Tutte le app — esistenti e nuove — seguono il Deluxy Design System**: [deluxy-design-system/DESIGN-SYSTEM.md](deluxy-design-system/DESIGN-SYSTEM.md).

- Prima di creare o modificare qualsiasi schermata, leggere quella specifica e usare i token in `deluxy-design-system/tokens/` (`tokens.css` per web, `theme.ts` per React Native, `tokens.json` come fonte).
- Mai hardcodare colori, radius, ombre o font che esistono come token.
- Stile: linguaggio Apple — sfondo `#F5F5F7`, superfici bianche con bordi hairline, bottoni a pillola (primari neri, mai oro), badge di stato a pillola con dot, sidebar chiara traslucida, tipografia di sistema con tracking negativo sui titoli, oro `#B8963E` solo come accento.
- Se serve un componente o token nuovo: aggiungerlo prima al design system (con bump di versione), poi usarlo nell'app.
- Implementazione di riferimento: `deluxy-platform-next/web/`.

## Piattaforma Deluxy (app.deluxy.it)

La fonte di verità funzionale della piattaforma è [deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md](deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md) (manuale completo verificato sull'app in produzione, luglio 2026). Ogni feature del nuovo ambiente va confrontata con quel documento.
