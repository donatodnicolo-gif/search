# Deluxy Scripts — handoff

**Aggiornato: 26 luglio 2026.** Cartella `C:\Users\nicol\scoutwt\deluxy-scripts`,
branch `scout-ui`, porta **3170**. Non ancora pubblicata.

Cos'è, in una riga: l'archivio unico degli script operativi Deluxy, dove ogni
script ha le sue variabili `{{COSÌ}}` e si accende o si spegne per singola app.
Il manuale d'uso è il [README](../README.md).

## FATTO (verificato in locale il 26/07/2026)

- **Dati** (Postgres condiviso, schema `scripts`, `prisma db push` eseguito):
  `Script`, `Variabile`, `AppCollegata`, `Abilitazione`, `ValoreVariabile`,
  `ApiKey`.
- **Variabili**: sintassi `{{NOME_VARIABILE}}`, rilevamento in tempo reale
  mentre si scrive, creazione automatica di quelle nuove al salvataggio, tipi
  testo / testo lungo / numero / vero-falso / scelta / **segreto**.
- **Abilitazione per app** con interruttore, valori diversi per ogni app e nota
  per app. Spegnendo, la configurazione resta.
- **Riquadro «Script pronto da copiare»**: si sceglie l'app, si vede il testo già
  composto, i segreti si incollano lì e non escono dal browser.
- **Pagine**: elenco con ricerca (anche dentro il codice) e filtri, dettaglio,
  registro app collegate, impostazioni con chiavi API e guida.
- **API v1** a chiave (`x-api-key`, hash SHA-256 nel DB): `health`, `app`,
  `script?app=`, `script/<slug>?app=`, `script/<slug>/testo?app=`.
- **Script CLI**: `configura-db-condiviso.mjs`, `crea-chiave.mjs`,
  `seed-app.mjs` (14 destinazioni: le app Deluxy + Google Ads + Shopify).
- **Standard**: `.vercelignore`, middleware con `SCRIPTS_APP_PASSWORD`, `/login`,
  token del design system, pagine `force-dynamic`, API `no-store`.
- **Prova reale end-to-end**: creato uno script Google Ads con 4 variabili,
  `CHIAVE_API` messa a segreto, acceso per `google-ads` con `BRAND=flowers` e
  `GIORNI_INDIETRO=14`; l'API ha restituito il testo composto con il segreto
  ancora come segnaposto e `daCompilare: ["CHIAVE_API"]`. Lo script di prova è
  stato poi cancellato: l'archivio parte vuoto.
- `npx tsc --noEmit` e `npm run build`: puliti.

## MANCA

1. **Pubblicazione su Vercel** (progetto `deluxy-scripts`): serve impostare
   `DATABASE_URL`, `DIRECT_URL`, `SCRIPTS_APP_PASSWORD` e poi
   `npx vercel deploy --prod --yes`. Finché non è pubblicata, il Hub la mostra
   solo in sviluppo (`APP_URL_SCRIPTS`).
2. **Riempire l'archivio**: i primi candidati sono gli script che oggi si
   copiano a mano — `google-ads-script.js` di Marketing (una copia per account e
   per azione: è esattamente il caso «stesse righe, variabili diverse»), gli
   snippet Liquid dei temi, le query SQL di manutenzione ricorrenti.
3. **Storico delle versioni**: oggi il testo si sovrascrive. Se serve tornare
   indietro va aggiunta una tabella `VersioneScript` (corpo + nota + data) e un
   pulsante «ripristina».
4. **Scrittura via API**: le chiavi hanno già il flag `scrittura`, ma nessun
   endpoint POST/PATCH lo usa. Da fare solo se un'app dovrà davvero depositare
   script da sola.
5. **Registro delle esecuzioni**: sapere quando e da chi uno script è stato
   preso/eseguito. Utile ma non richiesto.

## Trappole già pagate

- **`defaultValue` e server action**: dopo il salvataggio React riusa i campi già
  in pagina e i moduli mostrano ancora i valori vecchi. Le form del dettaglio e
  del registro app hanno una `key` che cambia a ogni salvataggio: **non
  toglierla**, il bug era reale (il tipo «segreto» tornava a mostrare «testo»).
- **CRLF dai textarea**: i browser mandano i fine riga come `\r\n`. Il corpo
  viene normalizzato a `\n` in `actions.ts` — senza, ogni script bash/SQL copiato
  da qui arriva pieno di `^M`.
- **I segreti non entrano nel database**: `salvaVariabile` cancella i valori già
  salvati quando una variabile diventa `segreto`, e `salvaValori` salta i segreti.
  Se un giorno servisse conservarli, va cifrato come in `deluxy-transactions`,
  non salvato in chiaro.
- **Lo slug è la chiave delle API**: cambia solo se cambia il nome, e chi
  consuma l'API va avvisato. `slugLibero` evita le collisioni.

## Come riprendere

```bash
cd C:/Users/nicol/scoutwt/deluxy-scripts && npm install && npm run dev   # → http://localhost:3170
```

Se il `.env` manca: `npm run configura-db -- ../deluxy-orders/.env`, poi
`npx prisma db push` e `npm run seed:app`.
