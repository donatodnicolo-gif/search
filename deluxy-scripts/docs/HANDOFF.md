# Deluxy Scripts — handoff

**Aggiornato: 26 luglio 2026.** Cartella `C:\Users\nicol\scoutwt\deluxy-scripts`,
branch `scout-ui`, porta **3170**. **LIVE su
[deluxy-scripts.vercel.app](https://deluxy-scripts.vercel.app)** (progetto Vercel
`deluxy-scripts`, team `deluxy`), protetta da password del team, con ingresso
automatico dal Hub.

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
- **AI (OpenAI, `gpt-4o-mini`)**: «Fatti scrivere una bozza» in *Nuovo testo* e
  «Fallo sistemare all'AI» nella pagina di un testo (7 ritocchi pronti + una
  richiesta libera). Sono **server action**, non rotte API: passano dalla stessa
  porta protetta da password, così la chiave OpenAI non è raggiungibile da fuori.
  L'AI propone e basta: niente si salva finché una persona non preme «usa questa
  versione». Prova reale del 26/07: brief dell'invito B2B di Natale → bozza con
  oggetto e 4 variabili (nessuna data inventata), poi «adatta a WhatsApp» →
  versione più corta applicata al testo.
- **Ingresso dal Hub (SSO)**: `/api/sso` legge il token cifrato del Hub e apre la
  sessione. Verificato in produzione: token valido → 307 su `/` con cookie;
  token assente, scaduto, per un'altra app o inventato → `/login`.
- **Prova reale end-to-end** (26/07): scritto un invito con oggetto e 6
  variabili, acceso per Customer Service con `FIRMA` e `LUOGO` suoi, compilate
  al volo le altre: testo e oggetto composti giusti, `{{DATA}}` rimasta in vista
  e segnalata, `mailto:` con oggetto e corpo, API che restituisce
  `daCompilare: [AZIENDA, DATA, NOME_CLIENTE, ORA]` e l'origine di ogni valore.
  Il testo di prova è stato cancellato: l'archivio parte vuoto.
- `npx tsc --noEmit` e `npm run build`: puliti.

## MANCA

1. **Riempire l'archivio**: i primi candidati sono i testi che oggi si copiano a
   mano da una chat all'altra — l'invito agli eventi, la presentazione per i
   nuovi partner B2B, il sollecito di pagamento, le risposte standard ai reclami.
2. **Usarlo dalle app**: Customer Service e AI Mail sono i due naturali (prendono
   il testo via API e riempiono `{{NOME_CLIENTE}}`, `{{DATA}}` con i dati
   dell'ordine che hanno già). Nessuna app lo chiama ancora.
3. **Storico delle versioni**: oggi il testo si sovrascrive. Se serve tornare
   indietro va aggiunta una tabella `VersioneScript` (corpo + nota + data).
4. **Scrittura via API**: le chiavi hanno già il flag `scrittura`, ma nessun
   endpoint POST/PATCH lo usa.
5. **Allegati e formattazione**: i testi sono testo semplice. Niente grassetto,
   niente immagini, niente PDF della presentazione.
6. **AI, secondo giro**: oggi la bozza nasce solo da un brief scritto a mano. I
   passi successivi naturali sono (a) partire da un testo che esiste già («fanne
   una versione per gli hotel»), (b) far leggere all'AI i testi migliori
   dell'archivio come esempi di tono, (c) far riempire le variabili all'app che
   usa il testo, coi dati veri dell'ordine.

## Trappole già pagate

- **`defaultValue` e server action**: dopo il salvataggio React riusa i campi già
  in pagina e i moduli mostrano ancora i valori vecchi. Le form del dettaglio e
  del registro app hanno una `key` che cambia a ogni salvataggio: **non
  toglierla**, il bug era reale.
- **CRLF dai textarea**: i browser mandano i fine riga come `\r\n`. Il testo
  viene normalizzato a `\n` in `actions.ts` — senza, il messaggio incollato in
  WhatsApp porta con sé caratteri invisibili.
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
