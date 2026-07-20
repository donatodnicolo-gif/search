---
description: Top 3 fornitori (fiorai/pasticcerie) più vicini alla consegna di un ordine
argument-hint: <brand> <numero ordine>
---

Trova i 3 fornitori migliori per smistare l'ordine $ARGUMENTS.

1. Chiedi il pass code se non lo hai già (header `x-app-password`; aggiungi `x-app-user` con l'email dell'operatore se nota).
2. Chiama:
   `curl "https://search-deluxy.vercel.app/api/fornitori?brand=<brand>&number=<numero>&ts=<ISO ora>" -H "x-app-password: <PASS>"`
   - `categoria=fiorai|pasticcerie` opzionale (default dal brand: cakedesign.me → pasticcerie).
3. Presenta il riepilogo ordine (destinatario, indirizzo, data/orario, prodotto, valore) e poi i 3 fornitori in tabella: nome, distanza stradale (km/minuti), telefono, link WhatsApp `wa.me`, aperto ora, valutazione.
4. Suggerisci il migliore (più vicino e aperto, con WhatsApp probabile) e ricorda che l'invio vero del messaggio si fa dall'app (https://search-deluxy.vercel.app) che prepara testo nella lingua del negozio + foto negli appunti.

Il check dell'ordine viene registrato automaticamente nello Storico richieste.
