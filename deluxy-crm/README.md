# Deluxy CRM

Il **libro dei clienti** Deluxy, sul modello del clienteling dei brand del lusso:
ogni cliente dei siti ha una scheda a 360 gradi (ordini, gusti, ricorrenze), si
scrivono mail personalizzate una a una, si organizzano eventi con lista
invitati, si tiene il diario della relazione.

**LIVE**: https://deluxy-crm.vercel.app · porta locale **3190** · schema
Postgres **`crm`** sul cluster condiviso.

> Architettura (Standard Deluxy §7): **il CRM non possiede i clienti.**
> Clienti, ordini, segmenti, riepiloghi AI e ricorrenze vivono in
> **Deluxy Orders** e si leggono via `/api/v1` con chiave; le ricorrenze
> aggiunte a mano si **scrivono in Orders** (POST `/api/v1/eventi-clienti`),
> non qui. Qui vive solo il dominio della relazione: attività, eventi, inviti,
> template e registro mail. L'invio passa da **AI Mail** (`POST /api/v1/invia`),
> così la copia resta negli «Inviati» della casella; gli eventi datati si
> spingono al **Deluxy Calendario** (sistema `deluxy-crm`).

## Pagine

- **Oggi** — ricorrenze dei prossimi 14 giorni (con «Fai gli auguri»), contatori
  VIP/fedeli/nuovi/da-riattivare, i migliori da riattivare, eventi in arrivo,
  ultime attività.
- **Clienti** — il libro: ricerca, filtri per lista (VIP, fedeli, nuovi, da
  riattivare…), ordinamenti, paginazione.
- **Scheda cliente** (`/clienti/<codice|email>`) — KPI, riassunto e gusti
  scritti dall'AI di Orders, tutti gli ordini con dediche e destinatari,
  ricorrenze (+ aggiunta manuale → scrive in Orders), diario attività, mail,
  inviti.
- **Ricorrenze** — chi festeggia nei prossimi 7/14/30/60/90 giorni; i tipi
  delicati (condoglianze) sono segnalati e NON hanno il bottone degli auguri.
- **Eventi** — occasioni speciali con lista invitati
  (da invitare → invitato → confermato → partecipato), invito via mail
  personalizzata, capienza, propagazione al Calendario.
- **Mail** — registro invii; **Componi** con template e variabili `{{nome}}`,
  `{{evento}}`… risolte coi dati veri PRIMA dell'invio; **Template** CRUD con
  tre modelli di partenza.
- **Impostazioni** — stato MISURATO dei collegamenti (Orders, AI Mail,
  Calendario, database), coi nomi delle variabili da impostare.

## Accesso

Password di team (`CRM_APP_PASSWORD`, come Orders/Scripts) **oppure** SSO dal
Deluxy Hub (`/api/sso`, app `"crm"`, stesso `HUB_SSO_SECRET`). In produzione
senza password l'app risponde **503** (fail-closed). Il CRM non tiene utenti
propri: gli utenti vivono nel Hub. In locale senza `CRM_SESSION_SECRET` l'app
è aperta (sviluppo).

## Variabili (nomi in `.env.example`)

`DATABASE_URL`/`DIRECT_URL` (schema crm) · `CRM_APP_PASSWORD` ·
`CRM_SESSION_SECRET` · `HUB_SSO_SECRET` · `ORDERS_URL`/`ORDERS_API_KEY`
(chiave con scrittura: `npm run chiave -- deluxy-crm --scrittura` da Orders) ·
`MAIL_URL`/`MAIL_API_KEY`/`MAIL_UTENTE` (token da AI Mail → Impostazioni App) ·
`CALENDARIO_URL`/`CALENDARIO_API_KEY`/`CALENDARIO_UTENTE` (facoltative) ·
`HUB_URL`/`HUB_KEYS_TOKEN` (cassaforte, facoltative: le env fanno da riserva).

## Sviluppo

```bash
npm install
npm run db:condiviso -- ../deluxy-calendario/.env   # genera .env con schema=crm
npm run db:push
npm run dev                                          # http://localhost:3190
```

Prima di ogni commit: `npx tsc --noEmit` e `npm run build`. Deploy:
`npx vercel deploy --prod --yes` dalla cartella (progetto Vercel `deluxy-crm`,
region fra1).

Design: Deluxy Design System v1.0 (`src/app/tokens.css` copiato dalla fonte,
mai modificato a mano).

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
