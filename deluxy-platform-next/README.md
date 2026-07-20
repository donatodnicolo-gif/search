# Deluxy Platform Next

Ambiente di sviluppo moderno per la piattaforma **app.deluxy.it** (logistica consegne di lusso, "consegne in guanti bianchi"). Sostituisce progressivamente lo stack legacy Angular + Node.js v12 con uno stack LTS, API-first e accessibile da tutti i dispositivi.

> **Fonte di verità funzionale**: [docs/COME-FUNZIONA-APP-DELUXY.md](docs/COME-FUNZIONA-APP-DELUXY.md) — manuale completo aggiornato (luglio 2026) con la mappatura verificata di ogni sezione, campo e regola di business dell'app in produzione. Ogni nuova feature va confrontata con quel documento.

## Architettura

Monorepo **npm workspaces** con due applicazioni:

```
deluxy-platform-next/
├── api/                  API REST NestJS 11 (Node 22, TypeScript)
│   ├── prisma/           Schema dati completo + seed demo
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── auth/         Login JWT, guard globale, guard ruoli
│       ├── common/       Enum di dominio, decoratori (@Public, @Roles, @CurrentUser)
│       ├── prisma/       PrismaService (globale)
│       ├── deliveries/   CRUD completo consegne (stati, attivita, log, assegnazione valet)
│       ├── partners/     CRUD completo partner (province, servizi, categorie, orari)
│       ├── valets/       CRUD completo valet (province, salari, disponibilita)
│       ├── products/     CRUD completo prodotti (unico/non-unico/superprodotto, campi, sconti auto)
│       ├── customers/    CRUD completo clienti
│       ├── users/        CRUD utenti (solo admin)
│       ├── activities/   Attivita ritiro/consegna, riordino, vista team leader
│       ├── sales/        Vendite con smistamento automatico al partner
│       ├── salaries/     Stipendi valet (flusso DRAFT→SENT→RECEIPT_PENDING→APPROVED→PAID)
│       ├── payments/     Rimborsi e reclami valet
│       ├── delivery-rules/  Regole carnet
│       ├── sms-templates/   Modelli SMS per brand
│       ├── provinces/    Province e citta
│       ├── finance/      Marginalita (solo admin)
│       └── woocommerce/  Endpoint pubblico ordini (auth x-api-key partner)
└── web/                  Frontend Angular 19 (standalone components, PWA-ready)
    └── src/app/
        ├── core/         AuthService (signals), interceptor JWT, guard per ruolo
        ├── layout/       Shell con sidebar filtrata per ruolo
        └── pages/        Login, lista consegne (live sull'API), stub per le altre sezioni
```

- **API versionata**: tutti gli endpoint sono sotto `/api/v1`.
- **Documentazione OpenAPI/Swagger**: `http://localhost:3000/api/docs`.
- **Database**: Prisma ORM. SQLite in sviluppo (zero setup), PostgreSQL in produzione.
- **Autenticazione**: JWT con ruoli `ADMIN` (flag `isSupport` per Finanza), `OPERATION`, `PARTNER`, `VALET`, `PROJECT_MANAGER`. Guard globali: ogni endpoint richiede il token tranne quelli marcati `@Public()` (login, webhook WooCommerce).

## Requisiti

- Node.js >= 22 (LTS)
- npm >= 10

## Avvio rapido

```bash
# 1. Dipendenze (dalla root del monorepo)
npm install

# 2. Configurazione ambiente
#    Copia .env.example in api/.env (in dev il file e' gia' pronto con SQLite)
cp .env.example api/.env

# 3. Database: crea lo schema SQLite e genera il client Prisma
npm run prisma:migrate       # prisma migrate dev (chiede un nome alla prima migrazione)

# 4. Dati demo (utenti, partner, valet, prodotti, una consegna)
npm run seed

# 5. Avvio in sviluppo (due terminali)
npm run dev:api              # API su http://localhost:3000/api/v1  (docs: /api/docs)
npm run dev:web              # Web su http://localhost:4200
```

