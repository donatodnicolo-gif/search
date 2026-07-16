# Deluxy Partner

Gestione finanziaria e operativa dei partner Deluxy. **Sostituisce PARTNER.xlsx** (Database clienti 2026): servizi a fatturazione, vendite come vendor, saldi/compensazioni, bonifici, rolling e reportistica.

Documento di progetto completo: [docs/PROGETTO.md](docs/PROGETTO.md)

## Avvio

```bash
npm install
npm run db:push     # crea il database SQLite (prisma/dev.db)
npm run db:seed     # importa i dati estratti da PARTNER.xlsx
npm run dev         # http://localhost:3040
```

## Stack

- **Next.js 15** (App Router, server components + server actions)
- **Prisma 6 + SQLite** (migrabile a PostgreSQL/Supabase senza toccare il codice applicativo)
- **Deluxy Design System v1.0** — token in `src/app/tokens.css` (copia di `deluxy-design-system/tokens/tokens.css`); vedi `deluxy-design-system/DESIGN-SYSTEM.md`

## Struttura

| Percorso | Contenuto |
|---|---|
| `prisma/schema.prisma` | Modello dati (Partner, FatturaServizio, VenditaVendor, SaldoMensile, TipologiaServizio, Forecast) |
| `prisma/seed.mjs` + `seed-data.json` | Import una-tantum dei dati di PARTNER.xlsx |
| `src/lib/calc.ts` | **Motore di calcolo**: commissioni, IVA, dovuto, saldi in compensazione, rolling. Unica fonte delle formule |
| `src/lib/actions.ts` | Server actions (tutte le mutazioni) |
| `src/lib/queries.ts` | Riepiloghi mensili e rolling per partner |
| `src/app/` | Pagine: dashboard, partner, fatture, vendite, saldi, scadenzario, report |
| `src/app/api/sepa/` | Export bonifici: SEPA pain.001 XML + CSV |

## Regole d'oro

1. Le formule vivono **solo** in `src/lib/calc.ts` — mai duplicarle nelle pagine.
2. UI solo con i token del design system (`var(--…)`), mai colori hardcodati.
3. I dati calcolati (commissioni, saldi, rolling) **non si salvano mai** nel DB: si ricavano sempre dai movimenti.
