# Richiesta a Deluxy Anagrafiche — archiviazione di un referente da Scout

Deluxy Scout, dalla Rubrica, permette di **archiviare un contatto (referente)** di
un negozio. L'archiviazione è già attiva **in locale** su Scout; vogliamo
**comunicarla al registro** così che il referente risulti archiviato anche lì.

Scout ha una chiave **di sola lettura**. Per questa scrittura serve, da parte
vostra, un endpoint e una **chiave con permesso di scrittura ristretto** ai soli
referenti (non all'intero partner). Scout la userà **solo server-side** dentro la
Edge Function `anagrafiche` (secret, mai nel browser) — coerente con la regola
"scrive solo la piattaforma": qui non tocchiamo il golden record del partner, solo
lo stato di un suo referente.

## Cosa serve

### 1. Campo sul modello `Contatto` (referente)
Aggiungere un flag di archiviazione, es.:
```prisma
archiviato   Boolean   @default(false)
archiviatoIl DateTime?
```
(oppure uno `stato` referente, se preferite un enum). Idealmente registrare anche
l'origine del cambio nello storico stati, come già fate per i partner.

### 2. Endpoint `POST /api/v1/referenti/archivia` (chiave di scrittura)
Body che Scout invierà:
```json
{
  "riferimento": { "sistema": "scout", "idEsterno": "<place_id di Scout>" },
  "negozio": "Nome del negozio",
  "citta": "Milano",
  "referente": { "nome": "Mario Rossi", "email": "mario@…", "telefono": "+39…" },
  "archiviato": true,
  "origine": "deluxy-scout"
}
```
Comportamento atteso:
1. Trova il **partner**: prima per `RiferimentoEsterno(sistema=scout, idEsterno)`;
   se non c'è, in fallback per `negozio`+`citta` (match come già fate).
2. Trova il **referente** dentro quel partner per **email** (preferita), poi
   telefono, poi nome normalizzato.
3. Imposta `archiviato` = valore ricevuto (idempotente: ri-archiviare non è errore).
4. Risposta: `200 { ok: true }`, oppure `404 { ok:false, reason:"partner_non_trovato" | "referente_non_trovato" }`.

### 3. Chiave di scrittura per Scout
Generatela ristretta ai referenti, es.:
```
npm run chiave -- deluxy-scout-referenti --scrittura-referenti
```
e comunicatecela: la imposteremo come secret **`ANAGRAFICHE_WRITE_KEY`** sulla Edge
Function `anagrafiche` di Scout.

## Lato Scout: già pronto
- La Edge Function `anagrafiche` gestisce l'azione `archivia_referente` e chiama
  `POST {BASE}/api/v1/referenti/archivia` con `x-api-key: ANAGRAFICHE_WRITE_KEY`.
- Finché `ANAGRAFICHE_WRITE_KEY` non è impostata **o** l'endpoint non esiste, la
  chiamata è **inerte** (`{ ok:false, reason:'non_configurato' }`): l'archiviazione
  locale in Scout funziona comunque, e si potrà risincronizzare in seguito.

Appena avete endpoint + chiave, impostiamo il secret e l'archiviazione fluisce
end-to-end senza altre modifiche a Scout.
