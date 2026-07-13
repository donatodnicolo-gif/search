---
name: deluxy-scout
description: >-
  Sviluppa e riprendi "Deluxy Scout", l'app mobile di prospezione commerciale sul territorio
  (React Native/Expo + Supabase + HubSpot) che vive in deluxy-scout/ dentro il repo
  donatodnicolo-gif/search. Usala quando l'utente vuole continuare lo sviluppo, capire lo stato,
  eseguire migrazioni Supabase, deployare la Edge Function HubSpot, fare la build EAS, o
  riprendere il progetto da dove è stato lasciato. Trigger: "Deluxy Scout", "app venditori",
  "prospezione", "scout", "trattative def".
---

# Deluxy Scout

App mobile di prospezione commerciale per il Team Commerciale Deluxy (Milano). Mappa tutte le
attività del territorio con priorità e ipotesi di interesse pre-calcolate, registra le visite
(anche offline) e **alimenta HubSpot** (company + contatto + deal). Non sostituisce HubSpot: lo popola.

## Leggi PRIMA di lavorare
1. **`reference/STATO_E_HANDOFF.md`** — cosa è già fatto, cosa manca, e i comandi esatti per riprendere.
2. **`reference/ARCHITETTURA.md`** — struttura del codice, regole di prodotto invarianti, mappature.
3. Il codice è in **`deluxy-scout/`** (sotto-cartella del repo `search`). Il `README.md` lì dentro è la guida operativa.

## Regole d'oro (non violarle mai)
- La mappa mostra **tutte** le attività (mai filtrate via di default). Priorità P1 oro / P2 navy / P3 grigio.
- Le 3 linee **Clientelling, Concierge, Magazzino** sono in standby: **mai** come ipotesi primaria, solo cross-sell.
- I **segreti** stanno solo in `deluxy-scout/.env` (già in `.gitignore`) e nei secret della Edge Function. **Mai** committarli, mai metterli nei file del plugin o del repo.
- Palette: navy `#1B2A4A`, oro `#A6832B`, sfondo `#F2EFE8`.

## Ambiente (Windows) — trappole note
- **Node**: installato in `C:\Program Files\nodejs` ma **potrebbe non essere nel PATH** della sessione. Prependilo a ogni comando:
  `$env:Path = "$env:ProgramFiles\nodejs;$env:Path"` (PowerShell).
- **Dashboard Supabase nel browser**: Google Translate traduce la pagina e **crasha React**; inoltre un gestore di appunti **sovrascrive la clipboard**. → **Non** usare il SQL Editor del browser per le migrazioni. Usa gli **script** (Management API), vedi sotto.
- Per lo stesso motivo, quando leggi un token da una dashboard usa lo strumento `find` su un singolo campo (non scansionare storage/localStorage).

## Come fare le cose (comandi)
Tutti gli script sono in `deluxy-scout/scripts/`. Ricorda di prependere Node al PATH.

- **Eseguire SQL / migrazioni** (senza password DB, senza browser): `scripts/mgmt-query.mjs` con `SUPABASE_PAT` (Personal Access Token Supabase). Vedi `/deluxy-scout-manager:migrazione`.
- **Creare le proprietà custom HubSpot**: `scripts/hubspot-setup-properties.mjs` con `HUBSPOT_TOKEN`.
- **Importare lead da CSV**: `scripts/import-places.mjs` con `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`.
- **Deployare la Edge Function**: `npx supabase functions deploy hubspot-sync --project-ref <ref>` con `SUPABASE_ACCESS_TOKEN`. Vedi `/deluxy-scout-manager:deploy-funzione`.
- **Validare il codice**: `npx tsc --noEmit`, `npx jest`, `npx expo export --platform android` (bundle completo).
- **Build installabile**: EAS. Vedi `/deluxy-scout-manager:build-app`.

## Comandi disponibili
- `/deluxy-scout-manager:stato` — riepilogo di cosa è fatto e cosa manca.
- `/deluxy-scout-manager:migrazione` — esegui un file SQL sul DB via Management API.
- `/deluxy-scout-manager:deploy-funzione` — deploy della Edge Function HubSpot.
- `/deluxy-scout-manager:build-app` — passi per la build EAS.
