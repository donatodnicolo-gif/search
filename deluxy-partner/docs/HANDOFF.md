# Deluxy Partner — Handoff / Stato del prodotto

**Ultimo aggiornamento:** 20 luglio 2026 (pro-forma, contatto amministrativo, emissione FIC, cron Qonto, fix regione) · branch `scout-ui` (origin).
Questo è il documento "parti da qui": stato reale del prodotto, funzioni, API, integrazioni, dati e come lavorarci. La fonte di verità funzionale storica resta [PROGETTO.md](PROGETTO.md); questo file è il quadro corrente più completo.

---

## 1. Cos'è, dov'è

App che **sostituisce PARTNER.xlsx**: gestione finanziaria e operativa dei partner Deluxy (servizi a fatturazione, vendite come vendor, saldi/compensazioni, bonifici, scadenze, riconciliazione bancaria, reportistica, API per gli altri progetti).

- **Cartella:** `deluxy-partner/` nel monorepo `C:\Users\nicol\scoutwt` (branch `scout-ui`).
- **Produzione:** https://deluxy-partner.vercel.app (progetto Vercel `deluxy/deluxy-partner`).
- **Accesso UI:** password unica di team, env `PARTNER_APP_PASSWORD` su Vercel (oggi: `GuantiBianchi2026!`). Cambiandola si disconnettono tutte le sessioni.
- **Porta locale:** 3040.

## 2. Stack e avvio

- Next.js 15 (App Router, server components + server actions), Prisma 6, **PostgreSQL Supabase** (progetto `deluxy-partner`, ref `zegbztfxisqeowngvgvh`, eu-central-1). React 19, TypeScript.
- Design: **Deluxy Design System v1.0** (token in `src/app/tokens.css`, copia di `deluxy-design-system/tokens/tokens.css`).

```bash
cd deluxy-partner
npm install
# .env locale (NON in git) con DATABASE_URL + DIRECT_URL del Postgres Supabase.
# Senza PARTNER_APP_PASSWORD nel .env l'app locale è aperta (niente login).
npm run dev        # http://localhost:3040
```

- **Deploy:** `npx vercel --prod --yes` dalla cartella. Build fa `prisma generate && next build`.
- **Typecheck prima di ogni deploy:** `npx tsc --noEmit`.
- ⚠️ **Windows:** il dev server blocca la DLL di Prisma. Prima di `prisma db push` / reinstalli, **ferma il dev server** (in questa sessione si usa `preview_stop`).

## 3. Variabili d'ambiente

Su Vercel (produzione) e nel `.env` locale:

| Variabile | Dove | A cosa serve |
|---|---|---|
| `DATABASE_URL` | Vercel + .env | Postgres Supabase, pooler 6543 con `?pgbouncer=true&connection_limit=5` |
| `DIRECT_URL` | Vercel + .env | Postgres, pooler 5432 (migrazioni/`db push`) |
| `PARTNER_APP_PASSWORD` | Vercel | Password login UI (assente in locale = app aperta) |
| `OPENAI_API_KEY`, `OPENAI_MODEL` | Vercel + .env | Recap AI (chiave condivisa con deluxy-mail; modello `gpt-4o-mini`) |
| `OPENAI_VISION_MODEL` | Vercel + .env (facoltativa) | Lettura AI foto IBAN in Pagamenti diretti (default `gpt-4o`, deve avere capacità vision) |
| `CRON_SECRET` | Vercel | Autorizza il cron `/api/cron/qonto` (senza → 503, cron disattivo) |
| `ANAGRAFICHE_URL`, `ANAGRAFICHE_API_KEY` | Vercel + .env | Lettura dal registro anagrafiche centralizzato (sola lettura) |

**Importante — credenziali NON in env, ma nel DB** (tabella `Impostazione`, chiave/valore): SMTP solleciti (`smtp.*`), Qonto (`qonto.*`), Fatture in Cloud (`fic.*` incluso access/refresh token), ordinante SEPA (`sepa.*`), chiave API pubblica (`api.verificheKey`). Si gestiscono dalla pagina **Impostazioni** e **/verifiche**, non toccando Vercel.

## 4. Dati importati (stato)

