# Deluxy Partner — Progetto e visione

**Data:** 16 luglio 2026 · **Stato:** v0.2 **in produzione su https://deluxy-partner.vercel.app** (Postgres Supabase, login con password di team), dati 2026 importati

## 1. Perché

La gestione partner viveva in `PARTNER.xlsx`: un foglio per partner/anno con blocchi mensili (Servizi a Fatturazione, Servizi come Vendor, Extra, Saldi), formule fragili ("DA NON TOCCARE FORMULA"), rolling manuali e nessun controllo su chi modifica cosa. Rischi concreti: formule rotte, dati incoerenti tra fogli (nomi partner diversi tra "Database clienti" e "Piano commerciale"), nessuno scadenzario, nessuna tracciabilità di pagamenti e bonifici.

**Deluxy Partner** sposta tutto in un'applicazione con database, dove i numeri derivati sono sempre calcolati (mai digitati) e ogni flusso ha il suo processo.

## 2. Cosa fa (v0.1)

| Modulo | Sostituisce nell'Excel | Cosa aggiunge |
|---|---|---|
| **Partner** | Colonne A–N "Informazioni basiche/amministrative" | Anagrafica completa, IBAN per bonifici, filtri per città/categoria/stato |
| **Servizi a fatturazione** | Blocco mensile "Servizi A Fatturazione" | Form con **tipologia obbligatoria** (aree del "Piano Per Area": Consegne, Food Supplier, Affiliazioni, Eventi, Clientelling, Regalistica, Magazzino), scadenza automatica dai GG pagamento del partner, stato pagata con data |
| **Vendite come vendor** | Blocco mensile "Servizi come VENDOR" | Commissione e dovuto calcolati dalla fee (snapshot per vendita); possibilità di registrare vendite singole, non solo totali mensili |
| **Saldi e bonifici** | Blocchi "Extra" + "Saldi" | Chiusura mensile per partner: aggiunte/detrazioni, fattura commissioni, bonifico (+ inviato / − ricevuto) con data; residuo calcolato in tempo reale |
| **Scadenzario** | — (non esisteva) | Fatture scadute da incassare, bonifici pendenti, fatture commissioni da emettere |
| **Report** | "Piano Per Area" + rolling | Andamento mensile, per tipologia/città/categoria, top partner, forecast vs actual dal piano commerciale |
| **Confronti** | — (non esisteva) | 2026 vs 2025 su dati reali (ledger 2025 importato dal foglio "Database clienti 2025"), per mese, trimestre, anno o periodo personalizzato, per partner con Δ € e Δ % |
| **Export SEPA** | — (non esisteva) | Distinta bonifici del mese in pain.001.001.03 (XML) da caricare in home banking + CSV di controllo |

### Le formule (motore `src/lib/calc.ts`)

Verificate 1:1 sui dati dell'Excel:

```
commissione        = incasso vendite × fee%                     (netto IVA)
dovuto al partner  = incasso − commissione × 1,22               ("Importo Incassi netto Commissioni")
saldo mese         = servizi fatturati IVATI − (dovuto vendite + aggiunte − detrazioni)
                     > 0: il partner deve a Deluxy · < 0: Deluxy deve al partner
residuo            = saldo + bonifici registrati                (0 = mese pareggiato)
rolling            = cumulati YTD: fatture, vendite, commissioni, dovuto, bonificato/incassato
stima chiusura     = run-rate: (vendite+servizi YTD) / mesi attivi × 12
```

## 3. Dati importati

Da `PARTNER.xlsx` (estrazione 16/07/2026): **92 partner**, **176 fatture servizi**, **213 vendite vendor**, **325 saldi mensili** (gennaio–giugno 2026), forecast del piano commerciale (36 clienti × 12 mesi). Le fatture importate hanno tipologia dedotta dai servizi del partner (rivedibile a mano); i movimenti importati sono marcati "Import PARTNER.xlsx".