### Credenziali demo (password unica: `Deluxy2026!`)

| Email                  | Ruolo            | Note                              |
| ---------------------- | ---------------- | --------------------------------- |
| admin@deluxy.it        | Admin (support)  | Vede anche Finanza/marginalita    |
| operation@deluxy.it    | Operation        |                                   |
| fioraio@deluxy.it      | Partner          | Fioraio Milano Centro             |
| pasticceria@deluxy.it  | Partner          | Pasticceria Brera                 |
| valet1@deluxy.it       | Valet            | Team leader, con P.IVA            |
| valet2@deluxy.it       | Valet            | Senza P.IVA (ricevuta ritenuta)   |

### Build

```bash
npm run build:api    # compila l'API (dist/)
npm run build:web    # compila il frontend (dist/web/)
```

### Docker (API + PostgreSQL)

```bash
docker compose up -d
```

Nota: nel container si usa PostgreSQL. Prisma non permette di cambiare il
provider via variabile d'ambiente: prima della build impostare
`provider = "postgresql"` in `api/prisma/schema.prisma` e rigenerare le
migrazioni (`npx prisma migrate dev`). In sviluppo locale resta SQLite.

## Dominio

- **Consegna (Delivery)**: giorno, servizio, orario di ritiro (da-a, flag flessibile), destinatario (nome, cognome, indirizzo, citofono), prodotti, partner, valet, pagamento alla consegna (contanti detratti dallo stipendio del valet), SMS (trigger creata/partita/arrivata), note + note interne (nascoste ai partner), DDT (stesso DDT su piu ritiri = una consegna), distanza ritiro→consegna con extra KM / extra fuori citta, log (inserita/partita/effettuata). Stati: `created`, `assigned`, `in_preparation`, `accepted`, `in_delivery`, `delivered`, `not_delivered`, `cancelled`, `cancellation_requested`, `not_accepted` e, per i servizi a ora, `delivered_time_approved` / `delivered_time_not_approved`.
- **Attivita**: ogni consegna genera un'attivita di ritiro e una di consegna, ordinabili per orario; il valet team leader vede anche le attivita degli altri valet delle sue province.
- **Servizi**: prezzo fisso, a ora (min 1h), vendita, corporate, magazzino (prezzo base + a pezzo + trasporto). Matching automatico tra servizio del partner e salario del valet con lo stesso modello di prezzo.
- **Prodotti**: unico (di un partner), non-unico (es. fiori), superprodotto (combinazione); flag "visibile agli altri partner"; categorie con sconto % per provincia che genera prodotti scontati automatici (prezzo arrotondato a 0/5); campi testuali obbligatori/opzionali/solo-admin.
- **Vendite**: smistamento automatico — prodotto unico → partner della provincia se aperto; non-unico → lista priorita partner per provincia+categoria.
- **Stipendi valet**: generazione (pro-forma fattura con P.IVA, ricevuta con ritenuta senza), flusso invio → ricevuta da firmare → approvazione → pagamento; contanti incassati alla consegna detratti.
- **WooCommerce**: `POST /api/v1/woocommerce/orders` con header `x-api-key` (chiave del partner) riceve gli ordini dal plugin `deluxy-send-order` e crea una consegna "da gestire".

## Strategia di migrazione dalla piattaforma legacy (strangler pattern)

L'obiettivo e' sostituire la piattaforma Angular/Node 12 **gradualmente**, senza big-bang:

