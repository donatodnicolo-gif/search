# Handoff — Deluxy Acquisti

Stato al 21/07/2026. App nuova, creata in questa sessione.

## FATTO

- Scaffold Next.js 15 + React 19 + Prisma + Postgres (schema `acquisti`), porta **3100**.
- **Modello dati** (`prisma/schema.prisma`): `RichiestaAcquisto` (con flusso approvazione + relazione 1-a-1 all'acquisto), `Acquisto` (imponibile/IVA/totale, stato, fornitore denormalizzato + `fornitoreId` opzionale verso anagrafiche), `MovimentoFinanziario` (acconto/saldo/pagamento/nota_credito/rimborso, previsto|eseguito), `ApiKey`.
- **UI** (Deluxy Design System): dashboard con riepilogo (da approvare / aperti / da pagare / speso 12 mesi), tab Richieste/Acquisti, card con azioni, modali per nuova richiesta / nuovo acquisto / registra movimento. Identità "io" salvata nel browser (topbar).
- **Flusso richieste**: crea → approva/rifiuta (no auto-approvazione; `ACQUISTI_APPROVATORI` opzionale) → converti in acquisto.
- **Movimenti**: registrazione con ricalcolo automatico dello stato di pagamento dell'acquisto (ordinato → pagato_parziale → pagato); barra di avanzamento pagamento.
- **AI (OpenAI)**: ricerca in linguaggio naturale (`/api/interno/ai/ricerca` → filtro → query DB) ed estrazione campi da fattura incollata (`/api/interno/ai/estrai`). Spente senza `OPENAI_API_KEY`, app comunque usabile.
- **API pubbliche** `x-api-key`: `GET/POST /api/v1/acquisti`, `GET/POST /api/v1/richieste`, `GET /api/v1/health`.
- **Ecosistema**: registrata nel catalogo Hub (`deluxy-hub/src/lib/apps.ts`, id `acquisti`, `APP_URL_ACQUISTI`, ruoli admin+partner) con icona in `AppIcon.tsx`.
- **Verifica**: `npx tsc --noEmit` pulito, `next build` OK (9 route).

## MANCA / DA FARE

1. **Database**: puntare al cluster condiviso e creare lo schema.
   ```bash
   npm run db:condiviso -- ../deluxy-hub/.env.vercel-prod
   npm run db:push
   npm run seed:demo   # facoltativo
   ```
   ⚠️ Crea lo schema `acquisti` sul Postgres condiviso: farlo con conferma.
2. **Verifica visiva**: `npm run dev` (3100) e controllare a schermo (non ancora fatto: serve il DB).
3. **Segreti**: impostare `OPENAI_API_KEY` (per AI) e `ACQUISTI_APP_PASSWORD` (in produzione).
4. **Deploy**: progetto Vercel dedicato (Root = `deluxy-acquisti`), env `DATABASE_URL`/`DIRECT_URL`/`OPENAI_API_KEY`/`ACQUISTI_APP_PASSWORD`/`ACQUISTI_APPROVATORI`; impostare `APP_URL_ACQUISTI` nel Hub.
5. **Chiavi API** per le app che devono scrivere richieste/acquisti: `npm run chiave -- <app> --scrittura`.

## Idee successive

- Estrazione fattura anche da **foto/PDF** (ora solo testo incollato): input immagine → modello vision.
- Collegare il fornitore al registro `deluxy-anagrafiche` (ricerca + `fornitoreId`).
- Scadenzario dei movimenti "previsti" (avvisi pagamenti in scadenza) e push su `deluxy-tasks`.
- Allegati (fatture) su storage.
