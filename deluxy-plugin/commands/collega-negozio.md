---
description: Collega un negozio Shopify a Deluxy (ottiene e salva il token Admin via OAuth) così l'app può leggere gli ordini passati.
argument-hint: <brand>  (deluxyflowers.com | deluxy.it | cakedesign.me)
---

Collega il negozio Shopify indicato in `$ARGUMENTS` alla cassaforte Deluxy.

1. Mappa brand → dominio .myshopify.com (vedi la skill deluxy-manager, `reference/AI_SPEC.md` §6):
   - deluxyflowers.com → fb72b1-2.myshopify.com
   - deluxy.it → deluxygifts.myshopify.com
   - cakedesign.me → cakedesign-5921.myshopify.com
2. Se manca il pass code, chiedilo (env `APP_PASSWORD`).
3. Di' all'utente di aprire questo link nel browser dove è loggato in Shopify (io non posso fare il login):
   `https://search-deluxy.vercel.app/api/oauth?shop=<shop>.myshopify.com&pass=<PASS>`
4. Al termine l'URL diventa `.../?connected=<brand>` e il token è salvato in cassaforte.
5. Verifica con: `curl ".../api/config" -H "x-app-password: <PASS>"` → il negozio deve avere `hasToken:true`.
