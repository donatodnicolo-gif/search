# Analisi del backend Deluxy attuale (jamtechdev/deluxy-backend)

> Analisi del codice sorgente del backend di produzione, 14/07/2026. È la base per allineare `deluxy-platform-next` allo schema e ai contratti **reali**.

## Stack reale (non è "Node 12 + Express puro")

Il backend è già **NestJS 7** + **TypeORM 0.2** + **MySQL**, su Node ~12/13. Quindi il "legacy" è nei *numeri di versione* (NestJS 7 = 2020, TypeORM 0.2, TypeScript 3.7), non nell'architettura: è concettualmente vicino al nostro `deluxy-platform-next` (NestJS 11 + Prisma). Questo **semplifica** la migrazione.

Integrazioni confermate (da `package.json` e `envConfig.ts`):
- **MySQL** (`mysql` driver, charset utf8mb4_unicode_ci)
- **Stripe** (pagamenti + webhook), **Qonto** (banking, token OAuth salvati per utente)
- **Twilio** (SMS) e **WATI** (`WATTI_ACCESS_TOKEN`/`WATTI_API_ENDPOINT` → WhatsApp)
- **Shopify** su 4 negozi separati (deluxy, cakes, business, flowers) — chiavi dedicate per ognuno
- **Google Maps** (geocoding/distanze), **web-push** (VAPID), **nodemailer + IMAP** (`email-webhook`: parsing email in ingresso), **OpenAI** (`open-ai` → torte AI), **puppeteer + pdfmake** (fatture/ricevute PDF), **xlsx** (export), **sharp** (immagini)

## Come si connette al database

`src/utilities/config/db-config.ts` → TypeORM legge **5 variabili d'ambiente** dal file `.development.env` (che è **gitignored**: nessun segreto nel repo, corretto):

```
MYSQL_HOST      (default localhost)
MYSQL_PORT      (default 3306)
MYSQL_USER      (default test)
MYSQL_PASSWORD  (default vuoto)
MYSQL_DATABASE  (default test)
```

Altri env rilevanti (`envConfig.ts`): `JWT_SECRET`, `JWT_LONG_REFRESH_EXPIRES_IN`, `BASE_URL`/`BASE_BACKEND_URL`, `GOOGLE_MAPS_API_KEY`, credenziali SMTP/Twilio/WATI/Shopify×4/Stripe/Qonto.

⚠️ Due punti importanti dello schema DB:
- **`synchronize: true`** → TypeORM allinea in automatico il DB alle entità a ogni avvio. Conseguenza pratica enorme: **lo schema del database è definito esattamente dalle 76 entità del repo**. Possiamo ricostruire lo schema reale *senza* accedere al DB.
- Nessuna cartella `migrations` popolata (si affida a `synchronize`).

## Autenticazione

JWT (passport-jwt). Payload osservato in produzione: `{ id, username, roles, extraId, extraType, lastEdit, type, iat, exp }`. Nel modello:
- `User.group` = ruolo (tabella `group`); `User.active` (int); `User.isSuperAdmin`; MFA (`secretOtp`, `backupCodes`); token Qonto per utente.
- `User.extraId` + `extraType` **collegano l'utente al suo record** Partner / Expert / Operation. È il meccanismo con cui un login "partner" vede i propri dati.

## Schema reale: 76 entità

Moduli/tabelle principali (cartella `src/components/`):

| Area | Entità |
|---|---|
| Consegne | `delivery` (~90 colonne!), `delivery-complaint`, `delivery-updates`, `delivery-product`, `delivery-invoices` (+pivot) |
| Partner | `partner`, `partner-time-availability`, `partner-sold-product-category`, `partner-invoice`, `partner-priority` (+partners), `partner-delivery-rules` (+associazione), `partner-services` |
| Valet (expert) | `expert`, `expert-time-availability`, `vehicle`, `team-leader` (+province/partners), `expert-service(s)`, `expert-priority` (+experts), `expert-delivery-rules` (+associazione), `expert-receipts`, `expert-contracts` |
| Prodotti | `product`, `product-partner`, `super-products`, `products-variants`, `product-category` (+province-discount), `product-priority-list`, `offer` |
| Vendite | `shopify-sale` (+delivery), `cake-sales`, `business-sales`, `flowers-sales`, `deluxy-dot-com-sales`, `deluxy-experience-sales` (ognuna + \*-delivery), `partner-shopify-sale-activity`, `cake-order-info` |
| Clienti/utenti | `user`, `group`, `operation`, `customer`, `user-provinces` |
| Geo | `provinces`, `province-cities` |
| Attività | `valet-activities`, `admin-valet-activity` |
| Pagamenti/finanza | `transactions`, `refund-requests`, `custom-payments` (+sale-payments), `stripe-customer` (+cards) |
| Shop online | `shop-collection` (+products/product-categories) |
| Comunicazioni | `sms-templates`, `admin-sms-templates`, `web-push-notification` (+history), `emails-webhook`, `email-template` |
| Sistema | `settings`, `service` |

Esempio della ricchezza reale — l'entità `Delivery` ha ~90 colonne (contro le ~20 del nostro schema demo): include `expertIdentityCheck`, `deliveryCodeRequired/Verifed`, `productManagement` (none/deluxyWareHouse/returnToBoutique/keptInCar), `withDailyDeliveryRule`/`withTotalDeliveryRule`, `parentDelivery` (auto-relazione per i multi-ritiro DDT), `paidViaCard`, `receiverSign`, `flexiblePrice`, ecc. Gli stati consegna reali (enum): `created, assigned, delivered, invalidated, canceled, delivering, notDelivered, inPreparation, accepted, notAccepted, requestCancellation, deliveredWithTimeToBeApproved, deliveredWithTimeNotApproved, approved`.

## Conseguenze per deluxy-platform-next

1. **Possiamo ricostruire lo schema Prisma esatto dalle 76 entità** — senza credenziali DB. È il modo più sicuro e veloce per rendere il nuovo ambiente fedele al reale.
2. **Per collegarsi al DB di produzione** servono i 5 valori `MYSQL_*` dell'ambiente reale (o di una replica in lettura). Non sono nel repo. Con quelli: Prisma su MySQL + `db pull` per verifica, o riuso diretto del DB (strangler).
3. Il nostro endpoint WooCommerce va allineato al path/headers reali (vedi [INTEGRAZIONE-WOOCOMMERCE-SYNC.md](INTEGRAZIONE-WOOCOMMERCE-SYNC.md)).
4. Enum, nomi colonna e relazioni del nostro schema vanno riportati a quelli reali (es. `expert` = valet, `group` = ruolo, `extraId/extraType` per il legame utente→partner/valet).

## Sicurezza (nota)

Nessuna credenziale è committata nel repo (`.development.env` è gitignored, nessun `.env` presente, nessun segreto hardcodato). Le chiavi di produzione vanno richieste per canale sicuro a chi gestisce l'infrastruttura, **mai** incollate in chat o committate.
