# Da dove partire — guida per una sessione nuova

**Aggiornato: 24 luglio 2026.** Se apri una sessione su questo repo e non sai da
che parte cominciare, **questo è il primo file da leggere**. Dice, per ogni
progetto: cos'è, dove sta, su che porta gira, dov'è in produzione, **quale
documento leggere per primo** e le trappole già note.

---

> Non conosci Deluxy? Prima di tutto leggi **[DOSSIER-DELUXY.md](DOSSIER-DELUXY.md)**:
> cos'è l'azienda, il glossario dei termini interni, le regole di business e
> com'è fatto l'ecosistema. Questo file invece è la parte operativa.

## 0. Le 4 cose valide per tutti

1. **Regole di lavoro** (commit, handoff, segreti, conferme):
   [deluxy-platform-next/docs/REGOLE-DI-LAVORO.md](deluxy-platform-next/docs/REGOLE-DI-LAVORO.md).
2. **Standard tecnico** (css, server, database, chiavi):
   [deluxy-standard/STANDARD-DELUXY.md](deluxy-standard/STANDARD-DELUXY.md) —
   per allineare un'app: [deluxy-standard/ALLINEAMENTO.md](deluxy-standard/ALLINEAMENTO.md).
3. **Design system** (estetica, componenti):
   [deluxy-design-system/DESIGN-SYSTEM.md](deluxy-design-system/DESIGN-SYSTEM.md).
4. **Una sola sessione per cartella.** Se un'altra sessione sta lavorando nella
   stessa app, **rileggi sempre i file da disco** prima di modificarli e non
   pubblicare il suo lavoro non committato.

**Branch di lavoro: `scout-ui`** (unica eccezione: `deluxy-search-supplier`, che
vive su `main`). Prima di pushare: `git fetch` + merge — altre sessioni committano
in parallelo sullo stesso branch.

---

## 1. Mappa dei progetti

