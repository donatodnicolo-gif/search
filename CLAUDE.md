# Repo Deluxy — regole per lo sviluppo

Questo repo contiene le app dell'ecosistema Deluxy: `deluxy-hub/` (portale unico di accesso con utenti e ruoli), `deluxy-platform-next/` (piattaforma logistica, staging moderno), `deluxy-anagrafiche/` (registro centralizzato partner/prospect B2B con API, fonte di verità delle anagrafiche), `deluxy-scout/` (app mobile prospezione), `deluxy-suppliers/` (app fornitori/smistamento ordini), `deluxy-partner/` (gestione finanziaria partner, sostituisce PARTNER.xlsx), `deluxy-personale/` (organico e dati HR: funzioni, mansioni, organigramma, inquadramenti, retribuzioni — porta 3200, le altre app leggono via `/api/v1`), `deluxy-crm/` (il libro dei clienti D2C, stile clienteling del lusso: schede a 360° dagli ordini di Orders, ricorrenze, eventi con inviti, mail personalizzate via AI Mail — porta 3190, live su deluxy-crm.vercel.app), `deluxy-search-supplier/` (ricerca fiorai/pasticcerie + smistamento ordini Shopify via WhatsApp/Email; include il plugin in `plugin/`), `sviluppi-siti-deluxy/` (temi Shopify), `deluxy-scout-manager/`.

> `deluxy-search-supplier/` è pubblicata su Vercel (progetto `search-deluxy`, **Root Directory = `deluxy-search-supplier`**) dal branch **`main`**: si sviluppa lì, non su questo branch. Spec: [deluxy-search-supplier/AI_SPEC.md](deluxy-search-supplier/AI_SPEC.md).

## Architettura dei dati (OBBLIGATORIA — 24/08/2026)

**Prima di aggiungere una tabella, leggere dati di un'altra app o ricopiare un
numero, leggere lo Standard Deluxy §7** (fonte unica delle regole tecniche:
`C:\Users\nicol\scoutwt\deluxy-standard\STANDARD-DELUXY.md`). La regola
fondante: **ogni dato ha una casa sola** — chi lo possiede è l'unico che lo
scrive, gli altri leggono via `/api/v1` con chiave a scope. Mai query su schemi
altrui; mai tabelle-copia (cache TTL breve sì, riferimento per id sì); regole
economiche (quota, margine, fee, IVA) mai ricopiate: si leggono dal
proprietario. Il **giro dell'ordine D2C** è in §7.4 dello standard: Orders
(registro e margine) → Customer Service (decisore, per mano o per regola) →
piattaforma consegne (offerta del fornitore col `type=UNICO`, incarichi
proposto→accettato, esecuzione col valet) → Transactions (unica uscita del
denaro). Il disegno completo con diagrammi e audit: artifact **«Architettura
Dati Deluxy»** (galleria claude.ai/code/artifacts).

## Anagrafiche partner (deluxy-anagrafiche)

Le anagrafiche dei partner B2B vivono SOLO in `deluxy-anagrafiche/` (porta 3060): le altre app le leggono via API con chiave di sola lettura; l'unica app con chiave di scrittura è la piattaforma consegne (`deluxy-platform-next`), che sincronizza automaticamente ogni partner creato/modificato. Non duplicare dati anagrafici nelle altre app: integrare le API descritte in [deluxy-anagrafiche/README.md](deluxy-anagrafiche/README.md).

## Portale (deluxy-hub)

`deluxy-hub/` è la porta d'ingresso: un utente accede con email e password e vede solo le icone delle app abilitate per il suo ruolo (`admin`, `partner`, `commerciale`). Le app restano autonome, il Hub le linka.

**Aggiungendo o rinominando un'app del repo, aggiornare il catalogo in [deluxy-hub/src/lib/apps.ts](deluxy-hub/src/lib/apps.ts)**, altrimenti l'app non è raggiungibile dal portale. Dettagli in [deluxy-hub/README.md](deluxy-hub/README.md).

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

