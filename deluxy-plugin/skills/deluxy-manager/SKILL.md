---
name: deluxy-manager
description: >-
  Gestisci e sviluppa l'app Deluxy (ricerca fiorai/pasticcerie + smistamento ordini Shopify
  via WhatsApp/Email, live su search-deluxy.vercel.app, repo donatodnicolo-gif/search).
  Usala quando l'utente vuole: recuperare/testare un ordine, aggiungere o collegare un negozio
  Shopify, cambiare impostazioni (chiave Google, token), fare il deploy, o modificare il codice
  dell'app in modo corretto. Trigger: "Deluxy", "smistamento ordini", "search-deluxy", "fiorai app".
---

# Deluxy Manager

Questa skill ti permette di **gestire l'app Deluxy da qualsiasi Claude**. Due modalità:
**(A) operare l'app live** via le sue API HTTP, e **(B) modificarne il codice** rispettando la spec.

## Prima di tutto
- **Live**: https://search-deluxy.vercel.app · **Repo**: https://github.com/donatodnicolo-gif/search (branch `main`; push = deploy Vercel).
- Serve il **pass code** (env `APP_PASSWORD` su Vercel). Chiedilo all'utente se non ce l'hai; NON inventarlo. Va nell'header `x-app-password`.
- La spec tecnica completa è in `reference/AI_SPEC.md` (accanto a questa skill). **Leggila prima di toccare il codice.**

## A) Operare l'app live (via API, con `curl`/WebFetch)
Sostituisci `<PASS>` col pass code.

**Recuperare/testare un ordine**
```
curl "https://search-deluxy.vercel.app/api/order?brand=deluxyflowers.com&number=2484" -H "x-app-password: <PASS>"
```
brand validi: `deluxyflowers.com`, `deluxy.it`, `cakedesign.me`. Aggiungi `&debug=1` per elencare i nomi ordini recenti (utile se "non trovato").

**Vedere le impostazioni (token nascosti)**
```
curl "https://search-deluxy.vercel.app/api/config" -H "x-app-password: <PASS>"
```

**Salvare impostazioni** (token vuoto = invariato)
```
curl -X POST "https://search-deluxy.vercel.app/api/config" -H "x-app-password: <PASS>" \
  -H "Content-Type: application/json" \
  -d '{"googleKey":"AIza...","stores":[{"brand":"deluxy.it","shop":"deluxygifts.myshopify.com","token":""}]}'
```

**Collegare un negozio (ottenere il token Admin via OAuth)** — apri nel browser dell'utente:
```
https://search-deluxy.vercel.app/api/oauth?shop=<shop>.myshopify.com&pass=<PASS>
```
Al termine il token è salvato in cassaforte. Mappa negozi in `reference/AI_SPEC.md` §6.

## B) Modificare il codice (correttamente)
1. **Leggi `reference/AI_SPEC.md`** — architettura, endpoint, convenzioni e soprattutto la sezione **⚠️ Insidie** (errori già risolti: token `atkn_` vs `shpat_`, "matching hosts" OAuth, match esatto numero ordine, foto WhatsApp via appunti, niente npm, niente Node/Python locale).
2. Modifica i file: `index.html` (front-end, JS vanilla, testi in italiano), `api/*.js` (funzioni Vercel, `fetch` globale, KV via REST, niente dipendenze).
3. **Deploy**: `git push origin main` → Vercel ricostruisce in ~1 min. Verifica con `curl` sugli endpoint live.
4. Anteprima locale (no Node/Python): server statico PowerShell `.claude/serve.ps1` porta 5510.

## Regole d'oro
- I **token Shopify non devono mai arrivare al browser** (il backend restituisce solo `hasToken`).
- Cercando un ordine, accetta il match **solo se il numero coincide esattamente**.
- WhatsApp: foto = appunti + Ctrl+V; **invia il testo prima**, poi allega la foto.
- Lingua del messaggio = paese del **negozio**, non della consegna.
- Non introdurre dipendenze npm né CDN esterne (a parte Google Maps).
