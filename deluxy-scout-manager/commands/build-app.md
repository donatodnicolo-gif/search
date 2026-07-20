---
description: Passi per creare una build installabile di Deluxy Scout con EAS (per provare l'app sul telefono).
---

Prepara una build installabile di Deluxy Scout. `react-native-maps`, la geolocalizzazione e le notifiche richiedono un **development/preview build** (non tutto funziona in Expo Go).

Prerequisiti dell'utente:
- Un **account Expo** (per `eas login`).
- Le **chiavi Google Maps** in `.env` (`EXPO_PUBLIC_GOOGLE_MAPS_ANDROID_KEY`, `..._IOS_KEY`), altrimenti la mappa resta vuota. Richiedono un progetto Google Cloud con **billing attivo** e le API "Maps SDK for Android/iOS".

Passi (PowerShell):
```powershell
$env:Path = "$env:ProgramFiles\nodejs;$env:Path"
Set-Location 'C:\Users\nicol\app\deluxy-scout'

npx -y eas-cli login          # login account Expo (fallo fare all'utente)
npx -y eas-cli init           # popola EAS_PROJECT_ID in app.config/eas.json
# le env EXPO_PUBLIC_* per la build cloud NON si leggono da .env: impostale
npx -y eas-cli env:create     # oppure metti i valori nel profilo di eas.json

npx -y eas-cli build --profile preview --platform android   # APK installabile
npx -y eas-cli build --profile preview --platform ios       # richiede setup Apple
```

Distribuzione:
- **Android**: condividi l'APK/il link del profilo `preview`, oppure Internal Testing su Google Play.
- **iOS**: TestFlight (`npx eas-cli submit -p ios`) invitando le email del team.

Non digitare tu password/credenziali degli store: falle inserire all'utente.
