# Allineamento delle app allo Standard Deluxy

Come dire a **una singola app** cosa deve fare per allinearsi allo
[STANDARD-DELUXY.md](STANDARD-DELUXY.md). Si apre una sessione nella cartella
di quell'app, si incolla l'ordine, si legge il rapporto.

---

## 1. L'ordine da incollare (vale per qualsiasi app)

> Copia da qui, sostituisci `<NOME-APP>` e la riga "Da correggere" con quella
> dell'app presa dalla tabella §3.

```
Allinea questa app allo Standard Deluxy.

1. Leggi C:\Users\nicol\scoutwt\deluxy-standard\STANDARD-DELUXY.md per intero.
2. Verifica l'app SUL CODICE (non a memoria) rispetto alla checklist del §6.
3. Correggi quello che non è conforme, partendo da questi punti noti:
   <QUI LE RIGHE "DA CORREGGERE" DELLA TABELLA §3>
4. Non cambiare il comportamento funzionale dell'app: questo è un lavoro di
   conformità, non una riscrittura. Se una regola dello standard rompe una
   funzione dell'app, FERMATI e segnalalo invece di forzare.
5. Verifica davvero: npx tsc --noEmit e npm run build devono essere puliti.
6. Committa (un commit per area: css / server / database / chiavi), aggiorna
   l'handoff dell'app, poi fai il deploy in produzione.

Alla fine rispondi con il RAPPORTO DI CONFORMITÀ nel formato del §4 di
deluxy-standard/ALLINEAMENTO.md: una riga per ogni voce della checklist con
esito CONFORME / CORRETTO / DEVIAZIONE (con motivo) / NON APPLICABILE.

Se trovi una deviazione che ha una buona ragione di esistere, NON forzarla:
scrivila nel rapporto, così la aggiungo allo standard.
```

---

## 2. Ordini brevi, per area

Se serve allineare **una sola area** invece di tutta l'app:

| Area | Ordine da incollare |
|---|---|
| CSS | `Allinea il CSS di questa app al §1 di deluxy-standard/STANDARD-DELUXY.md: tokens.css identico al design system e importato per primo, nessun colore/radius/ombra hardcodato dove esiste un token, oro solo come accento. Poi tsc + build, commit, deploy.` |
| Server | `Allinea questa app al §2 di deluxy-standard/STANDARD-DELUXY.md: .vercelignore completo, porta dedicata, force-dynamic sulle pagine con dati, no-store sulle API, maxDuration sulle route AI, next.config.ts vuoto o motivato riga per riga. Poi tsc + build, commit, deploy.` |
| Database | `Allinea questa app al §3 di deluxy-standard/STANDARD-DELUXY.md: Postgres con schema proprio, DATABASE_URL (pooler 6543) + DIRECT_URL (5432), src/lib/db.ts = singleton standard, indici sui campi filtrati, nessun deleteMany senza filtro. Poi tsc + build, commit, deploy.` |
| Chiavi interne | `Allinea questa app al §4 di deluxy-standard/STANDARD-DELUXY.md: chiavi lette dalla cassaforte del Hub con il pattern a 3 sorgenti (header x-api-key, cache 5 minuti, timeout 4 secondi, fallback), API protette con x-api-key/Bearer, /api/* fuori dal middleware, nomi delle variabili conformi al §4.4. Poi tsc + build, commit, deploy.` |
| Chiavi esterne | `Allinea questa app al §5 di deluxy-standard/STANDARD-DELUXY.md: nessun segreto nei file, .env.example con i soli nomi, chiavi nella cassaforte del Hub, timeout e fallback su ogni chiamata esterna, modello AI da variabile. Poi tsc + build, commit, deploy.` |

---

## 3. Stato rilevato il 24 luglio 2026

Audit fatto sul codice del repo. "Da correggere" è quello che va nell'ordine §1.

