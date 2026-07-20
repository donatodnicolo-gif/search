# deluxy-scout-manager

Plugin di **handoff e gestione** per **Deluxy Scout** — l'app mobile di prospezione commerciale
(React Native/Expo + Supabase + HubSpot) che vive in `deluxy-scout/` dentro il repo
`donatodnicolo-gif/search`.

Serve a far **riprendere il progetto a un altro agente** (o a te stesso più avanti) senza contesto
pregresso: contiene lo stato, l'architettura, le regole di prodotto e i comandi operativi.

## Cosa c'è dentro
- **Skill `deluxy-scout`** (`skills/deluxy-scout/SKILL.md`) — punto d'ingresso: regole d'oro, trappole d'ambiente, come fare le cose.
  - `reference/STATO_E_HANDOFF.md` — **leggi questo per primo**: cosa è fatto, cosa manca, comandi esatti per riprendere.
  - `reference/ARCHITETTURA.md` — struttura del codice, modello dati, mappature (dealstage, category rules), scelte di design.
- **Comandi**:
  - `/deluxy-scout-manager:stato` — riepilogo stato + prossimi passi.
  - `/deluxy-scout-manager:migrazione` — esegui SQL sul DB via Management API (no browser, no password DB).
  - `/deluxy-scout-manager:deploy-funzione` — deploy della Edge Function HubSpot.
  - `/deluxy-scout-manager:build-app` — passi per la build EAS.

## Come si usa
Installa il plugin in Claude Code (marketplace/locale), poi:
1. Invoca la skill `deluxy-scout` (o un comando) — Claude leggerà stato + architettura.
2. Segui `STATO_E_HANDOFF.md` per riprendere.

## Segreti
Questo plugin **non contiene segreti**. Le chiavi vere stanno in `deluxy-scout/.env` (gitignored)
e nei secret della Edge Function. Gli identificatori nel plugin (project ref, portal id, URL) non
sono sensibili. Non aggiungere mai token/chiavi ai file del plugin.

## Stato in breve (11 lug 2026)
✅ Codice validato (typecheck, test, bundle) · ✅ Supabase live (schema+RLS+seed) · ✅ HubSpot live
(service key, 7 proprietà, Edge Function deployata) — ⏳ mancano: utente login, chiavi Google Maps
(billing), build EAS, test end-to-end.