**Tutte le app — esistenti e nuove — seguono il Deluxy Design System**: [deluxy-design-system/DESIGN-SYSTEM.md](deluxy-design-system/DESIGN-SYSTEM.md) (token e componenti) **e il Libro UX&UI**: [deluxy-design-system/LIBRO-UX-UI.md](deluxy-design-system/LIBRO-UX-UI.md) (pattern vincolanti: navigazione, form, tabelle, stati, feedback, conferme, mobile — con l'implementazione di riferimento di ciascuno).

- Prima di creare o modificare qualsiasi schermata, leggere quelle specifiche e usare i token in `deluxy-design-system/tokens/` (`tokens.css` per web, `theme.ts` per React Native, `tokens.json` come fonte).
- Per decidere COME va fatto un elemento di interfaccia o arbitrare fra due pattern divergenti: agente **`architetto-ux`** (`.claude/agents/architetto-ux.md`); i casi nuovi entrano prima nel Libro, poi nelle app.
- **Il layout ha un custode (27/08/2026)**: errori di UI e richieste di cambiamento dell'interfaccia, in QUALSIASI app, non si risolvono in autonomia — si registrano in [deluxy-design-system/SEGNALAZIONI-UX.md](deluxy-design-system/SEGNALAZIONI-UX.md) (o si interpella `architetto-ux`), il custode valuta e decide se è una correzione locale, una regola nuova del Libro valida per tutte le app, o una deroga da annotare nel README dell'app.

## Sicurezza (obbligatorio per ogni app)

**Tutte le app seguono il Libro della Sicurezza**: [deluxy-design-system/LIBRO-SICUREZZA.md](deluxy-design-system/LIBRO-SICUREZZA.md) (le 12 leggi + 16 capitoli: sessioni, password, chiavi a scope, autorizzazione deny-by-default, input, segreti, dati a riposo, webhook HMAC, header, database condiviso, mobile). I riferimenti sono OWASP ASVS/API Top 10/MASVS, NIST 800-63B, RFC 9700; lo Standard Deluxy §7 dà il contratto dati.

- **La sicurezza ha un custode (27/08/2026)**: buchi e cambiamenti di una difesa, in QUALSIASI app, non si risolvono in autonomia — si registrano in [deluxy-design-system/SEGNALAZIONI-SICUREZZA.md](deluxy-design-system/SEGNALAZIONI-SICUREZZA.md) (o si interpella `architetto-sicurezza`). Ogni segnalazione e ogni toppa passa PRIMA dall'agente `sicurezza-ostile` (sopravvive solo con un percorso di sfruttamento: chi/quale chiamata/quale dato). Il custode decide: correzione locale, regola nuova del Libro per tutte le app, o rischio accettato con il motivo scritto.
- Mai hardcodare colori, radius, ombre o font che esistono come token.
- Stile: linguaggio Apple — sfondo `#F5F5F7`, superfici bianche con bordi hairline, bottoni a pillola (primari neri, mai oro), badge di stato a pillola con dot, sidebar chiara traslucida, tipografia di sistema con tracking negativo sui titoli, oro `#B8963E` solo come accento.
- Se serve un componente o token nuovo: aggiungerlo prima al design system (con bump di versione), poi usarlo nell'app.
- Implementazione di riferimento: `deluxy-platform-next/web/`.

## Performance e integrità (obbligatorio per ogni app)

**Tutte le app seguono il Libro PERFORMANCE**: [deluxy-design-system/LIBRO-PERFORMANCE.md](deluxy-design-system/LIBRO-PERFORMANCE.md) (le 10 leggi + capitoli: misurare, query e indici, rendering, liste, mobile, payload/cache, scritture e idempotenza, migrazioni sul DB condiviso, bundle). Ogni elemento nuovo di un'app — query, lista, pagina, cache, scrittura — attinge da lì. I riferimenti sono Core Web Vitals/RAIL, le guide Next.js/React Native, la pratica Postgres/Prisma (EXPLAIN, indici CONCURRENTLY, keyset) e il canone Stripe per l'idempotenza.

- **Le performance hanno un custode (28/08/2026)**: punti lenti e proposte di ottimizzazione, in QUALSIASI app, non si risolvono in autonomia — si registrano in [deluxy-design-system/SEGNALAZIONI-PERFORMANCE.md](deluxy-design-system/SEGNALAZIONI-PERFORMANCE.md) CON LA MISURA (ms/KB/query), o si interpella `architetto-performance`. Ogni segnalazione e ogni toppa passa PRIMA dall'agente `performance-ostile` (un'accusa sopravvive solo con la misura; una proposta solo se non tocca l'integrità dei dati). Ogni ottimizzazione applicata riporta il numero PRIMA e DOPO.
- **La velocità non compra mai l'integrità**: niente take che troncano in silenzio, niente cache senza TTL+invalidazione dichiarati, niente copie di dati altrui (Standard §7), scritture composte in transazione, scritture raggiungibili da retry idempotenti.
- ⚠️ **Indici e schema del Postgres condiviso (14 app)**: mai in autonomia — proposta nel registro, poi `CREATE INDEX CONCURRENTLY` concordato.

## Piattaforma Deluxy (app.deluxy.it)

> ⚠️ **Versione unica della piattaforma.** `deluxy-platform-next/` ha **una sola versione valida**, allineata su `main`, `deluxy-scout` e `scout-ui` (19/07/2026). Prima di lavorarci fare **sempre** `git pull`. **Non ripescare né copiare file di questa cartella da branch, worktree, cartelle o zip più vecchi** (es. `C:\Users\nicol\scoutwt\deluxy-platform-next`, `deluxy-platform-next.zip`): contengono copie obsolete che hanno già causato lavoro perso. In caso di dubbio la versione buona è quella su **`main`**.
>
> Cartella di lavoro: `C:\Users\nicol\app\deluxy-platform-next`. Stato, funzioni e API: [docs/HANDOFF.md](deluxy-platform-next/docs/HANDOFF.md).

La fonte di verità funzionale della piattaforma è [deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md](deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md) (manuale completo verificato sull'app in produzione, luglio 2026). Ogni feature del nuovo ambiente va confrontata con quel documento.
