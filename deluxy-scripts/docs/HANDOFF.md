# Deluxy Scripts — handoff

**Aggiornato: 29 luglio 2026.** Cartella `C:\Users\nicol\scoutwt\deluxy-scripts`,
branch `scout-ui`, porta **3170**. **LIVE su
[deluxy-scripts.vercel.app](https://deluxy-scripts.vercel.app)** (progetto Vercel
`deluxy-scripts`, team `deluxy`), protetta da password del team, con ingresso
automatico dal Hub.

> Il database condiviso risponde: verificato il 29/07 sia da locale sia dalla
> produzione (Vercel → Postgres) dopo che l'utente aveva cambiato una password.
> Le credenziali in uso sono ancora valide.

Cos'è, in una riga: l'archivio dei **testi pronti** dell'azienda — offerte e
script di vendita, inviti, presentazioni, solleciti, risposte ai clienti — con i
buchi `{{COSÌ}}` che si riempiono con i dati di chi riceve. Manuale d'uso:
[README](../README.md).

> ⚠️ **Nato come archivio di script di codice, cambiato il 26/07/2026** dopo il
> chiarimento: «script» qui significa **copione commerciale**, non snippet
> tecnico. Se trovi in giro riferimenti a Google Ads Script, SQL o Liquid, sono
> resti da correggere: gli script di codice restano in
> [scripts/README.md](../../scripts/README.md).

## FATTO (verificato in locale e in produzione il 26/07/2026)

- **Dati** (Postgres condiviso, schema `scripts`): `Script` (titolo, categoria,
  canale, oggetto, corpo, etichette), `Variabile`, `AppCollegata`,
  `Abilitazione`, `ValoreVariabile`, `ApiKey`.
- **Categorie**: vendite · inviti · presentazione aziendale · follow-up e
  solleciti · assistenza e reclami · altro.
  **Canali**: email · WhatsApp · SMS · telefono (copione) · presentazione ·
  documento · altro.
- **Variabili**: sintassi `{{NOME_CLIENTE}}` valida nel corpo **e nell'oggetto**,
  rilevamento in tempo reale mentre si scrive, creazione automatica di quelle
  nuove al salvataggio, tipi testo / testo lungo / numero / data / scelta, più
  otto variabili comuni proposte con un clic (NOME_CLIENTE, AZIENDA, REFERENTE,
  DATA, ORA, LUOGO, FIRMA, LINK).
- **Abilitazione per app** con interruttore e valori diversi per ogni app: la
  firma di Customer Service non è quella del commerciale.
- **Riquadro «Usa questo testo»**: si sceglie l'app, si compilano al volo le
  variabili rimaste (non vengono salvate), si copia il testo, si apre WhatsApp
  (`wa.me`) o si scrive l'email (`mailto:` con oggetto e corpo).
- **Pagine**: elenco con ricerca e filtri, dettaglio, registro app collegate,
  impostazioni con chiavi API e guida.
- **API v1** a chiave (`x-api-key`, SHA-256 nel DB): `health`, `app`,
  `script?app=`, `script/<slug>?app=`, `script/<slug>/testo?app=`.
- **Chiavi generabili dalla UI** (Impostazioni → «Crea una chiave»): nome
  dell'app, permessi, chiave mostrata **una sola volta** con bottone «copia».
  Torna dentro il risultato della server action, mai in un redirect: così non
  passa dall'indirizzo del browser. Nome già esistente → errore, a meno che non
  si spunti «rigenera» (e allora la vecchia muore subito). Verificato il 26/07:
  chiave nuova funzionante, nel DB solo l'impronta (`hash` = SHA-256 della
  chiave, nessun `dlxs_` in chiaro), nome doppio bloccato, dopo la rigenerazione
  la vecchia risponde 401, e una chiave revocata pure.
- **AI (OpenAI, `gpt-4o-mini`)**: pagina **«Chiedi all'AI»** (`/script/ai`, con
  bottone nella barra in alto, nella sidebar, nell'elenco e in *Nuovo testo*)
  con un brief in 9 campi — cosa deve dire, a chi, che obiettivo, categoria,
  canale, tono, lunghezza, **deve dire per forza**, **non deve dire** — e
  «Fallo sistemare all'AI» nella pagina di un testo (7 ritocchi pronti + una
  richiesta libera). Sono **server action**, non rotte API: passano dalla stessa
  porta protetta da password, così la chiave OpenAI non è raggiungibile da fuori.
  L'AI propone e basta: niente si salva finché una persona non preme «crea il
  testo» / «usa questa versione». Prove reali del 26/07: invito B2B di Natale →
  bozza con oggetto e 4 variabili (nessuna data inventata), poi «adatta a
  WhatsApp» applicato; sollecito di pagamento con i limiti «niente azioni legali,
  niente mora» → testo fermo e cortese che li rispetta.
- **Ingresso dal Hub (SSO)**: `/api/sso` legge il token cifrato del Hub e apre la
  sessione. Verificato in produzione: token valido → 307 su `/` con cookie;
  token assente, scaduto, per un'altra app o inventato → `/login`.
