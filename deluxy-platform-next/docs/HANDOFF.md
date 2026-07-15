# HANDOFF — deluxy-platform-next

> Documento vivo per riprendere il lavoro da una finestra nuova **senza contesto pregresso**.
> Va aggiornato a ogni tappa e prima di fermarsi (vedi [REGOLE-DI-LAVORO.md](REGOLE-DI-LAVORO.md)).

**Ultimo aggiornamento:** 15 luglio 2026
**Branch:** `deluxy-scout` · **Remote:** `origin` = https://github.com/donatodnicolo-gif/search.git
**Working dir:** `C:\Users\nicol\app\deluxy-platform-next`

## Come riprendere (avvio rapido)

```bash
cd C:\Users\nicol\app\deluxy-platform-next
npm install
npm run prisma:migrate   # DB dev SQLite (api/prisma/dev.db)
npm run seed             # dati demo (idempotente)
npm run dev:api          # http://localhost:3000/api/v1  — Swagger: /api/docs
npm run dev:web          # http://localhost:4200
# Login demo: admin@deluxy.it / Deluxy2026!  (anche operation@, fioraio@, pasticceria@, valet1@, valet2@)
```

Preview server (Claude): config in `.claude/launch.json` → `deluxy-next-api`, `deluxy-next-web`.

## Fonti di verità (leggere prima di lavorare)

- **Funzionale:** [COME-FUNZIONA-APP-DELUXY.md](COME-FUNZIONA-APP-DELUXY.md) — manuale completo, va aggiornato a **ogni commit** che cambia il comportamento. Dopo averlo modificato, rigenerare il Word: `npm run doc:word` → `docs/COME-FUNZIONA-APP-DELUXY.docx`.
- **Design:** `../../deluxy-design-system/DESIGN-SYSTEM.md` (stile Apple, obbligatorio per la UI).
- **Backend reale:** [ANALISI-BACKEND-LEGACY.md](ANALISI-BACKEND-LEGACY.md) (NestJS+TypeORM+MySQL, 76 entità).
- **Sync ordini:** [INTEGRAZIONE-WOOCOMMERCE-SYNC.md](INTEGRAZIONE-WOOCOMMERCE-SYNC.md).

## FATTO

- **Scaffold**: monorepo npm workspaces — `api/` (NestJS 11, Node 22, Prisma, JWT+ruoli, Swagger) + `web/` (Angular 19 standalone, PWA-ready). Docker compose.
- **Design System v1.0** applicato (sidebar traslucida, pill, token in `web/src/styles.css`); UI in stile Apple.
- **Sidebar mobile**: drawer a scomparsa con hamburger + overlay (sotto 800px).
- **Menu**: sezioni Operatività · **Utenti** (Partner/Valet/Clienti/Operatori) · Catalogo (Prodotti) · Amministrazione · Configurazione (con "Utenti e ruoli").
- **Form di creazione fatti e verificati end-to-end**:
  - **Partner** (`/partners/new`): 7 sezioni riorganizzate, indirizzi di ritiro multipli, pagamenti+fatturazione, setup (magazzino/sicurezza/notifiche), WooCommerce key.
  - **Valet** (`/valets/new`): P.IVA, stipendio (frequenza+limite), province, servizi (con vincolo 1 ora+1 fisso), team leader (province+partner), mezzo, notifiche.
  - **Nuova consegna** (`/deliveries/new`): scelta servizio, data/ritiro, assegnazione, destinatario+mittente, prodotti, listino (da fatturare/pagare), documentazione+note.
  - **Operatori** (`/operators/new`): anagrafica + **ruolo operatore** (operation/finance/project_manager/customer_service) + notifiche.
  - **Categorie** (`/categories/new`): nome, note, AI prompt, campi extra (opzionale/obbligatorio/admin), sconti % per provincia.
  - **Prodotti** (`/products/new`): nome, categoria, tipo (unico/non-unico/superprodotto), partner, SKU, prezzo/prezzo pubblico, giorni prep., immagine, plus, descrizione, campi personalizzati, componenti superprodotto.
- **Menu**: sezione **Prodotti** (Prodotti + Categorie).
- **Liste reali** (dati da API): consegne, partner, valet, operatori.
- **Backend moduli**: auth, deliveries, partners, valets, products, customers, users, service-types, provinces, categories, operations, woocommerce (endpoint pubblico), + stub degli altri.
- **Analisi backend legacy** e **scaffolding connessione DB in sola lettura** (`api/.env.legacy.example`, `api/prisma/legacy-readonly-user.sql`).
- Tutto **pushato** su `origin/deluxy-scout`.

## MANCA / PROSSIMI PASSI

1. **[BLOCCATO — palla all'utente] Connessione al DB di produzione (MySQL, sola lettura)**: servono i 5 valori `MYSQL_*` (o replica) + raggiungibilità/tunnel. Vedi ANALISI-BACKEND-LEGACY. Poi `prisma db pull` per lo schema reale.
2. **Allineare l'endpoint WooCommerce** al contratto reale: `POST /api/deliveries/sync/woo-order`, header `x-deluxy-partner-key`, payload+risposta identici (oggi usa `x-api-key` e `/woocommerce/orders`).
3. **Form di MODIFICA** (oggi c'è solo la creazione): partner, valet, operatore, consegna.
4. **Applicare la visibilità per ruolo operatore** al login (Finance vede Amministrazione, PM no Operatività, Customer Service no Amministrazione) — richiede auth reale che porti `operationRole` nel token e sidebar che filtri.
5. **Autenticazione reale** contro il DB: mapping `extraId`/`extraType` → partner/valet/operation.
6. **Sezioni ancora stub**: Attività, Vendite, Prodotti, Clienti (creazione), Stipendi, Pagamenti, Regole carnet, Finanza, Modelli SMS, Disponibilità, Province, Utenti/ruoli.
7. **Rifiniture**: nel form valet rendere Telefono/Indirizzo obbligatori e CF sempre richiesto (come app reale).
8. **In pausa**: analisi multi-agente del vecchio codice (cosa fa ogni funzione + come aggiornarla).

## Note

- Token demo a scadenza breve: durante i test la sessione web può saltare — rifare login.
- Le migrazioni Prisma vanno create con l'API server **fermo** (lock del query engine su Windows).
- Tutto il lavoro è sul branch `deluxy-scout` (non `main`). Consolidamento su `main` via PR quando deciso.