> **Già chiuso il 24/07/2026** (commit `e6dc574` e `2255a95`):
> - `.vercelignore` creato nelle 6 app che non l'avevano (anagrafiche, budgets,
>   merchandising, messaging, orders, partner). Prima è stata verificata la
>   parità delle variabili: per le 4 app pubblicate tutte le env locali sono già
>   su Vercel, quindi il prossimo deploy non perde nulla.
> - Header verso la cassaforte corretto in **AI Mail e Budgets** (mandavano
>   `X-Hub-Token`, il Hub accetta solo `x-api-key`/`Bearer`): la cassaforte
>   centrale non veniva mai letta davvero.
>
> **Resta aperto**: budgets e merchandising su SQLite; `HUB_SSO_SECRET` presente
> solo nel `.env` locale di partner e non nelle env di produzione.

| App | Conforme | Da correggere |
|---|---|---|
| **deluxy-hub** | CSS, DB (schema `hub`), db.ts, `.vercelignore`, API a token | — (app di riferimento per le chiavi) |
| **deluxy-mail** | CSS, DB, db.ts, `.vercelignore`, pattern chiavi a 3 sorgenti | **L'header verso il Hub è sbagliato**: `chiaviApp.ts` manda `X-Hub-Token`, il Hub accetta solo `x-api-key`/`Bearer` → la cassaforte non risponde mai e si ripiega in silenzio sull'env. Correggere l'header. 12 hex in `globals.css` da verificare |
| **deluxy-marketing** | CSS, DB (schema `marketing`), db.ts, `.vercelignore` | — |
| **deluxy-anagrafiche** | CSS, DB (schema `anagrafiche`), db.ts, `api-auth` di riferimento | **manca `.vercelignore`** |
| **deluxy-partner** | CSS, DB, db.ts, SSO lato app | **manca `.vercelignore`** |
| **deluxy-messaging** | CSS, DB, db.ts, `next.config` motivato | **manca `.vercelignore`** |
| **deluxy-orders** | CSS, DB, db.ts, `api-auth` conforme | **manca `.vercelignore`**; `.env.example` vuoto → elencare i nomi delle variabili |
| **deluxy-budgets** | CSS, db.ts | **manca `.vercelignore`**; **database SQLite** → passare a Postgres con schema `budgets` |
| **deluxy-merchandising** | CSS, db.ts | **manca `.vercelignore`**; **database SQLite** → passare a Postgres con schema `merchandising`; 12 hex in `globals.css` da verificare |

Note trasversali:
- I `tokens.css` delle 9 app sono **tutti identici** al design system (le
  differenze viste sono solo fine riga CRLF su Windows).
- `src/lib/db.ts` è **già il singleton standard ovunque**.
- Nessun `.env` è tracciato da git.
- `.vercelignore` esiste solo in **hub, mail, marketing**: è il buco più grave e
  più veloce da chiudere (6 app).

---

## 4. Formato del rapporto di conformità

L'app risponde così (una riga per voce, niente prosa):

```
RAPPORTO DI CONFORMITÀ — <nome app> — <data>

CSS
- tokens.css identico e importato per primo ......... CONFORME
- nessun valore hardcodato .......................... CORRETTO (3 colori → var)
SERVER
- .vercelignore ..................................... CORRETTO (creato)
- porta dedicata .................................... CONFORME
- force-dynamic / no-store / maxDuration ............ CORRETTO (4 route)
- next.config.ts .................................... DEVIAZIONE: <motivo>
DATABASE
- Postgres con schema proprio ....................... CONFORME
- db.ts singleton ................................... CONFORME
- indici ............................................ CORRETTO (2 aggiunti)
CHIAVI APP DELUXY
- lettura dalla cassaforte del Hub .................. CORRETTO
- API protette x-api-key/Bearer ..................... CONFORME
- nomi variabili .................................... CONFORME
CHIAVI ESTERNE
- nessun segreto nei file ........................... CONFORME
- timeout e fallback ................................ CORRETTO (1 chiamata)
VERIFICA
- npx tsc --noEmit .................................. pulito
- npm run build ..................................... pulito
- deploy ............................................ <url> READY

DEVIAZIONI DA PORTARE NELLO STANDARD
- <descrizione + motivo>, oppure "nessuna"
```

Le righe **DEVIAZIONE** tornano indietro: o si corregge l'app, o si aggiorna
[STANDARD-DELUXY.md](STANDARD-DELUXY.md). Lo standard resta uno solo.
