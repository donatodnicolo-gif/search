# Deluxy Partner

Gestione finanziaria e operativa dei partner Deluxy. **Sostituisce PARTNER.xlsx** (Database clienti 2026): servizi a fatturazione, vendite come vendor, saldi/compensazioni, bonifici, rolling e reportistica.

**Produzione: https://deluxy-partner.vercel.app** (accesso con password del team, env `PARTNER_APP_PASSWORD` su Vercel — cambiandola si invalidano tutte le sessioni).

Documento di progetto completo: [docs/PROGETTO.md](docs/PROGETTO.md)

## Avvio in locale

```bash
npm install
# .env (non in git): DATABASE_URL e DIRECT_URL del Postgres Supabase
# (progetto "deluxy-partner", ref zegbztfxisqeowngvgvh — dashboard Supabase → Connect).
# Senza PARTNER_APP_PASSWORD nel .env l'app in locale è aperta (niente login).
npm run dev         # http://localhost:3040
```

Il seed (`npm run db:push && npm run db:seed`) serve solo per ricreare il database da zero: **cancella e reimporta** i dati di PARTNER.xlsx, non farlo sul database di produzione già in uso.

## Deploy

Vercel, progetto `deluxy/deluxy-partner`: `npx vercel --prod` dalla cartella. Env di produzione: `DATABASE_URL` (pooler 6543 con `?pgbouncer=true&connection_limit=1`), `DIRECT_URL` (pooler 5432), `PARTNER_APP_PASSWORD`.

## Stack

- **Next.js 15** (App Router, server components + server actions)
- **Prisma 6 + PostgreSQL** (Supabase, org Deluxy)
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
