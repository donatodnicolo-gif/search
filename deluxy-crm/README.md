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
  scritti dall'AI di Orders, gli ordini in una finestra («Vedi gli ordini»),
  ricorrenze (+ aggiunta di una o più → scrive in Orders), diario attività,
  mail, inviti. **Dal 10/09**: profilo di relazione (foto ridotta nel browser,
  professione, «come lo chiamiamo», punteggio 0-100), **note** multiple
  modificabili, **Programmazione** (cosa fare e quando, spinta al Calendario),
  cluster, **Schede unite** («Unisci» due chiavi di Orders: la scheda somma,
  Orders non cambia).
- **Ricorrenze** — chi festeggia oggi o nei prossimi 7/14/30/60/90 giorni
  (date prospettiche dagli ordini degli anni passati); ricerca, filtri
  (occasione, stato, per chi, sito), colonne ordinabili; i tipi delicati
  (condoglianze) sono segnalati e NON hanno il bottone degli auguri.
- **Calendario** — il mese con programmazioni, ricorrenze (da oggi in poi) ed
  eventi; elenco giorno per giorno con «Fatta».
- **Performance** — valore, cluster, segmenti, siti, città, classifiche
  (legge fino a 3000 clienti per spesa e lo dice).
- **Nuovo ordine** — cerca il cliente e apre il modulo dell'ordine (passa dal
  Customer Service).
- **Eventi** — occasioni speciali con lista invitati
  (da invitare → invitato → confermato → partecipato), invito via mail
  personalizzata, capienza, propagazione al Calendario; **liste collegate**
  (dall'11/09): si spuntano nel form, si vedono come chip nell'elenco, e dal
  dettaglio «Aggiungi gli invitati» mette in lista tutti i membri.
- **Mail** — registro invii; **Componi** con template e variabili `{{nome}}`,
  `{{evento}}`… risolte coi dati veri PRIMA dell'invio; **Template** CRUD con
  tre modelli di partenza.
- **Liste** — pubblici costruiti dall'AI da un brief, o **a condizioni**
  scelte a mano (stessa ricetta): liste di Orders per famiglia, sito, città,
  gusti, segmento, tipologia, canale di arrivo, ricorrenze in arrivo (tipo +
  giorni o mese), spesa, ordini, ordine medio, cliente da N anni, recenza,
  contatti; mail e WhatsApp a lista.
- **Template** — tabella con Modifica, Archivia (sparisce da Componi,
  si ripristina), Elimina.
- **Impostazioni** — stato MISURATO dei collegamenti (Orders, AI Mail,
  Customer Service, Calendario, Merchandising, database), coi nomi delle
  variabili da impostare; **soglie e cluster** dei clienti (spesa totale,
  spesa annua e frequenza stimate, punteggio): tutti i clienti restano
  dentro, le soglie evidenziano; **Utenti del CRM** (dall'11/09): chi entra,
  «Nuovo utente», «Abilita al CRM» / «Togli dal CRM» — tutto passa dall'API
  utenti del Hub (`HUB_KEYS_TOKEN`, scope `crm`), casa unica degli utenti.

Nei messaggi (Componi mail e WhatsApp) si può proporre un prodotto o una
collezione da **Merchandising** (`MERCH_URL`/`MERCH_API_KEY`, chiave di sola
lettura emessa da Merchandising → Impostazioni → chiavi API).

## Accesso

Password di team **oppure** SSO dal Deluxy Hub (`/api/sso`, app `"crm"`,
stesso `HUB_SSO_SECRET`). In produzione senza password l'app risponde **503**
(fail-closed). Il CRM non tiene utenti propri: gli utenti vivono nel Hub. In
locale senza `CRM_SESSION_SECRET` l'app è aperta (sviluppo).

**La password del team (dal 04/09/2026)** nasce in `CRM_APP_PASSWORD` e si
sposta nel database (tabella `PasswordTeam`, hash scrypt, riga unica) la prima
volta che qualcuno la cambia dall'app: da allora l'env non conta più. Si cambia
da **Impostazioni → Password del team** (serve quella attuale; dal Hub solo gli
admin) oppure dal login con **«Password dimenticata?» → «Mandami il link»**: il
link monouso (un'ora, solo l'hash a database) parte via AI Mail alla casella
`CRM_RESET_EMAIL` (o `MAIL_UTENTE` se manca) — sempre la stessa, nessun
indirizzo si digita nel modulo pubblico, che risponde sempre allo stesso modo.
Ogni cambio alza `versione`: le sessioni portano la versione con cui sono nate
(`gen`) e `sessioneCorrente()` (lato Node) chiude quelle vecchie — è la revoca.
Freni sul modulo pubblico: 3 richieste/ora in tutto, 5 per IP (solo l'hash
dell'IP a database).

## Variabili (nomi in `.env.example`)

`DATABASE_URL`/`DIRECT_URL` (schema crm) · `CRM_APP_PASSWORD` ·
`CRM_SESSION_SECRET` · `HUB_SSO_SECRET` · `ORDERS_URL`/`ORDERS_API_KEY`
(chiave con scrittura: `npm run chiave -- deluxy-crm --scrittura` da Orders) ·
`MAIL_URL`/`MAIL_API_KEY`/`MAIL_UTENTE` (token da AI Mail → Impostazioni App) ·
`CRM_RESET_EMAIL` (casella che riceve il link «password dimenticata»; se manca
si usa `MAIL_UTENTE`) ·
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

**Deroga 10/09/2026 — Ricorrenze: fino a 3000 righe lette da Orders e ordinate/filtrate in casa.**
Il Libro §8 vieta il `take` senza conteggio: qui conteggio e troncamento sono
dichiarati in pagina (`tutteLeRicorrenze`, tetto 6 × 500), ma ordinare dopo il
troncamento resta una scorciatoia. Motivo: l'API `eventi-clienti` di Orders non
ordina né filtra per sito/parola/per-chi, e a 30 giorni le ricorrenze sono 786.
**Soglia di rientro**: quando `troncato` compare in produzione, o quando le
ricorrenze a 30 giorni superano 1500, ordinamento e filtri si portano nell'API
di Orders. Condizioni del custode: banner del troncamento prima del ramo vuoto
(da fare), `PER_PAGINA` 100 resta, il Calendario non ripete l'elenco del mese
due volte (da fare: elenco «giorno per giorno» a richiesta).

## Custode della sicurezza (obbligatorio — 27/08/2026)

La sicurezza di questa app ha un **custode**: l'agente `architetto-sicurezza` (definito in `.claude/agents/architetto-sicurezza.md`), che applica il [Libro della Sicurezza](../deluxy-design-system/LIBRO-SICUREZZA.md).

- **Buchi di sicurezza e cambiamenti di una difesa NON si risolvono in autonomia**: si segnalano nel registro [`deluxy-design-system/SEGNALAZIONI-SICUREZZA.md`](../deluxy-design-system/SEGNALAZIONI-SICUREZZA.md), o si interpella l'agente.
- Ogni segnalazione passa prima dall'agente `sicurezza-ostile` (sopravvive solo con un percorso di sfruttamento: chi/quale chiamata/quale dato); la toppa si smonta come il difetto.
- Il custode valuta e decide: correzione locale, regola nuova del Libro (che vale **anche per le altre app**), o rischio accettato/deroga con il motivo scritto.
- Le deroghe di sicurezza di questa app vanno annotate qui sotto, con minaccia e data.
