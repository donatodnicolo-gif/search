# Salvare contatti nella rubrica Google — brief per le app Deluxy

Come aggiungere a qualsiasi app Deluxy un pulsante «Salva in rubrica» che scrive
il contatto nella **rubrica Google** dell'operatore (People API), con controllo
duplicati per numero. Implementazione di riferimento **funzionante**:
`deluxy-search-supplier/index.html` (funzioni `getContactsToken`,
`findContactByPhone`, `createGoogleContact`, `contactName`, `downloadVcf`).

## Concetti chiave (non aggirabili)

- La rubrica di un account Google si scrive SOLO col **consenso OAuth di quell'account**:
  non esiste scrittura con una semplice API key. Il flusso giusto per app browser è
  **Google Identity Services (GIS) token flow**: al primo click Google chiede il consenso,
  poi si ottiene un access token temporaneo e si chiama la People API dal browser.
- Serve un **OAuth Client ID di tipo Web** (nessun client secret nel browser).
- Prevedere sempre un **ripiego .vcf** (file scaricato che si apre con la rubrica):
  copre l'assenza di Client ID, l'OAuth negato e il mobile.

## Infrastruttura Google già esistente (riusarla)

- Progetto Google Cloud: **«My Maps Project»** (`braided-box-423507-f3`, account
  deividcala@gmail.com) con **People API abilitata** e schermata consenso OAuth
  configurata (app «Deluxy», tipo Esterno, in modalità test).
- Client ID esistente (nome «Deluxy search rubrica»):
  `639032328429-16kj92rbb0ppigt8ps6oe0ds9lbfd45r.apps.googleusercontent.com`
- Per usare la rubrica da UN'ALTRA app: su Google Cloud → Google Auth Platform →
  Client → aprire quel client e **aggiungere l'origine JavaScript della nuova app**
  (es. `https://tuaapp.vercel.app`) — oppure creare un client dedicato nello stesso
  progetto. Gli account degli operatori vanno tra i **test user** (Pubblico) finché
  l'app OAuth resta in modalità test.
- Il Client ID è pubblico: si può mettere in una config, non è un segreto.

## Flusso client (browser, vanilla JS — copiare dalla reference)

1. **Carica GIS** on demand: `<script src="https://accounts.google.com/gsi/client">`.
2. **Token** (scope `https://www.googleapis.com/auth/contacts`):
   ```js
   const tc = google.accounts.oauth2.initTokenClient({
     client_id: CLIENT_ID, scope: 'https://www.googleapis.com/auth/contacts',
     callback: t => {/* t.access_token, t.expires_in */}
   });
   tc.requestAccessToken();   // 1° click: popup consenso; poi silenzioso
   ```
   Cache del token in memoria fino a scadenza (`expires_in`, tenersi 60s di margine).
3. **Controllo duplicati per numero** con `people:searchContacts`:
   - PRIMA una richiesta di **warm-up** (query vuota), come chiede la People API;
   - poi query col numero (provare: numero com'è, solo cifre, ultime 9 cifre);
   - confronto finale in codice sulle **ultime 9 cifre** (ignora +39 e spazi).
   ```
   GET https://people.googleapis.com/v1/people:searchContacts?query=…&readMask=names,phoneNumbers&pageSize=10
   Authorization: Bearer <token>
   ```
   Se trovato → mostrare «Già in rubrica: <nome>» e NON creare.
4. **Creazione** con `people:createContact`:
   ```
   POST https://people.googleapis.com/v1/people:createContact
   { "names":[{"givenName": NOME_CONTATTO}],
     "organizations":[{"name": nomeNegozio}],
     "phoneNumbers":[{"value": telefono, "type":"work"}],
     "emailAddresses":[{"value": email, "type":"work"}],
     "addresses":[{"formattedValue": indirizzo, "type":"work"}],
     "urls":[{"value": sito, "type":"work"}],
     "biographies":[{"value":"Aggiunto dall'app <nome-app>"}] }
   ```
5. **Convenzione di naming Deluxy** (usarla identica in tutte le app):
   `FORNITORE [NOME NEGOZIO] [FIORAIO|PASTICCERE|…] PROV. [SIGLA]`
   es. `FORNITORE G32 PIANTE E FIORI PALERMO FIORAIO PROV. PA`
6. **Ripiego .vcf** (stesso nome contatto): generare un VCARD 3.0 con FN/ORG/TEL/EMAIL/ADR/URL
   e scaricarlo come Blob (`text/vcard`) — sul telefono si apre direttamente nella rubrica.
   Nel .vcf il controllo duplicati non è possibile: ci pensa la rubrica all'importazione.

## Errori tipici

- **redirect/origin mismatch**: l'origine JavaScript del client DEVE essere esattamente
  l'URL dell'app (https, senza slash finale).
- **403 access_denied**: l'account che acconsente non è tra i test user.
- **searchContacts vuoto anche se il contatto c'è**: manca la richiesta di warm-up.
- Il token è per-browser e per-account: ogni operatore acconsente col PROPRIO account
  Google la prima volta; i contatti finiscono nella rubrica di quell'account.