Da `PARTNER.xlsx` (foglio "Database clienti 2026"): **92 partner**, ledger mensile gen–giu 2026. Storico **2025** dal foglio "Database clienti 2025" (331 fatture, 198 vendite, 643 saldi). Import una-tantum via `prisma/seed.mjs` (2026) e `prisma/seed-2025.mjs` (additivo 2025). **⚠️ `npm run db:seed` cancella e reimporta: MAI sul DB di produzione in uso.**

Riconciliazione incassi già applicata (`prisma/riconcilia-incassi.mjs`): 17 fatture incassate ma senza spunta segnate pagate.

## 5. Motore di calcolo — `src/lib/calc.ts` (unica fonte delle formule)

```
commissione        = incasso vendite × fee%            (netto IVA)
dovuto al partner  = incasso − commissione × 1,22       (netto commissioni IVATE)
```

**Due regimi in base al flag `compensazione` del partner** (decisione utente 17/07/2026):
- **CON compensazione** (6 partner): saldo netto mensile = servizi IVATI − dovuto vendite; residuo = saldo + bonifici.
- **SENZA compensazione** (tutti gli altri): due partite separate, mai compensate: `daIncassare` = fatture non saldate IVATE − acconti; `daBonificare` = dovuto vendite − bonifici inviati. Mese pareggiato = entrambe a 0.

Convenzione bonifici: `> 0` inviato al partner, `< 0` ricevuto. `RiepilogoMese` espone `daIncassare/daBonificare/pareggiato`. `rolling()` = cumulati YTD.

**Fee nel tempo** (`src/lib/fee.ts` + modello `TariffaPartner`): "dal mese/anno la fee diventa X%". Ogni vendita salva uno **snapshot** della fee del suo mese; le vendite passate restano invariate, le nuove prendono la fee valida per il mese (`feeApplicabile`/`feeDaTariffe`). La fee della singola vendita si modifica in `/vendite/[id]`; "Riallinea fee vendite" nella scheda partner applica a ciascuna vendita la fee prevista dallo storico per il suo mese.

## 6. Sezioni UI (route)

