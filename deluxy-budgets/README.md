# Deluxy Budgets

App dei budget aziendali Deluxy (porta **3080**): raccoglie tutti i budget, calcola il P&L
con i costi e stabilisce i premi su **3 livelli di budget** — *raggiungibile* (il budget
pubblicato), *sfidante* e *irraggiungibile*.

## Cosa fa (v1)

- **Dashboard** (`/`): sintesi del conto economico 2026 sui 3 livelli + riepilogo per maison.
- **P&L** (`/pl`): conto economico aziendale completo — ricavi per canale, costo del venduto,
  margine lordo, ADV, **costo del personale**, costi di struttura, EBITDA, premi e risultato
  netto — confrontato sui 3 livelli, con **andamento mensile** (evidenzia i mesi in perdita)
  e conto economico **per maison** (costi comuni ripartiti in proporzione ai ricavi).
- **Dipendenti** (`/dipendenti`): organico a budget con **dipendenti a RAL** (oneri sopra il
  lordo, default 38%), **stagisti** e **consulenti** a compenso mensile, e i **mesi in cui il
  costo è a carico** (assunzioni infra-anno, stage, consulenze a progetto). Per ciascuno si
  indicano **superminimo individuale** e **% di part-time**: il lordo effettivo è
  `(tabellare + superminimo) × % tempo`, riproporzionato come da CCNL, e gli oneri si
  applicano sopra. Il costo azienda entra automaticamente nel P&L, anche mese per mese.
- **Maison** (`/maison`, `/maison/[slug]`): per ogni brand (Deluxy.it, CakeDesign.me,
  Deluxyflowers.com, Business B2B, Experience) la vista mensile **D2C · Eventi · B2B
  (lead generation)** con selettore del livello.
- **Team commerciale** (`/commerciale`): budget per **linee** (Affiliazioni, Consegne
  Corporate, Catering & Eventi, Torte e Mono, Regalistica, Retail Marketing & Concierge,
  Eventi & Altro, Magazzino) e **nuovi clienti** per mese.
- **Proposte budget** (`/proposte`): ogni utente di livello Responsabile invia la propria
  proposta (ambito: azienda / maison / linea, 12 mesi + note); elenco con stato.
- **Spese ADV** (`/spese`): quanto si può spendere in pubblicità per maison come **% delle
  vendite del mese**, personalizzabile mese per mese; l'importo consentito si ricalcola.
- **Impostazioni** (`/impostazioni`): moltiplicatori dei livelli sfidante/irraggiungibile,
  premi al raggiungimento, voci di costo del P&L (COGS %, costi fissi).

## Dati

Seed 2026 estratto da **Monitoraggio 2026.xlsx** (foglio `SALES GLOBAL 26 - REVISED`:
vendite/ADV HP mensili per maison) e **budget pubblicati.xlsx** (foglio
`TARGET NUOVI CLIENTI`: linee commerciali). Totali verificati con i file:
Deluxy.it €1.492.440 (ADV €200k), Flowers €300.000, Cake €119.000, B2B €225.000,
Experience €22.500; linee €504.000 / 317 attivazioni.

Il COGS di partenza (65%) deriva dal margine stimato 2026 dei budget pubblicati (≈35%).
Il motore di calcolo è `src/lib/calc.ts` (mai valori derivati a DB).

## Stack e avvio

Next.js 15 + React 19 + Prisma. In sviluppo il DB è **SQLite** (`prisma/dev.db`, zero
configurazione); per la produzione passare a Postgres/Supabase (cambiare provider in
`prisma/schema.prisma` e `DATABASE_URL`).

```bash
npm install
cp .env.example .env      # DATABASE_URL="file:./dev.db"
npm run db:push
npm run db:seed
npm run dev               # http://localhost:3080
```

## Stato

**FATTO**: schema dati, seed 2026 dai file Excel, dashboard 3 livelli, **P&L aziendale
completo** (annuale, mensile e per maison), **sezione Dipendenti** (RAL/stagisti/consulenti
con mesi di competenza), dettaglio maison D2C/Eventi/B2B, team commerciale per linee e
clienti, invio e lista proposte, spese ADV con % per mese personalizzabili, impostazioni
scenari/premi/costi, catalogo Hub aggiornato (id `budgets`, `APP_URL_BUDGETS`).

**MANCA**: consuntivi/actual accanto al budget (integrazione monitoraggio), premi per
singolo responsabile (oggi monte premi totale), approvazione/consolidamento delle
proposte nel budget ufficiale, autenticazione via Hub, deploy (Vercel + Postgres),
budget pluriennale 2027-30 (già presente nei file pubblicati), P&L per singola linea
commerciale, tredicesima/quattordicesima e TFR come voci distinte del costo del lavoro.
