---
description: Recupera un ordine Deluxy da Shopify (per brand + numero) e mostra i dettagli pronti per lo smistamento.
argument-hint: <brand> <numero>  (es. deluxyflowers.com 2484)
---

Recupera l'ordine Deluxy richiesto e mostrane i dettagli.

Argomenti ricevuti: `$ARGUMENTS` (formato: `<brand> <numero>`; brand ∈ deluxyflowers.com | deluxy.it | cakedesign.me).

Passi:
1. Se manca il pass code, chiedilo all'utente (env `APP_PASSWORD`; non inventarlo).
2. Chiama:
   `curl "https://search-deluxy.vercel.app/api/order?brand=<brand>&number=<numero>" -H "x-app-password: <PASS>"`
3. Se `found:false`, riprova con `&debug=1` e mostra i nomi ordini recenti per capire il formato.
4. Presenta in modo leggibile: destinatario, indirizzo, data/orario consegna, prodotto+variante+quantità, bigliettino, importo, foto.
