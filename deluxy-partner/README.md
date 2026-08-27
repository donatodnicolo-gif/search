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

## Custode del layout (obbligatorio — 27/08/2026)

L'interfaccia di questa app ha un **custode**: l'agente `architetto-ux` (definito in `.claude/agents/architetto-ux.md`), che applica il [Libro UX&UI](../deluxy-design-system/LIBRO-UX-UI.md) e il [Design System](../deluxy-design-system/DESIGN-SYSTEM.md) v1.4.

- **Errori di layout/UX e richieste di cambiamento dell'interfaccia NON si risolvono in autonomia**: si segnalano prima nel registro [`deluxy-design-system/SEGNALAZIONI-UX.md`](../deluxy-design-system/SEGNALAZIONI-UX.md), o si interpella direttamente l'agente.
- Il custode valuta ogni segnalazione e decide: correzione locale, regola nuova del Libro (che vale **anche per le altre app**), o deroga motivata.
- Le deroghe concesse a questa app vanno annotate qui sotto, con motivo e data.

## Custode della sicurezza (obbligatorio — 27/08/2026)

La sicurezza di questa app ha un **custode**: l'agente `architetto-sicurezza` (definito in `.claude/agents/architetto-sicurezza.md`), che applica il [Libro della Sicurezza](../deluxy-design-system/LIBRO-SICUREZZA.md).

- **Buchi di sicurezza e cambiamenti di una difesa NON si risolvono in autonomia**: si segnalano nel registro [`deluxy-design-system/SEGNALAZIONI-SICUREZZA.md`](../deluxy-design-system/SEGNALAZIONI-SICUREZZA.md), o si interpella l'agente.
- Ogni segnalazione passa prima dall'agente `sicurezza-ostile` (sopravvive solo con un percorso di sfruttamento: chi/quale chiamata/quale dato); la toppa si smonta come il difetto.
- Il custode valuta e decide: correzione locale, regola nuova del Libro (che vale **anche per le altre app**), o rischio accettato/deroga con il motivo scritto.
- Le deroghe di sicurezza di questa app vanno annotate qui sotto, con minaccia e data.