| Progetto | Cos'è | Porta | Produzione | Leggi per primo |
|---|---|---|---|---|
| `deluxy-hub` | portale unico di accesso, catalogo delle app, cassaforte chiavi | 3050 | [deluxy-hub.vercel.app](https://deluxy-hub.vercel.app) | [HANDOFF.md](deluxy-hub/HANDOFF.md) |
| `deluxy-platform-next` | piattaforma logistica consegne (staging moderno) | `ng serve` in `web/` | [deluxy-delivery.vercel.app](https://deluxy-delivery.vercel.app) | [docs/HANDOFF.md](deluxy-platform-next/docs/HANDOFF.md) + [COME-FUNZIONA](deluxy-platform-next/docs/COME-FUNZIONA-APP-DELUXY.md) |
| `deluxy-partner` | Finance: fatture, vendite vendor, saldi, SEPA | 3040 | [deluxy-partner.vercel.app](https://deluxy-partner.vercel.app) | [docs/HANDOFF.md](deluxy-partner/docs/HANDOFF.md) |
| `deluxy-anagrafiche` | registro partner/prospect B2B, **fonte di verità** | 3060 | [deluxy-anagrafiche.vercel.app](https://deluxy-anagrafiche.vercel.app) | [HANDOFF.md](deluxy-anagrafiche/HANDOFF.md) |
| `deluxy-mail` | AI Mail: IMAP/SMTP, smistamento e bozze con OpenAI | 3070 | [deluxy-mail.vercel.app](https://deluxy-mail.vercel.app) | [HANDOFF.md](deluxy-mail/HANDOFF.md) |
| `deluxy-budgets` | budget 2026 su 3 livelli, P&L, premi | 3080 | [deluxy-budgets.vercel.app](https://deluxy-budgets.vercel.app) | [README.md](deluxy-budgets/README.md) |
| `deluxy-merchandising` | prodotto a 360°: collezioni, PLM, costi, **trend di vendita da Orders, ipotesi di ordinativo, lettura AI**, Shopify | 3120 | [deluxy-merchandising.vercel.app](https://deluxy-merchandising.vercel.app) | [docs/HANDOFF.md](deluxy-merchandising/docs/HANDOFF.md) |
| `deluxy-marketing` | memoria operativa ADV + connettori Google/Meta, dashboard per brand con MER, lettura AI | 3130 | [deluxy-marketing.vercel.app](https://deluxy-marketing.vercel.app) | [docs/HANDOFF.md](deluxy-marketing/docs/HANDOFF.md) |
| `deluxy-messaging` | **Customer Service**: reclami sugli ordini (casistiche, azioni, colpa a valet/partner → giudizi) + ordini da lavorare (da Orders, ogni 15') + inbox unificata WhatsApp/Messenger/IG + widget siti | 3140 | [deluxy-messaging.vercel.app](https://deluxy-messaging.vercel.app) | [HANDOFF.md](deluxy-messaging/HANDOFF.md) |
| `deluxy-orders` | registro centralizzato ordini Shopify | 3150 | [deluxy-orders.vercel.app](https://deluxy-orders.vercel.app) | [docs/HANDOFF.md](deluxy-orders/docs/HANDOFF.md) |
| `deluxy-transactions` | autorizzazione dei pagamenti: richieste firmate dalle app, doppia firma, distinte SEPA | 3160 | [deluxy-transactions.vercel.app](https://deluxy-transactions.vercel.app) | [docs/HANDOFF.md](deluxy-transactions/docs/HANDOFF.md) + [SICUREZZA.md](deluxy-transactions/docs/SICUREZZA.md) |
| `deluxy-search-supplier` | ricerca fiorai/pasticcerie + smistamento ordini | — | [search-deluxy.vercel.app](https://search-deluxy.vercel.app) | [AI_SPEC.md](deluxy-search-supplier/AI_SPEC.md) + [HANDOFF.md](deluxy-search-supplier/HANDOFF.md) |
| `deluxy-scout` | app mobile prospezione (React Native/Expo) | `expo start` | [deluxy-scout.vercel.app](https://deluxy-scout.vercel.app) | [README.md](deluxy-scout/README.md) |
| `deluxy-scout-manager` | plugin/handoff per lavorare su Scout | — | — | [README.md](deluxy-scout-manager/README.md) |
| `sviluppi-siti-deluxy` | temi Shopify dei siti Deluxy | — | negozi Shopify | [README.md](sviluppi-siti-deluxy/README.md) · deluxy.it: [STATO-DELUXY-IT.md](sviluppi-siti-deluxy/skills/sviluppi-siti-deluxy/reference/STATO-DELUXY-IT.md) |
| `deluxy-design-system` | token e componenti comuni | — | — | [DESIGN-SYSTEM.md](deluxy-design-system/DESIGN-SYSTEM.md) |
| `deluxy-standard` | regole tecniche comuni | — | — | [STANDARD-DELUXY.md](deluxy-standard/STANDARD-DELUXY.md) |
| `scripts` | catalogo di tutti gli script del repo | — | — | [README.md](scripts/README.md) |

Porte riservate ma non ancora in questo repo: 3090 tasks, 3100 acquisti, 3110 calendario.

---

## 2. Come si parte, in concreto

Per **qualsiasi** app Next (hub, partner, anagrafiche, mail, budgets,
merchandising, marketing, messaging, orders):

```bash
cd C:\Users\nicol\scoutwt\<app> && npm install && npx prisma generate && npm run dev
```

Il `.env` è già presente sulle macchine di lavoro; se manca si parte da
`.env.example` (contiene **solo i nomi**, i valori stanno nella cassaforte del
Hub, pagina `/chiavi`).

Verifica prima di ogni commit — **sempre entrambe**:

```bash
npx tsc --noEmit && npm run build
```

Deploy in produzione, dalla cartella dell'app:

```bash
npx vercel deploy --prod --yes
```

---

## 3. Trappole già pagate (non ricascarci)

- **`deluxy-platform-next` ha una sola versione valida**, allineata su `main`.
  **Non ripescare file da zip, worktree o cartelle più vecchie**: è già costato
  lavoro perso. Nel dubbio la versione buona è quella su `main`.
- **`deluxy-search-supplier` si sviluppa su `main`**, non su `scout-ui`.
- **Google Ads Scripts**: `DURING LAST_N_DAYS` accetta solo pochi valori fissi
  (per finestre libere servono date esplicite con `BETWEEN`), e `apiVersion`
  fissata si rompe quando Google ritira la versione (la v18 non è più
  supportata: meglio non specificarla). Il bottone **Esegui** lancia una volta
  sola: per la ricorrenza serve la colonna **Frequenza**, e Google fa scegliere
  la fascia oraria, non il minuto esatto.
- **Meta non ha gli Scripts**: è l'app che deve chiamare la Graph API con un
  token. Usare quello di un **utente di sistema** del Business Manager, che non
  scade; i token utente muoiono in 60 giorni. Il portfolio `1298043513875111`
  è disabilitato da Meta: mai usarlo.
- **Heredoc bash e template literal non convivono**: `${...}` viene espanso
  dalla shell e corrompe i file. Usare gli strumenti Write/Edit per i blocchi
  di codice, non `cat <<EOF`.
- **Cambiare una variabile su Vercel non basta**: vale solo per i deployment
  nuovi → dopo ogni modifica si ripubblica.
- **Il push non pubblica.** Il deploy in produzione è un comando separato
  (`npx vercel deploy --prod`). Per AI Mail in particolare il solo push non
  mette nulla online.
- **Mai `deleteMany` senza filtro** sul Postgres condiviso: cancella i dati veri
  di altre app. Nei test si filtra sui soli record creati dal test.
- **Windows/Prisma**: se `prisma generate` dà `EPERM ... query_engine.dll`,
  ferma prima il dev server (tiene il file bloccato), poi rigenera.
- **Le anagrafiche non si duplicano**: vivono solo in `deluxy-anagrafiche` e si
  leggono via API. Stessa regola per gli ordini (`deluxy-orders`).
- **I pagamenti non si fanno partire da un'app qualsiasi**: si manda una
  richiesta firmata a `deluxy-transactions`, dove una persona autorizza. Nessuna
  chiave API può approvare un pagamento, per progetto.
- **Aggiungendo o rinominando un'app**, aggiornare il catalogo del portale in
  [deluxy-hub/src/lib/apps.ts](deluxy-hub/src/lib/apps.ts) (+ icona, + `APP_URL_*`),
  altrimenti dal Hub non è raggiungibile.

---

## 4. Prompt di avvio (da incollare in una sessione nuova)

```
Lavoriamo su <NOME PROGETTO> (cartella C:\Users\nicol\scoutwt\<cartella>).

Prima di toccare qualsiasi cosa:
1. Leggi DA-DOVE-PARTIRE.md alla radice del repo e il documento indicato per
   questo progetto nella mappa (handoff o README).
2. Leggi deluxy-standard/STANDARD-DELUXY.md (css, server, database, chiavi) e,
   se il lavoro tocca la UI, deluxy-design-system/DESIGN-SYSTEM.md.
3. Controlla lo stato reale: git status/log sulla cartella, e se l'app è
   pubblicata verifica che risponda.

Poi dimmi in 5 righe: cos'è questa app, dov'è in produzione, cosa risulta FATTO
e cosa MANCA secondo il suo handoff, e quali file non committati ci sono.
Solo dopo iniziamo a lavorare.

Regole fisse: verifica reale (tsc + build) prima di ogni commit; handoff e
documento dell'app aggiornati nello stesso commit che cambia comportamento;
segreti mai nei file; conferma prima di azioni esterne irreversibili; riporta
sempre l'esito vero, anche quando è negativo.
```

---

## 5. Prima di fermarsi

Aggiornare, nello stesso commit del lavoro:
1. l'**handoff** del progetto (stato FATTO/MANCA, come riprendere);
2. il **documento funzionale** dell'app se il comportamento è cambiato;
3. questo file, se è nato un progetto nuovo o è cambiata una porta/URL.