1. **Fase 0 - Staging parallelo (questo repo)**: la nuova API replica il modello dati del legacy; il frontend nuovo gira in staging con dati demo/seed.
2. **Fase 1 - Facade davanti al legacy**: si mette un reverse proxy (nginx/Traefik) davanti a `app.deluxy.it`. Tutte le richieste continuano ad andare al legacy, ma il proxy puo' instradare singoli percorsi alla nuova API.
3. **Fase 2 - Sincronizzazione dati**: due opzioni:
   - **Opzione A (consigliata se il DB legacy e' relazionale)**: puntare la nuova API direttamente al DB esistente. Prisma supporta l'introspezione (`prisma db pull`) per generare lo schema dal DB legacy; si adatta poi il codice ai nomi reali di tabelle/colonne con `@@map`/`@map`.
   - **Opzione B**: job di sincronizzazione bidirezionale (o CDC) tra DB legacy e nuovo DB PostgreSQL, utile se si vuole rimodellare lo schema da subito.
4. **Fase 3 - Migrazione modulo per modulo**: si migra una sezione alla volta (ordine suggerito: consultazione consegne → attivita valet → anagrafiche → vendite → stipendi/finanza). Ogni modulo migrato viene instradato dal proxy alla nuova piattaforma; il legacy resta autorita' per il resto.
5. **Fase 4 - Decommissioning**: quando tutte le sezioni sono migrate, il legacy viene spento e il nuovo DB diventa l'unica fonte di verita'.

Durante le fasi 2-4 gli **utenti e le password** possono restare condivisi: la nuova API usa bcrypt, compatibile con la maggior parte degli hash legacy Node; in alternativa si forza un reset password al primo accesso alla nuova piattaforma.

## Mappatura dalla piattaforma legacy (ricognizione su app.deluxy.it)

Osservazioni raccolte dall'app reale, utili per la migrazione:

- **API legacy**: vive su `app.deluxy.it/api/*`. Endpoint osservati: `/api/users/me`, `/api/auth/<jwt>`, `/api/experts/delivery/experts`, `/api/web-push-notification/count/:id`.
- **Nomenclatura**: il ruolo **valet** si chiama internamente **"expert"** nel legacy (vedi endpoint `/api/experts/...`). Nella nuova piattaforma usiamo "valet" (linguaggio di business) — tenerne conto in fase di introspezione DB / sync.
- **Piattaforme di vendita (6)**, chiave interna legacy tra parentesi: Deluxy (`shopifysale`), Cakes (`cakesales`), Business (`businesssales`), Flowers (`flowerssales`), Deluxy Experience (`deluxyexperiencesales`), Deluxy Dot Com (`deluxydotcomsales`). Mappate sull'enum `Brand`.
- **Sezioni legacy non ancora modellate qui** (da aggiungere nelle prossime iterazioni): Carte partner, Invoice list (lista fatture), Transazioni, Contratti valet (stati: generato/firmato), Collections prodotti per provincia (handle tipo `province-products/rm`), tab Shopify Prodotti, integrazione **Qonto** nel profilo, **Stripe** e **Google Maps** nel frontend.
- **Mezzi valet** (valori legacy): `Auto`, `Bicicletta`, `Furgone`, `Moto/Scooter` (enum `VehicleType`).
- **Stato pagamenti partner**: `active` / `inactive` / `blocked`; **metodi**: `bankTransfer` / `creditCard` / `directDebitMandate` (campi `paymentStatus` / `paymentMethod` su `Partner`).
- Notifiche **web push** presenti nel legacy (`/api/web-push-notification/...`): candidata naturale per la PWA.

## Note tecniche / decisioni

- Gli enum di dominio sono modellati come `String` in Prisma (compatibilita SQLite) e validati nei DTO con `class-validator` (`IsEnum`); i valori sono centralizzati in `api/src/common/enums.ts`.
- Il calcolo della distanza ritiro→consegna e' predisposto (campo `distanceKm`, extra KM/fuori citta calcolati alla creazione): in produzione va collegato a un servizio di mappe (Google Distance Matrix / OSRM).
- L'invio SMS e' modellato (flag per trigger + modelli per brand) ma il provider SMS va collegato in produzione.
- Il frontend e' PWA-ready (manifest, theme color, layout responsive); il service worker puo' essere aggiunto con `ng add @angular/pwa`.
