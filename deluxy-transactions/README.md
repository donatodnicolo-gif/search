# Deluxy Transactions

**Il registro dei pagamenti dell'ecosistema Deluxy.** Le altre app non pagano
nessuno: chiedono qui, tramite un'API firmata. Qui una persona autorizza, e da
qui esce la distinta SEPA che qualcuno carica in banca.

- Porta di sviluppo: **3160**
- Schema Postgres: `transactions`
- Stack: Next.js 15 (App Router) + Prisma + Postgres, deploy su Vercel

> **Confine dell'app (aggiornato il 26/07/2026).** Deluxy Transactions è
> **l'unica app dell'ecosistema da cui può uscire denaro**, e l'uscita ha una
> porta sola: il **pagatore** — una persona sola, impostazione `pagatoreEmail` —
> riceve un **codice via email** e lo digita insieme al suo **PIN**. Prima di
> quel gesto non si genera nessun file di pagamento.
>
> Dopo lo sblocco ci sono due modi di far uscire il denaro: il **file XML SEPA**
> da caricare in banca, oppure — se il collegamento a **Qonto** è acceso — i
> **bonifici veri**, uno per richiesta, verso beneficiari già resi *fidati*
> dentro Qonto e solo se la banca conferma che il nome corrisponde all'IBAN.
> Entrambe le strade passano dallo stesso cancello: non ce n'è una terza.

## Documenti

| Documento | A cosa serve |
|---|---|
| [docs/SICUREZZA.md](docs/SICUREZZA.md) | tutti i controlli, e perché ci sono |
| [docs/API.md](docs/API.md) | come un'app Deluxy chiede un pagamento |
| [docs/HANDOFF.md](docs/HANDOFF.md) | stato: cosa è fatto, cosa manca, come riprendere |
| [docs/esempio-client.mjs](docs/esempio-client.mjs) | client firmato da copiare nell'app che si integra |

## Come funziona, in breve

1. Un'app (Messaggi, Acquisti, Finance…) chiama `POST /api/v1/richieste` con
   importo, beneficiario, IBAN e causale. La chiamata è **firmata**: chiave API,
   marca temporale, nonce usa-e-getta e HMAC-SHA256 del corpo.
2. La richiesta entra **in attesa**. Un motore di rischio le dà un punteggio
   (IBAN mai visto, coordinate cambiate, doppione, importo, area non SEPA…).
3. Un **operatore** entra con email, password e codice a 6 cifre, e decide. Il
   codice serve **anche al momento della firma**, non solo all'accesso.
4. Sopra soglia o sopra un certo rischio servono **due firme di persone
   diverse**. Chi ha creato una richiesta a mano non può approvarla.
5. Le approvate finiscono in una **distinta SEPA** (`pain.001.001.03`). L'app
   registra l'impronta SHA-256 del file consegnato.
6. **Il file non si genera finché il pagatore non sblocca.** Chiede il codice,
   gli arriva per email (con importo e beneficiari scritti dentro), lo digita
   con il PIN: la distinta resta sbloccata pochi minuti, poi si richiude. Se la
   distinta cambia dopo l'invio del codice, il codice non vale più.
7. Sbloccata la distinta, o si scarica il **file SEPA**, o si fanno partire i
   **bonifici da Qonto** (`POST /v2/sepa/transfers`, con controllo
   dell'intestatario e idempotenza per richiesta). La pagina **Banca** mostra
   saldo e uscite del conto e riconosce le richieste dal riferimento in causale.
8. Non tutto passa da qui, e l'app lo ammette: una richiesta si può segnare
   **già pagata altrove** (bonifico fatto a mano dal portale della banca,
   contanti, compensazione) oppure **annullare**, dalla sua pagina o
   direttamente dalla coda. Serve il
   codice a 6 cifre e un motivo scritto; la richiesta esce dalla distinta in cui
   si trovava — è la difesa contro il doppio pagamento — e l'app che l'aveva
   chiesta viene avvisata col webhook. **Da qui non esce un euro**: si registra
   denaro già uscito, e infatti non si passa dal PIN del pagatore.
9. Ogni passaggio finisce in un **registro a catena di hash**: modificare la
   storia si vede.

## Avvio

```bash
npm install
npm run segreti          # genera TRANSACTIONS_ENC_KEY, APP_SECRET, CRON_SECRET
# copiare .env.example in .env e riempirlo
npm run db:push
npm run operatore -- --email tu@deluxy.it --nome "Nome Cognome" --password "…" --ruolo admin
npm run dev              # http://localhost:3160
```

Il comando `operatore` stampa il segreto per l'app di autenticazione (Google
Authenticator, 1Password…). **Si vede una volta sola.**

Per dare a un'app il permesso di chiedere pagamenti:

```bash
npm run chiave -- --nome deluxy-messaging --tetto 2000 --tetto-giorno 10000
```

Stampa `TRANSACTIONS_API_KEY` e `TRANSACTIONS_HMAC_SECRET`, da mettere nella
cassaforte del Hub sotto il progetto di quell'app. Sul database restano solo lo
SHA-256 della chiave e il segreto cifrato.

## Variabili d'ambiente

Solo i nomi (i valori non stanno mai in un file del repo): vedi
[.env.example](.env.example).

| Variabile | A cosa serve |
|---|---|
| `DATABASE_URL` / `DIRECT_URL` | Postgres condiviso, schema `transactions` |
| `TRANSACTIONS_ENC_KEY` | AES-256-GCM per i segreti a riposo (64 hex) |
| `APP_SECRET` | firma del cookie di sessione |
| `CRON_SECRET` | protegge `/api/cron/manutenzione` |
| `HUB_URL` / `HUB_KEYS_TOKEN` | cassaforte delle chiavi del Hub |

⚠️ `TRANSACTIONS_ENC_KEY` non si cambia dopo il primo avvio: i segreti già
cifrati (secondi fattori, chiavi HMAC) non si rileggerebbero più.

## Struttura

```
src/lib/       crypto, totp, iban, denaro, rischio, audit (catena hash),
               api-auth (chiave+firma+nonce+idempotenza), richieste, sepa
src/app/api/v1 le API per le altre app
src/app/       coda, richieste, distinte, beneficiari, registro, chiavi,
               operatori, impostazioni
```
