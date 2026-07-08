# Deluxy Suppliers — Plugin Claude Code

Gestisci e sviluppa l'app **Deluxy** (ricerca fiorai/pasticcerie + smistamento ordini Shopify via WhatsApp/Email) da **qualsiasi Claude Code**.

- **App live**: https://search-deluxy.vercel.app
- **Repo**: https://github.com/donatodnicolo-gif/search

## Cosa contiene
- **Skill `deluxy-suppliers`** — insegna a Claude a operare l'app via le sue API e a modificarne il codice secondo la spec. Include la scheda tecnica completa in `skills/deluxy-suppliers/reference/AI_SPEC.md`.
- **Comandi**:
  - `/ordine <brand> <numero>` — recupera un ordine (es. `/ordine deluxyflowers.com 2484`)
  - `/collega-negozio <brand>` — collega un negozio Shopify (OAuth → token in cassaforte)
  - `/deploy` — pubblica le modifiche (push su main → deploy Vercel) e verifica

## Cosa ti serve
Il **pass code** dell'app (variabile `APP_PASSWORD` su Vercel): Claude lo chiederà quando serve. Va nell'header `x-app-password` delle chiamate API.

## Installazione

### Opzione 1 — cartella locale (più semplice)
Copia la cartella `deluxy-suppliers/` dove vuoi, poi in Claude Code:
```
/plugin install ./deluxy-suppliers
```
(oppure aggiungi il percorso della cartella tra i plugin nelle impostazioni di Claude Code).

### Opzione 2 — da questo repo (marketplace)
Il plugin vive dentro il repo dell'app: `donatodnicolo-gif/search` → `deluxy-suppliers/`.
Aggiungi il repo come marketplace di plugin e installa `deluxy-suppliers` da lì.

### Verifica
Dopo l'installazione dovresti avere la skill `deluxy-suppliers` e i comandi `/ordine`, `/collega-negozio`, `/deploy`. Prova: `/ordine deluxyflowers.com 2484`.

## Uso rapido
- "Recuperami l'ordine 2484 di deluxyflowers" → Claude usa la skill e chiama l'API.
- "Aggiungi un campo X al messaggio WhatsApp" → Claude legge `AI_SPEC.md`, modifica `index.html`, fa il deploy.
- "Collega il negozio cakedesign" → Claude ti dà il link OAuth da aprire.

> ⚠️ Regole chiave (dettagli in `AI_SPEC.md`): i token Shopify non escono mai dal browser; match numero ordine esatto; foto WhatsApp via appunti+Ctrl+V (invia prima il testo); niente dipendenze npm; niente Node/Python in locale (anteprima con PowerShell).
