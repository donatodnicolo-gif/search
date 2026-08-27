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

## Template dei documenti, uno per brand (27/08/2026)

Richiesta dell'utente: «crea una sezione template dove possiamo fare i template
delle pro-forme per i vari brand utilizzando logo, dati societari».

Prima l'intestazione della pro-forma veniva da **quattro righe** della tabella
`Impostazione` (`azienda.intestazione`, `.indirizzo`, `.piva`, `.contatti`): una
sola per tutto il gruppo, senza logo. Ma i brand sono tre — `deluxy.it`,
`deluxyflowers.com`, `cakedesign.me` — e un documento che esce con
l'intestazione del brand sbagliato è un documento che il cliente non riconosce.

**Dove**: sezione *Template documenti*, accanto a Pro-forma. Sta qui e non in
Scout perché è **qui** che il documento viene disegnato e stampato.

**Cosa contiene un template** (`TemplateDocumento`, migrazione
`prisma/sql/2026-08-27-template-documento.sql`, applicata a mano):
logo, ragione sociale, indirizzo, P. IVA, codice fiscale, REA, contatti, IBAN e
intestatario, modalità di pagamento, condizioni predefinite, il testo di legge e
l'IVA predefinita.

**Non è un obbligo, è un sovrascrittore**: senza template il documento esce con
l'intestazione generale di sempre. Cancellare un template **non tocca** i
documenti già emessi (`on delete set null`): tornano all'intestazione generale, e
la pagina lo dice prima di cancellare.

### Cosa deve avere una pro-forma (verificato sulla prassi italiana)

La pro-forma **non ha vincoli formali** — non è un documento fiscale — ma la
prassi è compilarla come se fosse una fattura vera:

1. la dicitura **«fattura pro-forma»** ben visibile, per non confonderla con una
   fattura, e una **numerazione indipendente** da quella fiscale (qui: PF n/anno,
   separata dai preventivi PV n/anno);
2. **chi emette**: denominazione, indirizzo, partita IVA o codice fiscale,
   eventuale REA — e il logo, che non è obbligatorio ma è quello che fa
   riconoscere il mittente;
3. **chi riceve**: ragione sociale, indirizzo, partita IVA o codice fiscale;
4. descrizione, quantità, prezzo unitario, **IVA indicata separatamente**, totale;
5. **come si paga**: modalità e IBAN;
6. in calce la **formula di legge**: «Il presente documento non costituisce
   fattura ai sensi dell'art. 21 del D.P.R. 633/72 … non genera esigibilità di
   imposta … La fattura definitiva verrà emessa all'atto del pagamento del
   corrispettivo (art. 6, comma 3, D.P.R. 633/72)». Senza, il cliente potrebbe
   registrarla in contabilità e detrarne l'IVA.

Il testo al punto 6 è stato **allineato alla formula canonica**: quello di prima
diceva quasi le stesse cose ma non citava l'art. 6 c. 3 né l'esigibilità. Il
punto 5 prima **non c'era affatto**.

⚠️ **Punto 3, quello che ancora manca**: `Partner` in FINANCE non ha né partita
IVA né indirizzo completo (solo `citta`), quindi sul documento i dati del cliente
restano parziali. Quei dati li possiede **Anagrafiche** e vanno letti da lì, non
ricopiati qui.

### Sceglierlo da fuori

`POST /api/proforma` accetta `brand` (o `template`): si passa il brand **per
nome** — «emetti con l'intestazione di `cakedesign.me`» — senza conoscere codici
interni. Senza, si usa il predefinito. Un brand che **non esiste** risponde 404
con l'elenco di quelli che ci sono: emettere con l'intestazione sbagliata è
peggio di un rifiuto, perché quando ce ne si accorge il documento è già partito.
