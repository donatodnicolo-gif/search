# Fare l'APK Android di AI Mail

Prima la verità tecnica, perché evita un giro a vuoto.

## Perché l'APK non è un'app "che gira da sola"

AI Mail ha un motore che **deve stare su un server**: legge la posta via IMAP,
tiene cifrate le password delle caselle, chiama OpenAI. Un telefono non può fare
niente di tutto questo — un'app Android non apre connessioni IMAP grezze e non
può custodire la chiave OpenAI.

Quindi l'APK è un **guscio** attorno all'app ospitata online: dentro c'è il
sito, aperto a schermo intero senza barra del browser. Ne segue una cosa sola,
ma decisiva:

> **Serve prima mettere l'app online.** Un APK che punta a `localhost` funziona
> solo sul PC dove gira il server, non sul telefono. Il guscio deve puntare a un
> URL pubblico HTTPS (Vercel).

Se l'unica cosa che ti serve è **usarla dal telefono**, non ti serve un APK:
apri l'URL online con Chrome → menù → **Installa app**. La PWA è già pronta
(icone comprese) e si comporta come un'app, con la sua icona nella home. L'APK
serve solo se la vuoi distribuire come pacchetto o metterla sul Play Store.

## Fatto: le icone

`public/icon-192.png` e `icon-512.png` (la "D" oro Deluxy) sono generate e
referenziate nel manifest PWA. Per rifarle: `node scripts/genera-icone.mjs`.

## I tre passi per l'APK

### 1. Metti l'app online
Segui [../docs/METTERE-ONLINE.md](../docs/METTERE-ONLINE.md). Alla fine hai un
URL tipo `https://ai-mail-deluxy.vercel.app` che si apre e chiede la password.

### 2. Installa gli strumenti Android (una volta sola)
Su questa macchina **mancano** — servono:
- **JDK 17** (Temurin/Adoptium)
- **Android SDK** (via Android Studio, o solo i command-line tools)
- **Bubblewrap**: `npm i -g @bubblewrap/cli`

Bubblewrap sa scaricarsi da solo JDK e SDK al primo `bubblewrap init` se glielo
lasci fare — è la strada più semplice.

### 3. Genera l'APK
Da `deluxy-mail/android/`, dopo aver messo il dominio reale in
`twa-manifest.json` (i due `REPLACE-CON-IL-DOMINIO`):

```bash
bubblewrap init --manifest ./twa-manifest.json
bubblewrap build
```

`bubblewrap build` chiede di creare una **chiave di firma** (keystore): è tua,
tienila al sicuro — serve per ogni aggiornamento futuro dell'APK. Alla fine
trovi `app-release-signed.apk`: quello lo copi sul telefono e lo installi
(attivando "origini sconosciute").

### La barra del browser (Digital Asset Links)
Perché l'APK si apra **senza** la barra dell'indirizzo, il sito deve dichiarare
di fidarsi dell'app. Bubblewrap stampa un file `assetlinks.json` da mettere su
`https://IL-TUO-DOMINIO/.well-known/assetlinks.json`. Su Vercel: crea
`public/.well-known/assetlinks.json` col contenuto che ti dà Bubblewrap e
ridispiega. Senza, l'APK funziona lo stesso ma mostra una sottile barra col
dominio in alto.

## In breve

| Cosa | Stato |
|---|---|
| Icone PWA | ✅ fatte |
| Manifest PWA installabile | ✅ (`public/manifest.webmanifest`) |
| Config TWA per l'APK | ✅ (`twa-manifest.json`, da completare col dominio) |
| App online | ⛔ da fare (serve Supabase + Vercel) |
| JDK + Android SDK | ⛔ non su questa macchina |
| Binario `.apk` | ⛔ dipende dai due punti sopra |

Il collo di bottiglia è sempre lo stesso: **mettere l'app online**. Fatto quello,
l'APK sono due comandi.