- **Prova reale end-to-end** (26/07): scritto un invito con oggetto e 6
  variabili, acceso per Customer Service con `FIRMA` e `LUOGO` suoi, compilate
  al volo le altre: testo e oggetto composti giusti, `{{DATA}}` rimasta in vista
  e segnalata, `mailto:` con oggetto e corpo, API che restituisce
  `daCompilare: [AZIENDA, DATA, NOME_CLIENTE, ORA]` e l'origine di ogni valore.
  Il testo di prova è stato cancellato: l'archivio parte vuoto.
- **Scrittura da un'altra app** (aggiunta da un'altra sessione, commit
  `1e65a10d`): `POST /api/v1/script` crea o aggiorna un testo con una chiave di
  **scrittura**, e lo accende per l'app che l'ha mandato — così chi riconosce
  una formula buona mentre lavora in AI Mail la salva senza cambiare app, e il
  testo continua a vivere qui. Stesso commit: la sezione «Risposte rapide» in AI
  Mail.
- `npx tsc --noEmit` e `npm run build`: puliti.

## PUNTI APERTI (in ordine di cosa sblocca cosa)

1. **L'archivio è vuoto.** Finché non ci sono testi veri, tutto il resto è
   impianto: nessuno lo apre, nessuna app ha niente da leggere. Primi candidati,
   quelli che oggi si copiano a mano da una chat all'altra: invito agli eventi,
   presentazione per i nuovi partner B2B, sollecito di pagamento, le tre o
   quattro risposte standard ai reclami.
2. **Nessuna chiave è stata data a nessuno.** L'elenco chiavi è vuoto: si
   generano da *Impostazioni → Crea una chiave* (o `npm run chiave -- <app>`) e
   vanno nel `.env` dell'app come `SCRIPTS_API_KEY`, più cassaforte del Hub.
3. **Customer Service non lo chiama ancora.** AI Mail sì (sezione «Risposte
   rapide»); Customer Service è il naturale successivo: prende il testo via API e
   riempie `{{NOME_CLIENTE}}`, `{{DATA}}` coi dati dell'ordine che ha già.
4. **Nessuno ha ancora deciso i valori per app.** L'idea forte — stessa lettera,
   firma di Customer Service o del commerciale — funziona solo se qualcuno
   imposta `{{FIRMA}}` e i recapiti per ciascuna app.
5. **Storico delle versioni**: oggi il testo si sovrascrive, anche quando lo
   riscrive l'AI. Se serve tornare indietro va aggiunta una tabella
   `VersioneScript` (corpo + nota + data) e un pulsante «ripristina».
6. **AI, secondo giro**: oggi la bozza nasce solo da un brief scritto a mano. I
   passi naturali: (a) partire da un testo che esiste già («fanne una versione
   per gli hotel»), (b) dare all'AI i testi migliori dell'archivio come esempi di
   tono, (c) far riempire le variabili all'app che usa il testo, coi dati veri.
7. **Allegati e formattazione**: i testi sono testo semplice. Niente grassetto,
   niente immagini, niente PDF della presentazione.
8. **Password del database**: se un giorno cambia davvero, va aggiornata in
   `DATABASE_URL` e `DIRECT_URL` di **dieci app** (locale + Vercel, poi
   ripubblicare) — la password va URL-encoded dentro la stringa di connessione.

## Trappole già pagate

- **`defaultValue` e server action**: dopo il salvataggio React riusa i campi già
  in pagina e i moduli mostrano ancora i valori vecchi. Le form del dettaglio e
  del registro app hanno una `key` che cambia a ogni salvataggio: **non
  toglierla**, il bug era reale.
- **CRLF dai textarea**: i browser mandano i fine riga come `\r\n`. Il testo
  viene normalizzato a `\n` in `actions.ts` — senza, il messaggio incollato in
  WhatsApp porta con sé caratteri invisibili.
- **Al modello non basta l'elenco dei nomi delle variabili**: con la sola lista
  firmava i messaggi con `{{NOME_CLIENTE}}`. Nel prompt c'è ora il **significato**
  di ognuna (`{{FIRMA}}` = chi firma, `{{NOME_CLIENTE}}` = chi riceve): rifatta
  la prova, firma giusta.
- **Una riscrittura AI non deve cancellare quello che non ha riscritto**: il
  ritocco «adatta a WhatsApp» non propone un oggetto, e la prima versione di
  `applicaProposta` lo salvava come `null` — l'oggetto dell'email spariva in
  silenzio. Ora l'oggetto vuoto vuol dire «non l'ho toccato». Trovato provando,
  non leggendo: verificato che dopo un ritocco senza oggetto l'oggetto di prima
  è ancora lì.
- **Lo slug è la chiave delle API**: cambia solo se cambia il titolo, e chi
  consuma l'API va avvisato. `slugLibero` evita le collisioni.
- **`vercel env pull` non restituisce i valori**: scrive `"encrypted"` al posto
  di ognuno. Per allineare `HUB_SSO_SECRET` fra due app si prende dal `.env`
  locale del Hub, non da lì (ci ho perso un giro, credendo che il segreto fosse
  lungo 11 caratteri).

## Come riprendere

```bash
cd C:/Users/nicol/scoutwt/deluxy-scripts && npm install && npm run dev   # → http://localhost:3170
```

Se il `.env` manca: `npm run configura-db -- ../deluxy-orders/.env`, poi
`npx prisma db push` e `npm run seed:app`. Deploy:
`npx vercel deploy --prod --yes`.
