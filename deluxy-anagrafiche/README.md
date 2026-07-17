# Deluxy Anagrafiche

Registro centralizzato delle anagrafiche partner e prospect B2B: la **fonte di verità
unica** a cui accedono tutte le app dell'ecosistema Deluxy.

- Tutte le app leggono da qui (chiave API di sola lettura).
- Solo la **piattaforma consegne** (deluxy-platform-next / app.deluxy.it) ha la chiave
  di scrittura: quando lì viene creato o modificato un partner, la piattaforma lo invia
  qui automaticamente (vedi `deluxy-platform-next/api/src/partners/anagrafiche-sync.service.ts`).
- I dati iniziali arrivano dal tracker `ANAGRAFICHE B2B COMPLETE - ACTIVITY TRACKER.xlsx`
  (~570 anagrafiche: boutique, fioristi, pasticcerie, ristorazione, gifting, concierge).

Stack: Next.js 15 + Prisma + SQLite (come deluxy-hub e deluxy-partner). Porta **3060**.

## Avvio

```bash
cp .env.example .env
npm install
npm run db:push          # crea il database SQLite
npm run import:excel     # importa il tracker (default: ~/Downloads/ANAGRAFICHE B2B COMPLETE - ACTIVITY TRACKER.xlsx)
npm run dev              # http://localhost:3060
```

L'import è idempotente: rilanciandolo sostituisce solo le anagrafiche con
`fonte = "excel"`, senza toccare quelle create dalla piattaforma o a mano.

## Modello dati

`Partner`: nome, ragione sociale, categoria (BOUTIQUE, FIORISTA, PASTICCERIA, …),
stato del ciclo di vita (`prospect`, `in_contatto`, `in_attesa`, `in_trattativa`,
`da_ricontattare`, `attivo`, `non_interessato`, `dismesso`), città/provincia/regione,
indirizzo, email, telefono, P.IVA, CF, account commerciale, ultima visita, note,
`datiExtra` (JSON con i campi specifici del tracker: stime fatturato, fee, …),
`platformId` (id del partner su app.deluxy.it, chiave dell'upsert), `fonte`
(`excel` | `platform` | `manuale`), `attivo` (soft delete).

`Contatto`: persone di riferimento (ruolo, nome, telefono, email), estratte
automaticamente dal blocco contatti in testo libero dell'Excel.

`ApiKey`: chiavi delle app client; nel DB c'è solo lo SHA-256.

## Chiavi API

```bash
npm run chiave -- deluxy-platform --scrittura   # lettura + scrittura
npm run chiave -- deluxy-partner                # sola lettura
```

La chiave viene stampata una sola volta: copiarla nel `.env` dell'app client.
Rilanciare il comando con lo stesso nome rigenera (e revoca) la chiave.

## API REST (`/api/v1`)

Autenticazione: header `x-api-key: <chiave>` (oppure `Authorization: Bearer <chiave>`).

| Metodo | Percorso | Permesso | Descrizione |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | nessuno | Stato del servizio |
| GET | `/api/v1/partners` | lettura | Elenco con filtri e paginazione |
| GET | `/api/v1/partners/:id` | lettura | Dettaglio (`:id` può essere anche il `platformId`) |
| POST | `/api/v1/partners` | scrittura | Crea; se il body ha un `platformId` già noto fa upsert |
| PATCH | `/api/v1/partners/:id` | scrittura | Aggiornamento parziale |
| DELETE | `/api/v1/partners/:id` | scrittura | Disattiva (soft delete, `attivo=false`) |

Filtri di `GET /partners`: `q` (nome/ragione sociale/email), `categoria`, `citta`,
`provincia`, `regione`, `stato`, `fonte`, `platformId`, `attivo` (`false` = solo
disattivati, `tutti` = tutti), `page`, `perPage` (max 200).

Risposta dell'elenco: `{ totale, pagina, perPagina, dati: [...] }`.

Esempio:

```bash
curl -H "x-api-key: dlxk_…" "http://localhost:3060/api/v1/partners?categoria=FIORISTA&stato=attivo"
```

Nel body di POST/PATCH il campo `contatti` (lista di `{ruolo, nome, telefono, email}`)
sostituisce integralmente i contatti esistenti.

## Integrazione con la piattaforma consegne

Nel `.env` dell'API della piattaforma (`deluxy-platform-next/api/.env`):

```
ANAGRAFICHE_URL="http://localhost:3060"
ANAGRAFICHE_API_KEY="<chiave con scrittura>"
```

La sync è best-effort: se il registro non risponde, l'operazione sulla piattaforma
va comunque a buon fine e il mancato invio finisce nei log.

## App già integrate

- **deluxy-platform-next** (scrittura): sync automatica dei partner via
  `AnagraficheSyncService`.
- **deluxy-partner** (lettura): la scheda partner mostra la card "Anagrafica dal
  registro centralizzato" (`src/components/AnagraficaCard.tsx` +
  `src/lib/anagrafiche.ts`), con match per nome. Limite noto: se più anagrafiche
  hanno lo stesso nome (es. una catena in più città) viene mostrata la prima.

## UI

- `/` — elenco con ricerca e filtri (categoria, città, stato) e paginazione
- `/partner/:id` — scheda con anagrafica, persone di riferimento, note e dati del tracker

La UI segue il Deluxy Design System v1.0 (`deluxy-design-system/DESIGN-SYSTEM.md`).
