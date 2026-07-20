# HANDOFF — Deluxy Search/Supplier (aggiornato al 20/07/2026, commit `466c9dc`)

Per riprendere il lavoro su quest'app da una nuova sessione Claude. **Leggere prima
[AI_SPEC.md](AI_SPEC.md)**: è la scheda tecnica completa e aggiornata; questo file dice
solo dove siamo e come si lavora.

## Cos'è e dove vive
- **App live**: https://search-deluxy.vercel.app (progetto Vercel `search-deluxy`, team `deluxy`).
- **Repo**: `donatodnicolo-gif/search`, branch **`main`**, cartella **`deluxy-search-supplier/`**
  (Vercel ha la root del progetto puntata qui). **Push su `main` = deploy automatico (~1 min).**
- Un solo file front-end (`index.html`, vanilla JS) + funzioni Vercel in `api/`
  (`_auth.js` condiviso, `config.js`, `order.js`, `segnala.js`, `storico.js`, `oauth.js`, `webhook.js`).
  Niente npm, KV via REST. Node 24 disponibile per `node --check`.

## Come lavorare (macchina di Nicol)
- Clone/worktree già pronti: worktree su `main` in
  `C:/Users/nicol/app/.claude/worktrees/search-main/` (creato da `C:/Users/nicol/scoutwt`,
  che sta su `scout-ui` — NON lavorare sulla copia alla radice di scoutwt: è vecchia).
  Se manca: `git -C C:/Users/nicol/scoutwt worktree add <dir> main`.
- Anteprima locale SENZA Node: server PowerShell `C:/Users/nicol/scoutwt/.claude/serve.ps1`
  (parametri `-Root <cartella app> -Port 5511`); config `search-main` nel launch.json di
  `deluxy-platform-next/.claude/`. In locale le `/api/*` puntano alla produzione
  (`API_BASE` in index.html); la lock screen si aggira da console nascondendo `#lockScreen`.
- Verifica sempre su https://search-deluxy.vercel.app dopo il push (`curl | grep <marker>`).

## Stato attuale (tutto live e verificato)
1. **Login con utenze**: **email + password** (19/07). `APP_PASSWORD` (env Vercel) = amministratore,
   unico che salva le Impostazioni; utenze operative in Impostazioni → «Utenze dell'app».
   Le password utenze sono **hashate (scrypt+salt, 20/07)**: in KV solo `{nome, salt, passHash}`,
   migrazione automatica delle voci legacy. Header `x-app-password` + `x-app-user`.
2. **Viste**: Smistamento/Ricerca (operativa, 2 colonne: impostazioni a sinistra, risultati a
   destra), Impostazioni (solo card Admin, nascosta altrove), **Storico richieste**.
   Sidebar a scomparsa anche su desktop.
3. **Messaggio copiabile** (`#ord_msg`) rigenerato dai campi ordine, modificabile (il testo
   utente vince); su mobile WhatsApp via `wa.me` (app del telefono).
4. **Registro anagrafiche** (deluxy-anagrafiche.vercel.app, chiavi in Impostazioni):
   dopo ogni ricerca lookup **sempre per provincia** (sigla/nome/nome esteso, ripiego
   città capoluogo), partner 🤝/prospect 📋 in cima ai risultati, match per nome.
5. **💾 Salva in rubrica**: People API con dedupe per numero (ultime 9 cifre), nome contatto
   `FORNITORE [NOME] [FIORAIO|PASTICCERE] PROV. [PR]`; ripiego .vcf senza OAuth.
6. **📣 Segnala al commerciale**: `/api/segnala` fa un solo POST upsert-merge al registro
   secondo le sue regole d'ingaggio (`sistema:'deluxy-suppliers'` + `idEsterno`=place_id,
   `asOf`, niente `stato`): `esito creato` = nuovo prospect, `merged` = note accodate e
   ultimo contatto aggiornato dal registro. Anche le LETTURE passano dal proxy
   `/api/anagrafiche`: nessuna chiave del registro arriva più al browser.
7. **Storico richieste** (`/api/storico`, KV `storico:v1`): richieste WhatsApp/email,
   rubrica, segnalazioni — con utenza, negozio, esito, ordine.
8. **Deep link**: `?brand=…&ordine=…` oppure `?indirizzo=…&categoria=fiorai|pasticcerie`
   (si applicano dopo il login) — per il bottone nelle altre app.
9. **Storico con i check ordine** (20/07): ogni `/api/order` registra un evento `check`;
   import una tantum dei 60gg passati fatto (184 ordini); «↻ Riapri richiesta» su ogni evento.
10. **Stato ricerca + stelline** (20/07, `/api/stato`, KV `statoricerca:v1`): per ordine
   (`brand#numero`) stato `non iniziata/in corso/trovato` + ★ sui fornitori contattati
   (anche schede del registro, id `anag:<id>`), condivisi fra operatori; il click su
   «Invia richiesta» WhatsApp/email mette da solo «in corso» + stella.
11. **`/api/fornitori`** (20/07): top 3 fornitori per un ordine, per AI/plugin (comando `/fornitori`).

## Cose in sospeso
- **Utenze operative**: da creare in Impostazioni (finché non esistono si entra solo col
  pass code amministratore + un'email qualsiasi). Le email degli operatori vanno anche
  aggiunte come **test user** dell'app OAuth (vedi sotto).
- **Bottone nelle altre app**: deciso il deep link, manca l'integrazione (in quale app?).

## OAuth Google rubrica — CONFIGURATO E VERIFICATO (20/07/2026)
- Il client attivo è **«Deluxy search rubrica» `813248887384-kdksp8lq8p8pg4tou6b2q4i7r0avchjt`**
  nel progetto **My Project 75759** (`xenon-jetty-502714-c9`) dell'account
  **deluxy.delivery@gmail.com** — NON quello vecchio `639032328429-…` di deividcala
  citato dai handoff precedenti (esiste ancora, ma non va usato).
- Già in Impostazioni → «Google OAuth Client ID»; verificato su Google Cloud:
  origini JS `search-deluxy.vercel.app` + `deluxy-anagrafiche.vercel.app` + `localhost:3060`,
  **People API attivata**, app in modalità **Test** con test user
  deluxy.delivery@gmail.com e donatod.nicolo@gmail.com (nuovi operatori → aggiungerli qui:
  console.cloud.google.com/auth/audience?project=xenon-jetty-502714-c9).
- Duplicato registro «Essenza Fiorita»: già rimosso; «G32 Piante e Fiori Palermo» ha
  telefono italiano corretto. Niente da fare.

## Regole fisse
- Modifiche SEMPRE nel worktree su `main` → commit → push → verifica live. Mai committare
  segreti (le chiavi vivono in env Vercel o nella config KV via Admin).
- Aggiornare AI_SPEC.md (e questo HANDOFF) a ogni commit rilevante.
- CLAUDE.md alla radice del repo scoutwt + Deluxy Design System valgono anche qui.