Importato anche lo **storico 2025** dal foglio "Database clienti 2025" (ledger mensile reale: 331 fatture, 198 vendite, 643 saldi, 69 partner di cui 2 presenti solo nello storico) — alimenta la pagina Confronti. Re-import: `node prisma/seed-2025.mjs` (additivo: tocca solo l'anno 2025).

**Non migrato (fuori perimetro):** foglio "Anagrafica" (personale/valet: già dominio della piattaforma), "Buste e Biglietti" (magazzino consumabili).

## 4. Processi operativi (chi fa cosa, quando)

**Quotidiano** — Servizio svolto → `+ Fattura servizi` (tipologia, imponibile; scadenza automatica). Vendita per un partner → `+ Vendita vendor` (commissione automatica).

**Chiusura mese (entro il 5 del mese successivo)**
1. **Scadenzario** → emettere le fatture commissioni mancanti (numero da FattureInCloud).
2. **Saldi e bonifici** → per ogni partner: verificare saldo, registrare aggiunte/detrazioni, poi **Export SEPA** → caricare il file in home banking → autorizzare → registrare i bonifici con data.
3. Incassi: segnare le fatture saldate con data (o registrare bonifico ricevuto in compensazione).
4. Obiettivo: tutti i partner del mese **Pareggiati** (residuo 0), mese chiuso.

**Mensile (direzione)** — **Report**: andamento vs forecast, per area/città/categoria, top partner, stima chiusura.

## 5. Roadmap automazione

| Fase | Cosa | Come |
|---|---|---|
| **A. FattureInCloud** | Emissione automatica di fatture servizi e fatture commissioni; stato "saldata" via webhook incassi | API FattureInCloud (OAuth2): `POST /issued_documents`; il n° fattura torna in app da solo |
| **B. Banca in lettura** | Riconciliazione automatica: match movimenti conto ↔ fatture/bonifici attesi | Open banking PSD2 (AISP) via aggregatore (Fabrick, CBI Globe, GoCardless Bank Account Data): import movimenti giornaliero, matching per importo+causale |
| **C. Banca in scrittura** | Disposizione bonifici direttamente dall'app (oggi: export pain.001 da caricare a mano) | PISP via aggregatore, con autorizzazione forte (SCA) sempre in mano all'utente |
| **D. Multi-utente & audit** | Login, ruoli (amministrazione / commerciale / sola lettura), log modifiche | Auth (es. Auth0/NextAuth) + tabella audit; necessario prima del deploy condiviso |
| **E. Deploy condiviso** | App raggiungibile dal team (oggi gira in locale) | Migrazione SQLite → PostgreSQL (Prisma: cambio datasource) + hosting (Vercel + Neon/Supabase, o VPS) |

Predisposizioni già in essere: IBAN in anagrafica partner, campo n° fattura FattureInCloud su fatture e commissioni, export SEPA standard, calcoli centralizzati nel motore.

## 6. Architettura

```
Next.js 15 (App Router)
├── UI server components (liste, dashboard, report)  ← Deluxy Design System v1.0
├── Server actions (mutazioni, validazione)
├── src/lib/calc.ts   ← unica fonte delle formule
├── src/lib/queries.ts ← riepiloghi mensili + rolling
└── Prisma 6 → SQLite (dev) → PostgreSQL (produzione)
```

Scelte chiave: **derivati mai persistiti** (saldi/rolling sempre ricalcolati → impossibile la deriva dei numeri tipica dell'Excel); **snapshot della fee** su ogni vendita (cambiare la fee di un partner non riscrive la storia); **anno/mese di competenza espliciti** su ogni movimento (il rolling è una semplice aggregazione).

## 7. Cosa manca / limiti noti v0.2

- Autenticazione a **password unica di team** (`PARTNER_APP_PASSWORD` su Vercel; cambiarla invalida tutte le sessioni). Ruoli e utenze individuali con audit restano in Fase D.
- L'IBAN ordinante nell'export SEPA è un placeholder: impostare quello reale Deluxy prima dell'uso (in `src/app/api/sepa/route.ts`, poi in una pagina Impostazioni).
- Le fatture importate dall'Excel sono totali mensili con tipologia dedotta; le nuove nascono già granulari.
- Il forecast è importato dal piano commerciale ma non ancora modificabile in app.