| Route | Cosa fa |
|---|---|
| `/` Dashboard | KPI anno + bonifici da fare + fatture scadute; bottone "Paga" rapido |
| `/partner`, `/partner/[id]`, `/partner/nuovo`, `/partner/[id]/modifica` | Lista (con totale e delta vs 2025), scheda con Recap AI, anagrafica centralizzata, **contatto amministrativo** (campi `amm*`, importabile dal registro Anagrafiche) con **elenco fatture aperte e invio sollecito diretto**, Fee nel tempo, Rolling, movimenti mensili con registrazione pagamenti e note, totale YTD |
| `/fatture`, `/fatture/[id]`, `/fatture/nuova` | Servizi a fatturazione; scheda record editabile; tipologia obbligatoria dal "Piano per Area" |
| `/vendite`, `/vendite/[id]`, `/vendite/nuova` | Vendite come vendor; scheda con modifica fee/incasso |
| `/proforma`, `/proforma/nuova`, `/proforma/[id]`, `/proforma/[id]/modifica`, `/proforma/[id]/invia` | **Pro-forma ad hoc**: righe libere con totali live, numerazione `PF n/anno` per anno, documento stampabile (Stampa/PDF del browser, `@media print`), invio email (SMTP o mailto, testo precompilato modificabile). Stati: bozza → inviata → **fatturata** (con n° fattura definitiva) oppure **annullata**; bozze modificabili/eliminabili, stati sempre reversibili. Intestazione mittente da Impostazioni → "Intestazione documenti" (chiavi `azienda.*`). Logica: `src/lib/proforma.ts` + `proforma-actions.ts`, editor righe `RigheProForma.tsx` |
| `/saldi` | Riconciliazione mensile per partner, export SEPA/CSV |
| `/pagamenti`, `/pagamenti/nuova`, `/pagamenti/[id]` | **Pagamenti diretti ai fornitori**: si carica una foto/screenshot dei dati bancari, l'**AI (OpenAI vision)** legge beneficiario/IBAN/BIC/importo/causale (`/api/pagamenti/leggi`), l'operatore **verifica** (validazione IBAN mod-97) e predispone il bonifico. Esecuzione = **file SEPA** del singolo pagamento (`/api/pagamenti/[id]/sepa`) da autorizzare in Qonto/home banking. **L'app non esegue pagamenti.** Stati: predisposto → pagato \| annullato. La foto non viene salvata. `src/lib/lettura-iban.ts`, `src/lib/sepa.ts`, `src/lib/pagamenti-actions.ts` |
| `/transazioni` | **Import transazioni**: upload CSV/XLSX (parser tollerante, incluso Vivid) o **Sincronizza da Qonto**; riconciliazione con match a 1 click, discrepanze, non riconosciute, ricerca morbida, "attesi mancanti" |
| `/scadenzario` | Fatture da incassare (con "Invia sollecito" + "Emetti su FIC"), bonifici pendenti, commissioni da emettere. **Ricerca** (partner/n. fattura/tipologia/IBAN) su tutte e tre le tabelle e **colonne ordinabili indipendenti** per tabella (default: nome partner) |
| `/report`, `/confronti`, `/analisi` | Report per tipologia/città/categoria + forecast; Confronti 2026 vs 2025 (mese/trimestre/anno/personalizzato); Analisi finanziaria per scadenza con split saldato/da saldare e liquidità Qonto live |
| `/ordini` (Orders) | **Ordini dei negozi Shopify riconciliati con gli incassi.** Scarico multi-negozio via GraphQL Admin API 2024-10 (`scaricaOrdini`), token per negozio in `NegozioShopify` (Impostazioni → Negozi Shopify). Ogni ordine è categorizzato dal `paymentGatewayNames`: **bonifico** → match 1:1 con un movimento `TransazioneBancaria` (Qonto/Vivid) per importo ±0,02 + nome (proposta da confermare, `suggerisciMovimenti`); **carta** già pagata → `incassato_gateway` automatico (payout aggregato); **contrassegno/altro** → spunta a mano. Stati: da_riconciliare / riconciliato / incassato_gateway / ignorato. Modelli `NegozioShopify` + `OrdineShopify`. `src/lib/shopify.ts`, `ordini.ts`, `ordini-actions.ts`. 3 negozi noti: fb72b1-2 (deluxyflowers), deluxygifts (deluxy.it), cakedesign-5921 (cakedesign.me); i token vanno inseriti in Impostazioni |
| `/registrazioni/riconciliazione` | **Riconciliazione clienti FIC ↔ partner Deluxy** (abbina per nome, `matchPartner`). Per i conciliati con `anagraficaId` prepara i dati fiscali di FIC (P.IVA, CF, indirizzo) e, **su conferma per record**, li invia al registro Anagrafiche (`aggiornaAnagrafica`, PATCH, sistema `deluxy-partner`, `asOf`). Elenca anche i partner abbinati ma non collegati al registro e i clienti FIC **senza conciliazione**. Scrittura gated su `ANAGRAFICHE_WRITE_KEY` (assente = solo lettura). Stato conferma/ignora in `RiconciliazioneAnagrafica`. `src/lib/riconciliazione-fic.ts`, `ficClientiFiscali()` |
| `/registrazioni/fatture` | **Elenco delle fatture reali emesse su Fatture in Cloud** (fonte: FIC, non il DB): numero, data, cliente, imponibile/IVA, stato incasso, link "Apri su FIC". Ricerca (cliente/numero) e filtro anno lato FIC. `ficFatture()` in `src/lib/fic.ts` |
| `/fic/emetti` | Emissione fattura commissioni su Fatture in Cloud (non inviata allo SDI; numero di ritorno) |
| `/fic/fattura?proforma=<id>` \| `?fattura=<id>` | **Emissione fattura vera su FIC** da una pro-forma (che passa a `fatturata`) o da una fattura servizi senza numero (che riceve numero ed emissione). Anteprima righe, cliente FIC preselezionato per somiglianza, scadenza; supporta più righe e aliquote ≠ 22% (mappate da `/info/vat_types`; se il permesso manca si ferma con messaggio esplicito invece di applicare l'IVA sbagliata) |
| `/solleciti/[id]` | Anteprima e invio sollecito di pagamento (SMTP o mailto) |
| `/impostazioni` | Ordinante SEPA, SMTP (Register.it), Qonto, Fatture in Cloud (Collega OAuth), accesso |
| `/verifiche` | Gestione chiave API pubblica + documentazione + storico richieste |

Sidebar riducibile a icone (preferenza in localStorage). **Operatività**: Dashboard, Servizi a fatturazione, Vendite come vendor. **Registrazioni**: Fatture (elenco fatture reali da Fatture in Cloud, `/registrazioni/fatture`) e Pro-forma.

**Prestazioni**: le funzioni girano in `fra1` (Francoforte) accanto al Postgres Supabase — `vercel.json`. Prima erano su `iad1` (Washington) e ogni query attraversava l'Atlantico: era **quella** la causa della lentezza (2,3 s per le 4 query del riepilogo, con soli 2 ms di elaborazione). Se si tocca la regione o si migra il DB, tenerli nella stessa area.

## 7. API pubbliche (per gli altri progetti Deluxy)

Base `https://deluxy-partner.vercel.app`. Auth: header `X-API-Key: <chiave>` (unica, in `Impostazione.api.verificheKey`, gestita in `/verifiche`). Header facoltativo `X-App: <nome>` per lo storico. Ogni chiamata → tabella `RichiestaVerifica`. Rotte escluse dal middleware di sessione: `api/verifiche`, `api/fatture`, `api/proforma`, `api/tipologie`, `api/cron`, `api/fic/callback`.

1. **`GET /api/verifiche?partner=<nome o id>`** → situazione finanziaria partner (venditeYtd, serviziFatturatiYtd, commissioniYtd, dovutoAlPartner, daIncassare, daBonificare, residuo, fattureAperte{numero,totaleIvato,scaduto}, debiti/crediti2025). `src/lib/verifica.ts`.
2. **`GET /api/fatture?numero=181/2026`** (o `?id=`) → stato pagamento fattura (`pagata`, `dataPagamento`, `scaduta`, `scadenza`, `competenza`, imponibile/aliquota/totale, tipologia, partner). Riconosce numeri raggruppati. `src/lib/verifica-fattura.ts`.
3. **`GET /api/tipologie?anno=2026`** (o `&mese=6`, o `&dal=1&al=6`, o `&stato=pagate|aperte`) → totali dei servizi a fatturazione **aggregati per tipologia** nel periodo: per ciascuna `imponibile`/`iva`/`totale`/`fatture`/`quota%`, più i `totali` complessivi. `src/app/api/tipologie/route.ts`.
4. **`GET /api/proforma?numero=1/2026`** (o `?id=`, o `?partner=<nome|id>&stato=…` per l'elenco) → dettaglio/elenco pro-forma con righe, totali, `stato` e `fatturaNumero`. **`POST /api/proforma`** (body JSON: `partner`, `righe[{descrizione, prezzoUnitario, quantita?, aliquotaIva?}]`, `data?`, `scadenza?`, `oggetto?`, `note?`) → crea una pro-forma **in bozza** con numero `PF n/anno` automatico; invio e annullo restano nell'app. **`PATCH /api/proforma`** (body JSON: `id` **o** `numero` es. `"1/2026"`, `fatturaNumero?`) → **conferma il pagamento** dalle altre app: la pro-forma passa a `fatturata` (con `fatturataIl` + eventuale n° fattura definitiva). Idempotente (già fatturata → 200 con `avviso`); 422 se annullata (riaprirla dall'app). Es. Scout può chiamarla quando segna un incasso ricevuto. `src/app/api/proforma/route.ts`.

Esiti: 200 trovato · 404 non trovato (con `candidati`) · 401 chiave errata · 400 parametro mancante. Auth condivisa in `src/lib/apiauth.ts`.

**API interne (NON per altri progetti, protette da login):** `/api/recap` (recap AI), `/api/sepa` (export bonifici pain.001 + CSV), `/api/fic/authorize`+`/api/fic/callback` (OAuth Fatture in Cloud).

## 8. Integrazioni (stato)

- **Qonto** ✅ collegato (org DELUXY S.R.L., 2 conti). API terze parti a chiave (`qonto.*` nel DB). "Sincronizza da Qonto" in `/transazioni` scarica i movimenti completati (dedup per hash). **Sincronizzazione automatica**: cron Vercel `/api/cron/qonto` ogni notte alle 5 (`vercel.json`), protetto da `CRON_SECRET` (senza segreto → 503). Scarica soltanto: **nessuna registrazione automatica**, i match restano da confermare in `/transazioni`; data/ora dell'ultimo scarico in `qonto.ultimaSync`, mostrata in pagina. `src/lib/qonto.ts`, `src/lib/transazioni-actions.ts` (`scaricaMovimentiQonto`).
- **Fatture in Cloud** ✅ collegato (app "FINANCE", azienda "Deluxy srl", id 712328). OAuth con refresh automatico (`fic.*` nel DB). Emissione fatture commissioni non-SDI con numero di ritorno; lettura clienti e fatture. `src/lib/fic.ts`.
- **OpenAI** ✅ Recap AI nella scheda partner (`/api/recap`, `src/lib/recap.ts`). Note mensili incluse nel prompt.
- **SMTP solleciti** (Register.it): preset `authsmtp.deluxy.it:587`, utente `smtp@deluxy.it`; **manca password + mittente** (da inserire in Impostazioni). `src/lib/mail.ts`.
- **Deluxy Anagrafiche** (lettura): card "Anagrafica dal registro centralizzato" nella scheda partner (`src/lib/anagrafiche.ts`, `AnagraficaCard.tsx`, campo `Partner.anagraficaId`). Il registro è la fonte di verità anagrafica; qui si legge soltanto — vedi `deluxy-anagrafiche/README.md`.
- **Vivid**: nessuna API pubblica → si usa l'export CSV in `/transazioni` (formato riconosciuto: Completed date, Counterparty name, Reference, Payment amount).

## 9. Modello dati (Prisma)

`Partner` · `TipologiaServizio` · `FatturaServizio` · `VenditaVendor` · `SaldoMensile` (chiusura mensile: extra, fattura commissioni, bonifico, note) · `TariffaPartner` (storico fee) · `TransazioneBancaria` (movimenti importati, hash univoco, stato nuova/registrata/ignorata) · `AssociazioneControparte` (regole controparte→partner per la riconciliazione, apprese) · `ProForma` + `ProFormaRiga` (pro-forma con righe; totali sempre calcolati dalle righe; `@@unique([anno, numero])`) · `Impostazione` (chiave/valore) · `RichiestaVerifica` (storico API) · `Forecast` (piano commerciale). Schema completo: `prisma/schema.prisma`.

## 10. Cosa manca / prossimi sviluppi

- **SMTP**: inserire password casella + mittente in Impostazioni per attivare l'invio solleciti dall'app (oggi solo mailto).
- **IBAN partner**: nell'Excel non c'erano → l'export SEPA li segnala mancanti; vanno inseriti nelle schede.
- **Fatture in Cloud**: sync automatico incassi (fattura pagata su FIC → saldata in app) e pagina di verifica FIC↔app permanente; emissione automatica in blocco delle commissioni a chiusura mese.
- **Sicurezza**: login a password unica; per il team servono utenze/ruoli con audit (Fase D). Ruotare le chiavi passate in chat (OpenAI, Qonto secret, FIC secret, chiave API `/verifiche`).
- **Open banking (PSD2)**: aggregatore per coprire anche banche senza API (es. Vivid) in automatico.
- **API pubbliche**: candidati — stato bonifico partner/mese, elenco fatture aperte di un partner, scadenze entro una data.

## 11. Note operative per chi riprende

- **Branch condiviso**: `scout-ui` ospita anche lavoro di altre sessioni (deluxy-mail, deluxy-scout, e parte anagrafiche di deluxy-partner). Committare **solo i file di deluxy-partner** che si toccano; non fare `git add -A`.
- **Deploy = push**: dopo `vercel --prod`, committare e `git push origin scout-ui`. Ogni deploy invalida i bottoni delle pagine già aperte (server action mismatch): ricaricare.
- **Verifica reale**: typecheck + prova nel browser/endpoint con dati veri prima di dire "fatto". Ripulire sempre i dati di test dal DB di produzione.
- **Regole Deluxy** (CLAUDE.md di repo): handoff+doc aggiornati a ogni commit, commit spesso verificati, no segreti in git, conferma azioni esterne, esito reale.
